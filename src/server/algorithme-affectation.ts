import {
  Role,
  StatutAstreinte,
  ModeAttribution,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getDimancheFromSamedi,
  getPoidsCreneau,
} from "@/server/astreinte-creneaux";
import {
  chargerTypesJour,
  creneauxDisponiblesPour,
  type TypeJour,
} from "@/server/jours-feries";
import {
  calculerPointsCumulesAvecPropositions,
  calculerPointsCumulesTousIades,
} from "@/server/points";
import {
  ERREUR_MODE_LISSE_NON_IMPLEMENTE,
  getModeAttribution,
} from "@/server/parametre-algorithme";

export type PropositionAffectation = {
  date: string;
  ligneId: string;
  ligneNom: string;
  typeCreneau: TypeCreneau;
  iadeId: string | null;
  iadeNom: string | null;
  pointsAttribues: number;
  nonPourvu?: boolean;
  dejaPlanifie?: boolean;
  tirageAuSort?: boolean;
};

type IadeCandidate = {
  id: string;
  nom: string;
  prenom: string;
};

type DisponibiliteEntry = {
  date: Date;
  ligneId: string;
  typeCreneau: TypeCreneau;
};

type AstreinteExistante = {
  date: Date;
  ligneId: string;
  typeCreneau: TypeCreneau;
  iadeId: string;
  pointsAttribues: number;
  iade: { id: string; nom: string; prenom: string };
};

type AffectationCreneau = {
  date: Date;
  typeCreneau: TypeCreneau;
};

/**
 * Contexte de simulation (dry-run).
 *
 * ## Modèle de créneaux (7 valeurs TypeCreneau)
 *
 * Chaque jour à pourvoir expose 1 ou 2 créneaux via `creneauxDisponiblesPour(typeJour)`.
 * Chaque créneau attribué crédite **son propre** poids (PoidsCreneau ligne × typeCreneau exact).
 * Il n'existe plus de type combiné : la somme des points d'un week-end ou d'une 24h
 * est simplement l'addition des astreintes créées.
 *
 * ## Préférences de continuité (JOUR_NUIT / WEEKEND_48H)
 *
 * Ce ne sont **pas** des types de créneau. Ce sont des critères de **sélection** :
 * - JOUR_NUIT : si l'IADE est volontaire ET disponible sur jour+nuit du même jour,
 *   l'algorithme tente de lui attribuer les 2 créneaux d'un coup (moins-disant en points).
 * - WEEKEND_48H : idem sur les 4 créneaux samedi+d imanche (vrai samedi uniquement).
 *
 * Sans préférence (ou si la tentative groupée échoue), chaque créneau est attribué
 * indépendamment au moins-disant disponible sur CE créneau précis.
 *
 * ## Exclusion JOUR + NUIT sans préférence
 *
 * `iadesRetenusParJour` empêche qu'un même IADE reçoive un 2e créneau le même jour
 * via l'attribution indépendante (2b). La continuité jour+nuit n'est possible que
 * via une préférence explicite (2a) ou un week-end 48h (2c).
 */
type ContexteSimulation = {
  debut: Date;
  fin: Date;
  lignes: Array<{ id: string; nom: string; ordrePriorite: number }>;
  qualificationsParLigne: Map<string, IadeCandidate[]>;
  disponibilitesParIade: Map<string, DisponibiliteEntry[]>;
  preferences: Set<string>;
  astreintesExistantes: AstreinteExistante[];
  astreintesParExactSlot: Map<string, AstreinteExistante>;
  creneauxCouvertParLigneDate: Map<string, TypeCreneau[]>;
  typeJourParJour: Map<string, TypeJour>;
  poidsCache: Map<string, number>;
  pointsEnMemoire: Map<string, number>;
  anneesInitialisees: Set<number>;
  iadesRetenusParJour: Map<string, Set<string>>;
  propositions: PropositionAffectation[];
  weekends48hTraites: Set<string>;
};

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = normalizeUtcDay(start);
  const last = normalizeUtcDay(end);

  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function buildExactSlotKey(
  date: Date,
  ligneId: string,
  typeCreneau: TypeCreneau,
): string {
  return `${formatDateKey(date)}:${ligneId}:${typeCreneau}`;
}

function buildLigneDateKey(date: Date, ligneId: string): string {
  return `${formatDateKey(date)}:${ligneId}`;
}

function buildPointsKey(annee: number, iadeId: string): string {
  return `${annee}:${iadeId}`;
}

function buildPreferenceKey(
  iadeId: string,
  ligneId: string,
  date: Date,
  type: TypePreferenceContinuite,
): string {
  return `${iadeId}:${ligneId}:${formatDateKey(date)}:${type}`;
}

function isDisponible(
  iadeId: string,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
  disponibilitesParIade: Map<string, DisponibiliteEntry[]>,
): boolean {
  const entries = disponibilitesParIade.get(iadeId) ?? [];
  const day = date.getTime();

  return entries.some(
    (entry) =>
      entry.ligneId === ligneId &&
      entry.typeCreneau === typeCreneau &&
      entry.date.getTime() === day,
  );
}

function getCreneauxCouvert(
  ctx: ContexteSimulation,
  date: Date,
  ligneId: string,
): TypeCreneau[] {
  return (
    ctx.creneauxCouvertParLigneDate.get(buildLigneDateKey(date, ligneId)) ?? []
  );
}

function isSlotCouvert(
  ctx: ContexteSimulation,
  date: Date,
  ligneId: string,
  typeCreneau: TypeCreneau,
): boolean {
  return getCreneauxCouvert(ctx, date, ligneId).includes(typeCreneau);
}

function getAstreinteExistante(
  ctx: ContexteSimulation,
  date: Date,
  ligneId: string,
  typeCreneau: TypeCreneau,
): AstreinteExistante | undefined {
  return ctx.astreintesParExactSlot.get(
    buildExactSlotKey(date, ligneId, typeCreneau),
  );
}

function marquerSlotCouvert(
  ctx: ContexteSimulation,
  date: Date,
  ligneId: string,
  typeCreneau: TypeCreneau,
): void {
  const key = buildLigneDateKey(date, ligneId);
  const types = ctx.creneauxCouvertParLigneDate.get(key) ?? [];
  if (!types.includes(typeCreneau)) {
    types.push(typeCreneau);
    ctx.creneauxCouvertParLigneDate.set(key, types);
  }
}

function retenirIadePourJour(
  ctx: ContexteSimulation,
  date: Date,
  iadeId: string,
): void {
  const key = formatDateKey(date);
  if (!ctx.iadesRetenusParJour.has(key)) {
    ctx.iadesRetenusParJour.set(key, new Set());
  }
  ctx.iadesRetenusParJour.get(key)!.add(iadeId);
}

function isIadeRetenuCeJour(
  ctx: ContexteSimulation,
  date: Date,
  iadeId: string,
): boolean {
  return ctx.iadesRetenusParJour.get(formatDateKey(date))?.has(iadeId) ?? false;
}

/** IADE déjà affecté ce jour (simulation ou base) — bloque une 2e attribution indépendante. */
function isIadeOccupeCeJour(
  ctx: ContexteSimulation,
  date: Date,
  iadeId: string,
): boolean {
  if (isIadeRetenuCeJour(ctx, date, iadeId)) {
    return true;
  }

  const dayTime = date.getTime();
  return ctx.astreintesExistantes.some(
    (astreinte) =>
      astreinte.iadeId === iadeId && astreinte.date.getTime() === dayTime,
  );
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function selectIade(
  eligible: IadeCandidate[],
  pointsEnMemoire: Map<string, number>,
  annee: number,
): { chosen: IadeCandidate; tirageAuSort: boolean } {
  const sorted = [...eligible].sort((a, b) => {
    const diff =
      (pointsEnMemoire.get(buildPointsKey(annee, a.id)) ?? 0) -
      (pointsEnMemoire.get(buildPointsKey(annee, b.id)) ?? 0);

    if (diff !== 0) {
      return diff;
    }

    return (
      a.nom.localeCompare(b.nom, "fr") ||
      a.prenom.localeCompare(b.prenom, "fr")
    );
  });

  const minPoints =
    pointsEnMemoire.get(buildPointsKey(annee, sorted[0]!.id)) ?? 0;
  const tied = sorted.filter(
    (iade) =>
      (pointsEnMemoire.get(buildPointsKey(annee, iade.id)) ?? 0) === minPoints,
  );
  const tirageAuSort = tied.length > 1;

  return {
    chosen: tirageAuSort ? pickRandom(tied) : tied[0]!,
    tirageAuSort,
  };
}

async function initialiserPointsAnnee(
  annee: number,
  pointsEnMemoire: Map<string, number>,
  anneesInitialisees: Set<number>,
): Promise<void> {
  if (anneesInitialisees.has(annee)) {
    return;
  }

  const pointsAnnee = await calculerPointsCumulesTousIades(annee);

  for (const [iadeId, total] of pointsAnnee) {
    pointsEnMemoire.set(buildPointsKey(annee, iadeId), total);
  }

  anneesInitialisees.add(annee);
}

async function rafraichirPointsIadeEnMemoire(
  ctx: ContexteSimulation,
  iadeId: string,
  annee: number,
): Promise<void> {
  const total = await calculerPointsCumulesAvecPropositions(
    iadeId,
    annee,
    ctx.propositions,
  );
  ctx.pointsEnMemoire.set(buildPointsKey(annee, iadeId), total);
}

async function lirePoids(
  ctx: ContexteSimulation,
  ligneId: string,
  typeCreneau: TypeCreneau,
): Promise<number> {
  const key = `${ligneId}:${typeCreneau}`;
  if (!ctx.poidsCache.has(key)) {
    ctx.poidsCache.set(key, await getPoidsCreneau(ligneId, typeCreneau));
  }

  return ctx.poidsCache.get(key)!;
}

function formatIadeNom(iade: IadeCandidate | AstreinteExistante["iade"]): string {
  return `${iade.prenom} ${iade.nom}`;
}

function pousserProposition(
  ctx: ContexteSimulation,
  proposition: PropositionAffectation,
): void {
  ctx.propositions.push(proposition);

  if (proposition.iadeId && !proposition.nonPourvu && !proposition.dejaPlanifie) {
    const date = normalizeUtcDay(new Date(`${proposition.date}T00:00:00.000Z`));
    marquerSlotCouvert(ctx, date, proposition.ligneId, proposition.typeCreneau);
    retenirIadePourJour(ctx, date, proposition.iadeId);
  }
}

function pousserDejaPlanifie(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  typeCreneau: TypeCreneau,
  astreinte: AstreinteExistante,
): void {
  pousserProposition(ctx, {
    date: formatDateKey(date),
    ligneId: ligne.id,
    ligneNom: ligne.nom,
    typeCreneau,
    iadeId: astreinte.iadeId,
    iadeNom: formatIadeNom(astreinte.iade),
    pointsAttribues: astreinte.pointsAttribues,
    dejaPlanifie: true,
  });
}

function pousserNonPourvu(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  typeCreneau: TypeCreneau,
  poids: number,
): void {
  pousserProposition(ctx, {
    date: formatDateKey(date),
    ligneId: ligne.id,
    ligneNom: ligne.nom,
    typeCreneau,
    iadeId: null,
    iadeNom: null,
    pointsAttribues: poids,
    nonPourvu: true,
  });
}

function filtrerQualifiesDisponibles(
  ctx: ContexteSimulation,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
): IadeCandidate[] {
  const qualifiees = ctx.qualificationsParLigne.get(ligneId) ?? [];

  return qualifiees.filter((iade) =>
    isDisponible(
      iade.id,
      ligneId,
      date,
      typeCreneau,
      ctx.disponibilitesParIade,
    ),
  );
}

function aPreference(
  ctx: ContexteSimulation,
  iadeId: string,
  ligneId: string,
  date: Date,
  type: TypePreferenceContinuite,
): boolean {
  return ctx.preferences.has(buildPreferenceKey(iadeId, ligneId, date, type));
}

function estLibreSurJours(
  ctx: ContexteSimulation,
  iadeId: string,
  dates: Date[],
): boolean {
  return dates.every((date) => !isIadeOccupeCeJour(ctx, date, iadeId));
}

function estDisponibleSurCreneaux(
  ctx: ContexteSimulation,
  iadeId: string,
  ligneId: string,
  creneaux: AffectationCreneau[],
): boolean {
  return creneaux.every((creneau) =>
    isDisponible(
      iadeId,
      ligneId,
      creneau.date,
      creneau.typeCreneau,
      ctx.disponibilitesParIade,
    ),
  );
}

async function attribuerCreneau(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  typeCreneau: TypeCreneau,
  candidats: IadeCandidate[],
): Promise<boolean> {
  const poids = await lirePoids(ctx, ligne.id, typeCreneau);
  const eligibles = candidats.filter(
    (iade) => !isIadeOccupeCeJour(ctx, date, iade.id),
  );

  if (eligibles.length === 0) {
    pousserNonPourvu(ctx, date, ligne, typeCreneau, poids);
    return false;
  }

  const annee = date.getUTCFullYear();
  await initialiserPointsAnnee(
    annee,
    ctx.pointsEnMemoire,
    ctx.anneesInitialisees,
  );

  const { chosen, tirageAuSort } = selectIade(
    eligibles,
    ctx.pointsEnMemoire,
    annee,
  );

  pousserProposition(ctx, {
    date: formatDateKey(date),
    ligneId: ligne.id,
    ligneNom: ligne.nom,
    typeCreneau,
    iadeId: chosen.id,
    iadeNom: formatIadeNom(chosen),
    pointsAttribues: poids,
    tirageAuSort: tirageAuSort || undefined,
  });

  await rafraichirPointsIadeEnMemoire(ctx, chosen.id, annee);
  return true;
}

/**
 * Attribue plusieurs créneaux au même IADE (continuité 24h ou 48h).
 * Chaque créneau enregistre uniquement son poids ; le bonus de continuité
 * est recalculé dynamiquement pour l'équité de l'algorithme.
 */
async function attribuerGroupeCreneaux(
  ctx: ContexteSimulation,
  ligne: { id: string; nom: string },
  creneaux: AffectationCreneau[],
  candidats: IadeCandidate[],
): Promise<boolean> {
  if (creneaux.length === 0) {
    return false;
  }

  const datesUniques = [...new Set(creneaux.map((c) => c.date.getTime()))].map(
    (time) => new Date(time),
  );

  const eligibles = candidats.filter((iade) =>
    estLibreSurJours(ctx, iade.id, datesUniques),
  );

  if (eligibles.length === 0) {
    return false;
  }

  const annee = creneaux[0]!.date.getUTCFullYear();
  await initialiserPointsAnnee(
    annee,
    ctx.pointsEnMemoire,
    ctx.anneesInitialisees,
  );

  const { chosen, tirageAuSort } = selectIade(
    eligibles,
    ctx.pointsEnMemoire,
    annee,
  );

  const baseCreations = await Promise.all(
    creneaux.map(async (creneau) => ({
      date: creneau.date,
      ligneId: ligne.id,
      iadeId: chosen.id,
      typeCreneau: creneau.typeCreneau,
      pointsAttribues: await lirePoids(ctx, ligne.id, creneau.typeCreneau),
    })),
  );

  for (const creation of baseCreations) {
    pousserProposition(ctx, {
      date: formatDateKey(creation.date),
      ligneId: ligne.id,
      ligneNom: ligne.nom,
      typeCreneau: creation.typeCreneau,
      iadeId: chosen.id,
      iadeNom: formatIadeNom(chosen),
      pointsAttribues: creation.pointsAttribues,
      tirageAuSort: tirageAuSort || undefined,
    });
  }

  await rafraichirPointsIadeEnMemoire(ctx, chosen.id, annee);

  return true;
}

function traiterSlotsDejaPlanifies(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  creneaux: TypeCreneau[],
): void {
  for (const typeCreneau of creneaux) {
    if (isSlotCouvert(ctx, date, ligne.id, typeCreneau)) {
      continue;
    }

    const existante = getAstreinteExistante(ctx, date, ligne.id, typeCreneau);
    if (existante) {
      pousserDejaPlanifie(ctx, date, ligne, typeCreneau, existante);
    }
  }
}

/**
 * Préférence JOUR_NUIT : tente d'attribuer jour+nuit du même jour au même IADE.
 * Retombe sur false si aucun volontaire éligible (le caller fera 2b).
 */
async function tenterContinuite24h(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  creneauJour: TypeCreneau,
  creneauNuit: TypeCreneau,
): Promise<boolean> {
  if (
    isSlotCouvert(ctx, date, ligne.id, creneauJour) ||
    isSlotCouvert(ctx, date, ligne.id, creneauNuit)
  ) {
    return false;
  }

  const creneaux: AffectationCreneau[] = [
    { date, typeCreneau: creneauJour },
    { date, typeCreneau: creneauNuit },
  ];

  const candidats = (ctx.qualificationsParLigne.get(ligne.id) ?? []).filter(
    (iade) =>
      aPreference(
        ctx,
        iade.id,
        ligne.id,
        date,
        TypePreferenceContinuite.JOUR_NUIT,
      ) && estDisponibleSurCreneaux(ctx, iade.id, ligne.id, creneaux),
  );

  const attribue = await attribuerGroupeCreneaux(
    ctx,
    ligne,
    creneaux,
    candidats,
  );

  if (!attribue) {
    return false;
  }

  return true;
}

/**
 * Préférence WEEKEND_48H : tente d'attribuer les 4 créneaux du week-end
 * (sam. jour/nuit + dim. jour/nuit) au même IADE. Uniquement sur un vrai samedi.
 */
async function tenterContinuite48h(
  ctx: ContexteSimulation,
  samedi: Date,
  ligne: { id: string; nom: string },
): Promise<boolean> {
  const samediKey = formatDateKey(samedi);
  const traitementKey = `${samediKey}:${ligne.id}`;

  if (ctx.weekends48hTraites.has(traitementKey)) {
    return false;
  }

  ctx.weekends48hTraites.add(traitementKey);

  const typeSamedi = ctx.typeJourParJour.get(samediKey);
  if (typeSamedi !== "SAMEDI") {
    return false;
  }

  const dimanche = getDimancheFromSamedi(samedi);
  if (dimanche > ctx.fin) {
    return false;
  }

  const dimancheKey = formatDateKey(dimanche);
  const typeDimanche = ctx.typeJourParJour.get(dimancheKey);
  if (!typeDimanche) {
    return false;
  }

  const creneauxSamedi = creneauxDisponiblesPour(typeSamedi);
  const creneauxDimanche = creneauxDisponiblesPour(typeDimanche);

  if (creneauxSamedi.length !== 2 || creneauxDimanche.length !== 2) {
    return false;
  }

  const [samediJour, samediNuit] = creneauxSamedi;
  const [dimancheJour, dimancheNuit] = creneauxDimanche;

  const tousLesCreneaux: AffectationCreneau[] = [
    { date: samedi, typeCreneau: samediJour },
    { date: samedi, typeCreneau: samediNuit },
    { date: dimanche, typeCreneau: dimancheJour },
    { date: dimanche, typeCreneau: dimancheNuit },
  ];

  if (
    tousLesCreneaux.some((creneau) =>
      isSlotCouvert(ctx, creneau.date, ligne.id, creneau.typeCreneau),
    )
  ) {
    return false;
  }

  const candidats = (ctx.qualificationsParLigne.get(ligne.id) ?? []).filter(
    (iade) =>
      aPreference(
        ctx,
        iade.id,
        ligne.id,
        samedi,
        TypePreferenceContinuite.WEEKEND_48H,
      ) && estDisponibleSurCreneaux(ctx, iade.id, ligne.id, tousLesCreneaux),
  );

  return attribuerGroupeCreneaux(ctx, ligne, tousLesCreneaux, candidats);
}

async function traiterCreneauxIndependants(
  ctx: ContexteSimulation,
  date: Date,
  ligne: { id: string; nom: string },
  creneaux: TypeCreneau[],
): Promise<void> {
  for (const typeCreneau of creneaux) {
    if (isSlotCouvert(ctx, date, ligne.id, typeCreneau)) {
      continue;
    }

    const candidats = filtrerQualifiesDisponibles(
      ctx,
      ligne.id,
      date,
      typeCreneau,
    );
    await attribuerCreneau(ctx, date, ligne, typeCreneau, candidats);
  }
}

async function traiterJour(
  ctx: ContexteSimulation,
  jour: Date,
  ligne: { id: string; nom: string },
): Promise<void> {
  const typeJour = ctx.typeJourParJour.get(formatDateKey(jour));
  if (!typeJour) {
    return;
  }

  const creneaux = creneauxDisponiblesPour(typeJour);
  traiterSlotsDejaPlanifies(ctx, jour, ligne, creneaux);

  if (creneaux.length === 1) {
    const [typeCreneau] = creneaux;
    if (!isSlotCouvert(ctx, jour, ligne.id, typeCreneau)) {
      const candidats = filtrerQualifiesDisponibles(
        ctx,
        ligne.id,
        jour,
        typeCreneau,
      );
      await attribuerCreneau(ctx, jour, ligne, typeCreneau, candidats);
    }
    return;
  }

  const [creneauJour, creneauNuit] = creneaux;
  const jourLibre =
    !isSlotCouvert(ctx, jour, ligne.id, creneauJour) &&
    !isSlotCouvert(ctx, jour, ligne.id, creneauNuit);

  if (jourLibre) {
    const attribue24h = await tenterContinuite24h(
      ctx,
      jour,
      ligne,
      creneauJour,
      creneauNuit,
    );
    if (attribue24h) {
      return;
    }
  }

  await traiterCreneauxIndependants(ctx, jour, ligne, creneaux);
}

export async function genererPlanningAutomatique(
  dateDebut: Date,
  dateFin: Date,
): Promise<PropositionAffectation[]> {
  const debut = normalizeUtcDay(dateDebut);
  const fin = normalizeUtcDay(dateFin);

  if (fin < debut) {
    throw new Error("dateFin doit être postérieure ou égale à dateDebut.");
  }

  const modeAttribution = await getModeAttribution();
  if (modeAttribution === ModeAttribution.LISSE) {
    throw new Error(ERREUR_MODE_LISSE_NON_IMPLEMENTE);
  }

  const jours = eachDayInclusive(debut, fin);

  const [
    lignes,
    qualifications,
    disponibilites,
    astreintesExistantes,
    preferencesContinuite,
  ] = await Promise.all([
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true, ordrePriorite: true },
    }),
    prisma.qualification.findMany({
      where: {
        ligne: { actif: true },
        iade: { role: Role.IADE, actif: true },
      },
      include: {
        iade: { select: { id: true, nom: true, prenom: true } },
      },
    }),
    prisma.disponibilite.findMany({
      where: {
        date: { gte: debut, lte: fin },
        iade: { role: Role.IADE, actif: true },
      },
      select: {
        iadeId: true,
        date: true,
        ligneId: true,
        typeCreneau: true,
      },
    }),
    prisma.astreinte.findMany({
      where: {
        date: { gte: debut, lte: fin },
        statut: { not: StatutAstreinte.ANNULEE },
      },
      select: {
        date: true,
        ligneId: true,
        typeCreneau: true,
        iadeId: true,
        pointsAttribues: true,
        iade: { select: { id: true, nom: true, prenom: true } },
      },
    }),
    prisma.preferenceContinuite.findMany({
      where: {
        dateDebut: { gte: debut, lte: fin },
        iade: { role: Role.IADE, actif: true },
        ligne: { actif: true },
      },
      select: {
        iadeId: true,
        ligneId: true,
        dateDebut: true,
        type: true,
      },
    }),
  ]);

  const qualificationsParLigne = new Map<string, IadeCandidate[]>();
  for (const qualification of qualifications) {
    if (!qualificationsParLigne.has(qualification.ligneId)) {
      qualificationsParLigne.set(qualification.ligneId, []);
    }
    qualificationsParLigne.get(qualification.ligneId)!.push({
      id: qualification.iade.id,
      nom: qualification.iade.nom,
      prenom: qualification.iade.prenom,
    });
  }

  const disponibilitesParIade = new Map<string, DisponibiliteEntry[]>();
  for (const disponibilite of disponibilites) {
    if (!disponibilitesParIade.has(disponibilite.iadeId)) {
      disponibilitesParIade.set(disponibilite.iadeId, []);
    }
    disponibilitesParIade.get(disponibilite.iadeId)!.push({
      date: normalizeUtcDay(disponibilite.date),
      ligneId: disponibilite.ligneId,
      typeCreneau: disponibilite.typeCreneau,
    });
  }

  const preferences = new Set<string>();
  for (const preference of preferencesContinuite) {
    preferences.add(
      buildPreferenceKey(
        preference.iadeId,
        preference.ligneId,
        normalizeUtcDay(preference.dateDebut),
        preference.type,
      ),
    );
  }

  const astreintesNormalisees: AstreinteExistante[] = astreintesExistantes.map(
    (astreinte) => ({
      ...astreinte,
      date: normalizeUtcDay(astreinte.date),
    }),
  );

  const astreintesParExactSlot = new Map<string, AstreinteExistante>();
  const creneauxCouvertParLigneDate = new Map<string, TypeCreneau[]>();

  for (const astreinte of astreintesNormalisees) {
    astreintesParExactSlot.set(
      buildExactSlotKey(astreinte.date, astreinte.ligneId, astreinte.typeCreneau),
      astreinte,
    );
    const key = buildLigneDateKey(astreinte.date, astreinte.ligneId);
    const types = creneauxCouvertParLigneDate.get(key) ?? [];
    if (!types.includes(astreinte.typeCreneau)) {
      types.push(astreinte.typeCreneau);
      creneauxCouvertParLigneDate.set(key, types);
    }
  }

  const typeJourParJour = await chargerTypesJour(jours);

  const ctx: ContexteSimulation = {
    debut,
    fin,
    lignes,
    qualificationsParLigne,
    disponibilitesParIade,
    preferences,
    astreintesExistantes: astreintesNormalisees,
    astreintesParExactSlot,
    creneauxCouvertParLigneDate,
    typeJourParJour,
    poidsCache: new Map(),
    pointsEnMemoire: new Map(),
    anneesInitialisees: new Set(),
    iadesRetenusParJour: new Map(),
    propositions: [],
    weekends48hTraites: new Set(),
  };

  for (const ligne of lignes) {
    for (const jour of jours) {
      if (ctx.typeJourParJour.get(formatDateKey(jour)) === "SAMEDI") {
        await tenterContinuite48h(ctx, jour, ligne);
      }
    }

    for (const jour of jours) {
      await traiterJour(ctx, jour, ligne);
    }
  }

  return ctx.propositions.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) {
      return dateCmp;
    }

    const ligneCmp = a.ligneNom.localeCompare(b.ligneNom, "fr");
    if (ligneCmp !== 0) {
      return ligneCmp;
    }

    return a.typeCreneau.localeCompare(b.typeCreneau);
  });
}

/** Résumé utile pour les scripts de test manuel. */
export function resumerPropositions(propositions: PropositionAffectation[]) {
  const pourvues = propositions.filter(
    (p) => !p.nonPourvu && !p.dejaPlanifie,
  );
  const nonPourvues = propositions.filter((p) => p.nonPourvu);
  const dejaPlanifiees = propositions.filter((p) => p.dejaPlanifie);
  const tirages = propositions.filter((p) => p.tirageAuSort);

  return {
    total: propositions.length,
    pourvues: pourvues.length,
    nonPourvues: nonPourvues.length,
    dejaPlanifiees: dejaPlanifiees.length,
    tiragesAuSort: tirages.length,
  };
}
