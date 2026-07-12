import {
  Role,
  TypeBonusContinuite,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PropositionAffectation } from "@/server/algorithme-affectation";
import {
  estCreneauJour,
  estCreneauNuit,
  getDimancheFromSamedi,
} from "@/server/astreinte-creneaux";
import {
  aWeekend48hComplet,
  chargerBonusContinuiteParLigne,
  paireJourNuit,
  typesWeekend48h,
} from "@/server/bonus-continuite";
import { chargerSeuilsEcartAberrantParLigne } from "@/server/parametre-algorithme";
import { formatDateKey } from "@/server/jours-feries";
import {
  calculerPointsFinauxDepuisContexte,
  chargerAstreintesPointsParIade,
  propositionComptabilisee,
  type AstreintePointsRow,
  type PropositionPointsInput,
} from "@/server/points";

export type BlocType = "JOUR_NUIT" | "WEEKEND_48H";

export type Bloc = {
  creneaux: PropositionAffectation[];
  iadeId: string;
  ligneId: string;
  type?: BlocType;
};

export type PreferenceContinuiteIndex = Set<string>;

function buildPreferenceKey(
  iadeId: string,
  ligneId: string,
  date: Date,
  type: TypePreferenceContinuite,
): string {
  return `${iadeId}:${ligneId}:${formatDateKey(date)}:${type}`;
}

function buildPropositionSlotKey(proposition: PropositionAffectation): string {
  return `${proposition.date}:${proposition.ligneId}:${proposition.typeCreneau}`;
}

function propositionComptable(
  proposition: PropositionAffectation,
): proposition is PropositionAffectation & { iadeId: string } {
  return (
    !!proposition.iadeId &&
    !proposition.nonPourvu &&
    !proposition.dejaPlanifie
  );
}

function samediDuWeekend(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const day = date.getUTCDay();

  if (day === 6) {
    return dateStr;
  }

  if (day === 0) {
    const samedi = new Date(date);
    samedi.setUTCDate(samedi.getUTCDate() - 1);
    return formatDateKey(samedi);
  }

  return dateStr;
}

export function buildPreferenceContinuiteIndex(
  preferences: Array<{
    iadeId: string;
    ligneId: string;
    dateDebut: Date;
    type: TypePreferenceContinuite;
  }>,
): PreferenceContinuiteIndex {
  return new Set(
    preferences.map((preference) =>
      buildPreferenceKey(
        preference.iadeId,
        preference.ligneId,
        preference.dateDebut,
        preference.type,
      ),
    ),
  );
}

export async function chargerPreferenceContinuiteIndex(
  propositions: PropositionAffectation[],
): Promise<PreferenceContinuiteIndex> {
  const iadeIds = [
    ...new Set(
      propositions
        .filter(propositionComptable)
        .map((proposition) => proposition.iadeId),
    ),
  ];

  if (iadeIds.length === 0) {
    return new Set();
  }

  const preferences = await prisma.preferenceContinuite.findMany({
    where: { iadeId: { in: iadeIds } },
    select: {
      iadeId: true,
      ligneId: true,
      dateDebut: true,
      type: true,
    },
  });

  return buildPreferenceContinuiteIndex(preferences);
}

function aPreference(
  index: PreferenceContinuiteIndex,
  iadeId: string,
  ligneId: string,
  date: Date,
  type: TypePreferenceContinuite,
): boolean {
  return index.has(buildPreferenceKey(iadeId, ligneId, date, type));
}

function grouperPropositionsComptables(
  propositions: PropositionAffectation[],
): Map<string, PropositionAffectation & { iadeId: string }> {
  const map = new Map<string, PropositionAffectation & { iadeId: string }>();

  for (const proposition of propositions) {
    if (!propositionComptable(proposition)) {
      continue;
    }

    map.set(buildPropositionSlotKey(proposition), proposition);
  }

  return map;
}

/**
 * Identifie les blocs de continuité (24h ou 48h) dans un résultat glouton,
 * à partir des préférences déclarées. Les autres créneaux restent en blocs unitaires.
 */
export function detecterBlocsContinuite(
  propositions: PropositionAffectation[],
  preferenceIndex: PreferenceContinuiteIndex,
): Bloc[] {
  const slots = grouperPropositionsComptables(propositions);
  const consommes = new Set<string>();
  const blocs: Bloc[] = [];

  const parWeekend = new Map<
    string,
    Array<PropositionAffectation & { iadeId: string }>
  >();

  for (const proposition of slots.values()) {
    const day = new Date(`${proposition.date}T00:00:00.000Z`).getUTCDay();
    if (day !== 6 && day !== 0) {
      continue;
    }

    const samediKey = samediDuWeekend(proposition.date);
    const groupKey = `${proposition.iadeId}:${proposition.ligneId}:${samediKey}`;
    const groupe = parWeekend.get(groupKey) ?? [];
    groupe.push(proposition);
    parWeekend.set(groupKey, groupe);
  }

  for (const [groupKey, groupe] of parWeekend) {
    const [iadeId, ligneId, samediKey] = groupKey.split(":");
    const types = groupe.map((entry) => entry.typeCreneau);

    if (!aWeekend48hComplet(types)) {
      continue;
    }

    const samedi = new Date(`${samediKey}T00:00:00.000Z`);
    if (
      !aPreference(
        preferenceIndex,
        iadeId,
        ligneId,
        samedi,
        TypePreferenceContinuite.WEEKEND_48H,
      )
    ) {
      continue;
    }

    const dimancheKey = formatDateKey(getDimancheFromSamedi(samedi));
    const [jourSam, nuitSam, jourDim, nuitDim] = typesWeekend48h();
    const slotsAttendus = [
      { date: samediKey, type: jourSam },
      { date: samediKey, type: nuitSam },
      { date: dimancheKey, type: jourDim },
      { date: dimancheKey, type: nuitDim },
    ];

    const creneauxBloc: Array<PropositionAffectation & { iadeId: string }> = [];

    for (const slot of slotsAttendus) {
      const match = groupe.find(
        (entry) =>
          entry.date === slot.date && entry.typeCreneau === slot.type,
      );

      if (!match) {
        creneauxBloc.length = 0;
        break;
      }

      creneauxBloc.push(match);
    }

    if (creneauxBloc.length !== 4) {
      continue;
    }

    if (
      !creneauxBloc.every(
        (entry) => !consommes.has(buildPropositionSlotKey(entry)),
      )
    ) {
      continue;
    }

    for (const entry of creneauxBloc) {
      consommes.add(buildPropositionSlotKey(entry));
    }

    blocs.push({
      creneaux: creneauxBloc,
      iadeId,
      ligneId,
      type: "WEEKEND_48H",
    });
  }

  const parJour = new Map<
    string,
    Array<PropositionAffectation & { iadeId: string }>
  >();

  for (const proposition of slots.values()) {
    if (consommes.has(buildPropositionSlotKey(proposition))) {
      continue;
    }

    const groupKey = `${proposition.iadeId}:${proposition.ligneId}:${proposition.date}`;
    const groupe = parJour.get(groupKey) ?? [];
    groupe.push(proposition);
    parJour.set(groupKey, groupe);
  }

  for (const [groupKey, groupe] of parJour) {
    if (groupe.length < 2) {
      continue;
    }

    const [iadeId, ligneId, dateKey] = groupKey.split(":");
    const types = groupe.map((entry) => entry.typeCreneau);

    if (!paireJourNuit(types)) {
      continue;
    }

    const date = new Date(`${dateKey}T00:00:00.000Z`);
    if (
      !aPreference(
        preferenceIndex,
        iadeId,
        ligneId,
        date,
        TypePreferenceContinuite.JOUR_NUIT,
      )
    ) {
      continue;
    }

    const creneauxBloc = groupe.filter(
      (entry) =>
        estCreneauJour(entry.typeCreneau) ||
        (estCreneauNuit(entry.typeCreneau) &&
          entry.typeCreneau !== TypeCreneau.NUIT_SEMAINE),
    );

    if (creneauxBloc.length < 2) {
      continue;
    }

    const jour = creneauxBloc.find((entry) => estCreneauJour(entry.typeCreneau));
    const nuit = creneauxBloc.find(
      (entry) =>
        estCreneauNuit(entry.typeCreneau) &&
        entry.typeCreneau !== TypeCreneau.NUIT_SEMAINE,
    );

    if (!jour || !nuit) {
      continue;
    }

    if (
      consommes.has(buildPropositionSlotKey(jour)) ||
      consommes.has(buildPropositionSlotKey(nuit))
    ) {
      continue;
    }

    consommes.add(buildPropositionSlotKey(jour));
    consommes.add(buildPropositionSlotKey(nuit));

    blocs.push({
      creneaux: [jour, nuit],
      iadeId,
      ligneId,
      type: "JOUR_NUIT",
    });
  }

  for (const proposition of slots.values()) {
    if (consommes.has(buildPropositionSlotKey(proposition))) {
      continue;
    }

    consommes.add(buildPropositionSlotKey(proposition));
    blocs.push({
      creneaux: [proposition],
      iadeId: proposition.iadeId,
      ligneId: proposition.ligneId,
    });
  }

  return blocs;
}

/** Variance populationnelle sur les IADE qualifiés pour la ligne concernée. */
export function calculerVariance(
  pointsParIade: Map<string, number>,
  iadeIdsQualifies: Iterable<string>,
): number {
  const values = [...iadeIdsQualifies].map(
    (iadeId) => pointsParIade.get(iadeId) ?? 0,
  );

  if (values.length === 0) {
    return 0;
  }

  const moyenne = values.reduce((total, value) => total + value, 0) / values.length;
  return (
    values.reduce((total, value) => total + (value - moyenne) ** 2, 0) /
    values.length
  );
}

function propositionVersInput(
  proposition: PropositionAffectation,
): PropositionPointsInput {
  return {
    date: proposition.date,
    iadeId: proposition.iadeId,
    ligneId: proposition.ligneId,
    typeCreneau: proposition.typeCreneau,
    pointsAttribues: proposition.pointsAttribues,
    nonPourvu: proposition.nonPourvu,
    dejaPlanifie: proposition.dejaPlanifie,
  };
}

/**
 * Points finaux = astreintes en base + propositions simulées, avec bonus de continuité
 * recalculé via la même logique que points.ts (pas de double implémentation).
 */
export async function calculerPointsFinaux(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
): Promise<Map<string, number>> {
  const annees = new Set<number>();

  for (const proposition of propositions) {
    if (!propositionComptabilisee(propositionVersInput(proposition))) {
      continue;
    }

    const annee = Number(proposition.date.slice(0, 4));
    if (Number.isFinite(annee)) {
      annees.add(annee);
    }
  }

  if (annees.size === 0) {
    annees.add(new Date().getUTCFullYear());
  }

  const iadeIds = [...pointsDepart.keys()];
  const [bonusParLigne, ...astreintesParAnnee] = await Promise.all([
    chargerBonusContinuiteParLigne(),
    ...[...annees].map((annee) => chargerAstreintesPointsParIade(annee, iadeIds)),
  ]);

  const astreintesExistantesParIade = new Map<string, AstreintePointsRow[]>(
    iadeIds.map((id) => [id, []]),
  );

  for (const map of astreintesParAnnee) {
    for (const [iadeId, rows] of map) {
      const liste = astreintesExistantesParIade.get(iadeId) ?? [];
      liste.push(...rows);
      astreintesExistantesParIade.set(iadeId, liste);
    }
  }

  return calculerPointsFinauxDepuisContexte(
    propositions.map(propositionVersInput),
    pointsDepart,
    astreintesExistantesParIade,
    bonusParLigne,
  );
}

export function calculerPointsFinauxSync(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  astreintesExistantesParIade: Map<string, AstreintePointsRow[]>,
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>,
): Map<string, number> {
  return calculerPointsFinauxDepuisContexte(
    propositions.map(propositionVersInput),
    pointsDepart,
    astreintesExistantesParIade,
    bonusParLigne,
  );
}

export type ContexteReoptimisation = {
  preferenceIndex: PreferenceContinuiteIndex;
  qualificationsParLigne: Map<string, Set<string>>;
  disponibilitesParIade: Map<string, Set<string>>;
  iadesParId: Map<string, { nom: string; prenom: string }>;
  lignesParId: Map<string, { nom: string }>;
  astreintesExistantesParIade: Map<string, AstreintePointsRow[]>;
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>;
  seuilsEcartAberrantParLigne: Map<string, number>;
};

export type CreneauResume = {
  date: string;
  typeCreneau: TypeCreneau;
};

export type EchangeReoptimisation = {
  passe: 1 | 2;
  ligneId: string;
  ligneNom: string;
  iadeAId: string;
  iadeANom: string;
  iadeBId: string;
  iadeBNom: string;
  creneauxA: CreneauResume[];
  creneauxB: CreneauResume[];
};

export type BlocContinuiteCasse = {
  ligneId: string;
  ligneNom: string;
  type: BlocType;
  iadeId: string;
  iadeNom: string;
  creneaux: CreneauResume[];
};

/** Journal fonctionnel de la réoptimisation lissée (affichage simulation, Prompt 4). */
export type JournalReoptimisationLisse = {
  echanges: EchangeReoptimisation[];
  blocsCasses: BlocContinuiteCasse[];
};

export type ResultatReoptimisationLisse = {
  propositions: PropositionAffectation[];
  journal: JournalReoptimisationLisse;
};

export type ReoptimiserParEchangesOptions = {
  maxIterations?: number;
};

export type ReoptimiserParEchangesSyncOptions = ReoptimiserParEchangesOptions & {
  contexte: ContexteReoptimisation;
};

const MAX_ITERATIONS_DEFAUT = 300;

/**
 * Tolérance sur la variance globale en Passe 2 : un échange qui réduit l'écart
 * max−min d'une ligne n'est appliqué que si la variance totale (fin Passe 1)
 * n'augmente pas au-delà de cette marge (arrondis flottants).
 */
export const EPSILON_VARIANCE_PASSE2 = 1e-6;

function formatIadeNom(iade: { prenom: string; nom: string }): string {
  return `${iade.prenom} ${iade.nom}`;
}

function nomIade(contexte: ContexteReoptimisation, iadeId: string): string {
  const iade = contexte.iadesParId.get(iadeId);
  return iade ? formatIadeNom(iade) : iadeId;
}

function nomLigne(contexte: ContexteReoptimisation, ligneId: string): string {
  return contexte.lignesParId.get(ligneId)?.nom ?? ligneId;
}

function creneauxVersResume(
  creneaux: PropositionAffectation[],
): CreneauResume[] {
  return creneaux.map((creneau) => ({
    date: creneau.date,
    typeCreneau: creneau.typeCreneau,
  }));
}

function estBlocContinuite(bloc: Bloc): bloc is Bloc & { type: BlocType } {
  return bloc.type !== undefined;
}

function calculerPointsFinauxPourPropositions(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
): Map<string, number> {
  return calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    contexte.astreintesExistantesParIade,
    contexte.bonusParLigne,
  );
}

function calculerEcartLigne(
  pointsParIade: Map<string, number>,
  qualifies: Set<string>,
): number {
  if (qualifies.size === 0) {
    return 0;
  }

  const values = [...qualifies].map((iadeId) => pointsParIade.get(iadeId) ?? 0);
  return Math.max(...values) - Math.min(...values);
}

function identifierIadesExtremes(
  pointsParIade: Map<string, number>,
  qualifies: Set<string>,
): { iadeHaut: string; iadeBas: string } | null {
  if (qualifies.size < 2) {
    return null;
  }

  let iadeHaut = "";
  let iadeBas = "";
  let maxPoints = Number.NEGATIVE_INFINITY;
  let minPoints = Number.POSITIVE_INFINITY;

  for (const iadeId of qualifies) {
    const points = pointsParIade.get(iadeId) ?? 0;

    if (points > maxPoints) {
      maxPoints = points;
      iadeHaut = iadeId;
    }

    if (points < minPoints) {
      minPoints = points;
      iadeBas = iadeId;
    }
  }

  if (!iadeHaut || !iadeBas || iadeHaut === iadeBas) {
    return null;
  }

  return { iadeHaut, iadeBas };
}

function blocImpliqueCreneauCible(
  bloc: Bloc,
  creneauxCibles: Set<string>,
): boolean {
  return bloc.creneaux.some((creneau) =>
    creneauxCibles.has(buildPropositionSlotKey(creneau)),
  );
}

function creerJournalVide(): JournalReoptimisationLisse {
  return { echanges: [], blocsCasses: [] };
}

function enregistrerEchange(
  journal: JournalReoptimisationLisse,
  passe: 1 | 2,
  blocA: Bloc,
  blocB: Bloc,
  contexte: ContexteReoptimisation,
): void {
  journal.echanges.push({
    passe,
    ligneId: blocA.ligneId,
    ligneNom: nomLigne(contexte, blocA.ligneId),
    iadeAId: getIadeIdBloc(blocA),
    iadeANom: nomIade(contexte, getIadeIdBloc(blocA)),
    iadeBId: getIadeIdBloc(blocB),
    iadeBNom: nomIade(contexte, getIadeIdBloc(blocB)),
    creneauxA: creneauxVersResume(blocA.creneaux),
    creneauxB: creneauxVersResume(blocB.creneaux),
  });
}

function cleBlocContinuite(bloc: Bloc & { type: BlocType }): string {
  const slots = bloc.creneaux
    .map((creneau) => buildPropositionSlotKey(creneau))
    .sort()
    .join("|");

  return `${bloc.ligneId}:${bloc.type}:${bloc.iadeId}:${slots}`;
}

function enregistrerBlocsCassesApresEchange(
  journal: JournalReoptimisationLisse,
  blocA: Bloc,
  blocB: Bloc,
  continuiteParSlot: Map<string, Bloc & { type: BlocType }>,
  contexte: ContexteReoptimisation,
): void {
  const deja = new Set(journal.blocsCasses.map((entry) => `${entry.ligneId}:${entry.type}:${entry.iadeId}:${entry.creneaux.map((c) => c.date + c.typeCreneau).join("|")}`));

  for (const creneau of [...blocA.creneaux, ...blocB.creneaux]) {
    const original = continuiteParSlot.get(buildPropositionSlotKey(creneau));

    if (!original) {
      continue;
    }

    const key = cleBlocContinuite(original);

    if (deja.has(key)) {
      continue;
    }

    deja.add(key);
    journal.blocsCasses.push({
      ligneId: original.ligneId,
      ligneNom: nomLigne(contexte, original.ligneId),
      type: original.type,
      iadeId: original.iadeId,
      iadeNom: nomIade(contexte, original.iadeId),
      creneaux: creneauxVersResume(original.creneaux),
    });
  }
}

function construireBlocsRecherchePasse2(
  blocs: Bloc[],
  ligneId: string,
  iadeHaut: string,
  iadeBas: string,
): {
  blocsRecherche: Bloc[];
  creneauxCibles: Set<string>;
  continuiteParSlot: Map<string, Bloc & { type: BlocType }>;
} {
  const blocsRecherche: Bloc[] = [];
  const creneauxCibles = new Set<string>();
  const continuiteParSlot = new Map<string, Bloc & { type: BlocType }>();

  for (const bloc of blocs) {
    if (bloc.ligneId !== ligneId) {
      continue;
    }

    const iadeBloc = getIadeIdBloc(bloc);

    if (
      estBlocContinuite(bloc) &&
      (iadeBloc === iadeHaut || iadeBloc === iadeBas)
    ) {
      for (const creneau of bloc.creneaux) {
        const slotKey = buildPropositionSlotKey(creneau);
        creneauxCibles.add(slotKey);
        continuiteParSlot.set(slotKey, bloc);

        blocsRecherche.push({
          creneaux: [creneau],
          iadeId: creneau.iadeId!,
          ligneId: bloc.ligneId,
        });
      }

      continue;
    }

    blocsRecherche.push(bloc);
  }

  return { blocsRecherche, creneauxCibles, continuiteParSlot };
}

function rechercherMeilleurEchange(
  propositions: PropositionAffectation[],
  blocs: Bloc[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  options: {
    passe: 1 | 2;
    ligneIds: Set<string>;
    scoreActuel: number;
    comparerScore: (
      propositions: PropositionAffectation[],
    ) => number;
    filtrePaire?: (blocA: Bloc, blocB: Bloc) => boolean;
  },
): {
  echange: { blocA: Bloc; blocB: Bloc } | null;
  score: number;
} {
  let meilleurEchange: { blocA: Bloc; blocB: Bloc } | null = null;
  let meilleurScore = options.scoreActuel;

  for (let indexA = 0; indexA < blocs.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < blocs.length; indexB += 1) {
      const blocA = blocs[indexA]!;
      const blocB = blocs[indexB]!;

      if (blocA.ligneId !== blocB.ligneId) {
        continue;
      }

      if (!options.ligneIds.has(blocA.ligneId)) {
        continue;
      }

      if (getIadeIdBloc(blocA) === getIadeIdBloc(blocB)) {
        continue;
      }

      if (options.filtrePaire && !options.filtrePaire(blocA, blocB)) {
        continue;
      }

      if (!echangeBlocsFaisable(blocA, blocB, contexte)) {
        continue;
      }

      const simule = simulerEchangeSurPropositions(
        propositions,
        blocA,
        blocB,
        contexte,
      );

      if (!simule) {
        continue;
      }

      const scoreSimule = options.comparerScore(simule);

      if (scoreSimule < meilleurScore) {
        meilleurScore = scoreSimule;
        meilleurEchange = { blocA, blocB };
      }
    }
  }

  return { echange: meilleurEchange, score: meilleurScore };
}

export type ResultatRecherchePasse2 = {
  echange: { blocA: Bloc; blocB: Bloc } | null;
  ecartApres: number;
  varianceApres: number;
};

/**
 * Sélection Passe 2 : parmi les échanges qui réduisent l'écart max−min de la ligne
 * ET ne dégradent pas la variance globale (référence = fin Passe 1), retient celui
 * qui minimise la variance — pas celui qui maximise la réduction d'écart.
 */
function rechercherMeilleurEchangePasse2(
  propositions: PropositionAffectation[],
  blocs: Bloc[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  options: {
    ligneId: string;
    lignesCiblesVariance: Set<string>;
    qualifies: Set<string>;
    ecartActuel: number;
    varianceReferencePasse1: number;
    creneauxCibles: Set<string>;
  },
): ResultatRecherchePasse2 {
  let meilleurEchange: { blocA: Bloc; blocB: Bloc } | null = null;
  let meilleurEcart = options.ecartActuel;
  let meilleureVariance = Number.POSITIVE_INFINITY;

  for (let indexA = 0; indexA < blocs.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < blocs.length; indexB += 1) {
      const blocA = blocs[indexA]!;
      const blocB = blocs[indexB]!;

      if (blocA.ligneId !== blocB.ligneId || blocA.ligneId !== options.ligneId) {
        continue;
      }

      if (getIadeIdBloc(blocA) === getIadeIdBloc(blocB)) {
        continue;
      }

      if (
        !blocImpliqueCreneauCible(blocA, options.creneauxCibles) &&
        !blocImpliqueCreneauCible(blocB, options.creneauxCibles)
      ) {
        continue;
      }

      if (!echangeBlocsFaisable(blocA, blocB, contexte)) {
        continue;
      }

      const simule = simulerEchangeSurPropositions(
        propositions,
        blocA,
        blocB,
        contexte,
      );

      if (!simule) {
        continue;
      }

      const pointsSimules = calculerPointsFinauxPourPropositions(
        simule,
        pointsDepart,
        contexte,
      );
      const ecartSimule = calculerEcartLigne(pointsSimules, options.qualifies);
      const varianceSimule = calculerVariancePourPropositions(
        simule,
        pointsDepart,
        contexte,
        options.lignesCiblesVariance,
      );

      if (ecartSimule >= options.ecartActuel) {
        continue;
      }

      if (
        varianceSimule >
        options.varianceReferencePasse1 + EPSILON_VARIANCE_PASSE2
      ) {
        continue;
      }

      const varianceMeilleure =
        varianceSimule < meilleureVariance - EPSILON_VARIANCE_PASSE2;
      const varianceEgale =
        Math.abs(varianceSimule - meilleureVariance) <= EPSILON_VARIANCE_PASSE2;
      const ecartMeilleur =
        ecartSimule < meilleurEcart - EPSILON_VARIANCE_PASSE2;

      if (varianceMeilleure || (varianceEgale && ecartMeilleur)) {
        meilleureVariance = varianceSimule;
        meilleurEcart = ecartSimule;
        meilleurEchange = { blocA, blocB };
      }
    }
  }

  return {
    echange: meilleurEchange,
    ecartApres: meilleurEchange ? meilleurEcart : options.ecartActuel,
    varianceApres: meilleurEchange
      ? meilleureVariance
      : options.varianceReferencePasse1,
  };
}

function executerPasse1Echanges(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  maxIterations: number,
): {
  propositions: PropositionAffectation[];
  blocs: Bloc[];
  journal: JournalReoptimisationLisse;
} {
  const resultat = clonePropositions(propositions);
  const journal = creerJournalVide();
  const blocs = detecterBlocsContinuite(resultat, contexte.preferenceIndex);
  const lignesCibles = getLignesDesBlocs(blocs);

  let varianceActuelle = calculerVariancePourPropositions(
    resultat,
    pointsDepart,
    contexte,
    lignesCibles,
  );

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const { echange, score } = rechercherMeilleurEchange(
      resultat,
      blocs,
      pointsDepart,
      contexte,
      {
        passe: 1,
        ligneIds: lignesCibles,
        scoreActuel: varianceActuelle,
        comparerScore: (simule) =>
          calculerVariancePourPropositions(
            simule,
            pointsDepart,
            contexte,
            lignesCibles,
          ),
      },
    );

    if (!echange || score >= varianceActuelle) {
      break;
    }

    appliquerEchangeSurPropositions(
      resultat,
      echange.blocA,
      echange.blocB,
      contexte,
    );
    enregistrerEchange(journal, 1, echange.blocA, echange.blocB, contexte);
    varianceActuelle = score;
  }

  return { propositions: resultat, blocs, journal };
}

/**
 * Passe 2 — dernier recours si l'écart max−min dépasse le seuil par ligne.
 *
 * Autorise exceptionnellement de casser un bloc de continuité impliquant l'IADE
 * au plus haut ou au plus bas, uniquement pour réduire cet écart.
 *
 * Double condition (la variance globale prime sur l'écart local) :
 * 1. l'échange réduit strictement l'écart max−min de la ligne ;
 * 2. la variance globale (somme par ligne, état fin Passe 1) ne dépasse pas
 *    {@link varianceReferencePasse1} + {@link EPSILON_VARIANCE_PASSE2}.
 *
 * Parmi les échanges valides, on retient celui qui **minimise la variance**,
 * pas celui qui réduit le plus l'écart. Si aucun échange ne satisfait les deux
 * conditions, aucun bloc n'est cassé : le résultat de la Passe 1 est conservé
 * même si l'écart reste au-dessus du seuil configuré.
 */
function executerPasse2EcartAberrant(
  propositions: PropositionAffectation[],
  blocsInitiaux: Bloc[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  journal: JournalReoptimisationLisse,
  varianceReferencePasse1: number,
  lignesCiblesVariance: Set<string>,
): PropositionAffectation[] {
  const resultat = clonePropositions(propositions);
  const lignesCibles = getLignesDesBlocs(blocsInitiaux);

  for (const ligneId of lignesCibles) {
    const qualifies = contexte.qualificationsParLigne.get(ligneId);

    if (!qualifies || qualifies.size < 2) {
      continue;
    }

    const seuil = contexte.seuilsEcartAberrantParLigne.get(ligneId) ?? 0;
    const points = calculerPointsFinauxPourPropositions(
      resultat,
      pointsDepart,
      contexte,
    );
    const ecartActuel = calculerEcartLigne(points, qualifies);

    if (ecartActuel <= seuil) {
      continue;
    }

    const extremes = identifierIadesExtremes(points, qualifies);

    if (!extremes) {
      continue;
    }

    const { iadeHaut, iadeBas } = extremes;
    const blocsLigne = detecterBlocsContinuite(
      resultat,
      contexte.preferenceIndex,
    ).filter((bloc) => bloc.ligneId === ligneId);

    const { blocsRecherche, creneauxCibles, continuiteParSlot } =
      construireBlocsRecherchePasse2(
        blocsLigne,
        ligneId,
        iadeHaut,
        iadeBas,
      );

    if (creneauxCibles.size === 0) {
      continue;
    }

    const { echange, ecartApres } = rechercherMeilleurEchangePasse2(
      resultat,
      blocsRecherche,
      pointsDepart,
      contexte,
      {
        ligneId,
        lignesCiblesVariance,
        qualifies,
        ecartActuel,
        varianceReferencePasse1,
        creneauxCibles,
      },
    );

    if (!echange || ecartApres >= ecartActuel) {
      continue;
    }

    appliquerEchangeSurPropositions(
      resultat,
      echange.blocA,
      echange.blocB,
      contexte,
    );
    enregistrerEchange(journal, 2, echange.blocA, echange.blocB, contexte);
    enregistrerBlocsCassesApresEchange(
      journal,
      echange.blocA,
      echange.blocB,
      continuiteParSlot,
      contexte,
    );
  }

  return resultat;
}

function clonePropositions(
  propositions: PropositionAffectation[],
): PropositionAffectation[] {
  return propositions.map((proposition) => ({ ...proposition }));
}

function getIadeIdBloc(bloc: Bloc): string {
  return bloc.creneaux[0]!.iadeId!;
}

function getLignesDesBlocs(blocs: Bloc[]): Set<string> {
  return new Set(blocs.map((bloc) => bloc.ligneId));
}

function calculerVarianceTotale(
  pointsParIade: Map<string, number>,
  qualificationsParLigne: Map<string, Set<string>>,
  ligneIds: Iterable<string>,
): number {
  let total = 0;

  for (const ligneId of ligneIds) {
    const qualifies = qualificationsParLigne.get(ligneId);
    if (!qualifies || qualifies.size === 0) {
      continue;
    }

    total += calculerVariance(pointsParIade, qualifies);
  }

  return total;
}

function iadeQualifiePourLigne(
  iadeId: string,
  ligneId: string,
  qualificationsParLigne: Map<string, Set<string>>,
): boolean {
  return qualificationsParLigne.get(ligneId)?.has(iadeId) ?? false;
}

function iadeDisponiblePourCreneau(
  iadeId: string,
  proposition: PropositionAffectation,
  disponibilitesParIade: Map<string, Set<string>>,
): boolean {
  const dispos = disponibilitesParIade.get(iadeId);
  if (!dispos) {
    return false;
  }

  return dispos.has(buildPropositionSlotKey(proposition));
}

function iadePeutPrendreBloc(
  iadeId: string,
  bloc: Bloc,
  contexte: ContexteReoptimisation,
): boolean {
  if (!iadeQualifiePourLigne(iadeId, bloc.ligneId, contexte.qualificationsParLigne)) {
    return false;
  }

  return bloc.creneaux.every((creneau) =>
    iadeDisponiblePourCreneau(iadeId, creneau, contexte.disponibilitesParIade),
  );
}

function sansConflitDoubleAffectation(
  propositions: PropositionAffectation[],
): boolean {
  const affectationsParIadeJour = new Map<string, number>();

  for (const proposition of propositions) {
    if (!propositionComptable(proposition)) {
      continue;
    }

    const key = `${proposition.iadeId}:${proposition.date}`;
    const count = (affectationsParIadeJour.get(key) ?? 0) + 1;
    affectationsParIadeJour.set(key, count);

    if (count > 1) {
      return false;
    }
  }

  return true;
}

function echangeBlocsFaisable(
  blocA: Bloc,
  blocB: Bloc,
  contexte: ContexteReoptimisation,
): boolean {
  const iadeA = getIadeIdBloc(blocA);
  const iadeB = getIadeIdBloc(blocB);

  if (iadeA === iadeB || blocA.ligneId !== blocB.ligneId) {
    return false;
  }

  return (
    iadePeutPrendreBloc(iadeA, blocB, contexte) &&
    iadePeutPrendreBloc(iadeB, blocA, contexte)
  );
}

function appliquerEchangeSurPropositions(
  propositions: PropositionAffectation[],
  blocA: Bloc,
  blocB: Bloc,
  contexte: ContexteReoptimisation,
): void {
  const iadeA = getIadeIdBloc(blocA);
  const iadeB = getIadeIdBloc(blocB);
  const infoA = contexte.iadesParId.get(iadeA);
  const infoB = contexte.iadesParId.get(iadeB);

  for (const creneau of blocA.creneaux) {
    const slotKey = buildPropositionSlotKey(creneau);
    const proposition = propositions.find(
      (entry) => buildPropositionSlotKey(entry) === slotKey,
    );

    if (!proposition || !propositionComptable(proposition)) {
      continue;
    }

    proposition.iadeId = iadeB;
    proposition.iadeNom = infoB ? formatIadeNom(infoB) : proposition.iadeNom;
  }

  for (const creneau of blocB.creneaux) {
    const slotKey = buildPropositionSlotKey(creneau);
    const proposition = propositions.find(
      (entry) => buildPropositionSlotKey(entry) === slotKey,
    );

    if (!proposition || !propositionComptable(proposition)) {
      continue;
    }

    proposition.iadeId = iadeA;
    proposition.iadeNom = infoA ? formatIadeNom(infoA) : proposition.iadeNom;
  }
}

function simulerEchangeSurPropositions(
  propositions: PropositionAffectation[],
  blocA: Bloc,
  blocB: Bloc,
  contexte: ContexteReoptimisation,
): PropositionAffectation[] | null {
  const copie = clonePropositions(propositions);
  appliquerEchangeSurPropositions(copie, blocA, blocB, contexte);

  if (!sansConflitDoubleAffectation(copie)) {
    return null;
  }

  return copie;
}

function calculerVariancePourPropositions(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  ligneIds: Set<string>,
): number {
  const points = calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    contexte.astreintesExistantesParIade,
    contexte.bonusParLigne,
  );

  return calculerVarianceTotale(
    points,
    contexte.qualificationsParLigne,
    ligneIds,
  );
}

/**
 * Réoptimisation lissée : Passe 1 (échanges de blocs entiers) puis Passe 2
 * (cassure ciblée de continuité si écart aberrant).
 *
 * Passe 1 : les créneaux d'un même bloc de continuité bougent toujours ensemble.
 * Passe 2 : exception pour réduire un écart max−min au-dessus du seuil paramétrable
 * par ligne ({@link LigneAstreinte.seuilEcartAberrant}, défaut 2× poids max).
 */
export function reoptimiserParEchangesSync(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  options: ReoptimiserParEchangesSyncOptions,
): ResultatReoptimisationLisse {
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS_DEFAUT;
  const contexte = options.contexte;

  const passe1 = executerPasse1Echanges(
    propositions,
    pointsDepart,
    contexte,
    maxIterations,
  );

  const lignesCiblesVariance = getLignesDesBlocs(passe1.blocs);
  const varianceReferencePasse1 = calculerVariancePourPropositions(
    passe1.propositions,
    pointsDepart,
    contexte,
    lignesCiblesVariance,
  );

  const propositionsFinales = executerPasse2EcartAberrant(
    passe1.propositions,
    passe1.blocs,
    pointsDepart,
    contexte,
    passe1.journal,
    varianceReferencePasse1,
    lignesCiblesVariance,
  );

  return {
    propositions: propositionsFinales,
    journal: passe1.journal,
  };
}

/**
 * Évalue la sélection Passe 2 sur une ligne (scripts de conformité uniquement).
 * Permet de tester la double condition écart + variance avec une référence
 * de variance arbitraire, sans exécuter la Passe 1.
 */
export function evaluerMeilleurEchangePasse2PourConformite(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
  options: {
    ligneId: string;
    varianceReferencePasse1: number;
    lignesCiblesVariance: Set<string>;
  },
): (ResultatRecherchePasse2 & { ecartActuel: number }) | null {
  const qualifies = contexte.qualificationsParLigne.get(options.ligneId);

  if (!qualifies || qualifies.size < 2) {
    return null;
  }

  const seuil = contexte.seuilsEcartAberrantParLigne.get(options.ligneId) ?? 0;
  const points = calculerPointsFinauxPourPropositions(
    propositions,
    pointsDepart,
    contexte,
  );
  const ecartActuel = calculerEcartLigne(points, qualifies);

  if (ecartActuel <= seuil) {
    return null;
  }

  const extremes = identifierIadesExtremes(points, qualifies);

  if (!extremes) {
    return null;
  }

  const blocsLigne = detecterBlocsContinuite(
    propositions,
    contexte.preferenceIndex,
  ).filter((bloc) => bloc.ligneId === options.ligneId);

  const { blocsRecherche, creneauxCibles } = construireBlocsRecherchePasse2(
    blocsLigne,
    options.ligneId,
    extremes.iadeHaut,
    extremes.iadeBas,
  );

  if (creneauxCibles.size === 0) {
    return null;
  }

  const resultat = rechercherMeilleurEchangePasse2(
    propositions,
    blocsRecherche,
    pointsDepart,
    contexte,
    {
      ligneId: options.ligneId,
      lignesCiblesVariance: options.lignesCiblesVariance,
      qualifies,
      ecartActuel,
      varianceReferencePasse1: options.varianceReferencePasse1,
      creneauxCibles,
    },
  );

  return { ...resultat, ecartActuel };
}

/**
 * Charge le contexte (qualifications, disponibilités, bonus, astreintes, seuils)
 * puis délègue à {@link reoptimiserParEchangesSync}.
 */
export async function reoptimiserParEchanges(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  options?: ReoptimiserParEchangesOptions,
): Promise<ResultatReoptimisationLisse> {
  const contexte = await chargerContexteReoptimisation(propositions);
  return reoptimiserParEchangesSync(propositions, pointsDepart, {
    maxIterations: options?.maxIterations,
    contexte,
  });
}

export async function chargerContexteReoptimisation(
  propositions: PropositionAffectation[],
): Promise<ContexteReoptimisation> {
  const dates = propositions
    .map((proposition) => proposition.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  const debut = dates[0]
    ? new Date(`${dates[0]}T00:00:00.000Z`)
    : new Date();
  const fin = dates[dates.length - 1]
    ? new Date(`${dates[dates.length - 1]}T00:00:00.000Z`)
    : debut;

  const annees = new Set(
    dates.map((date) => Number(date.slice(0, 4))).filter(Number.isFinite),
  );

  if (annees.size === 0) {
    annees.add(new Date().getUTCFullYear());
  }

  const ligneIds = [
    ...new Set(propositions.map((proposition) => proposition.ligneId)),
  ];

  const [
    preferenceIndex,
    qualifications,
    disponibilites,
    iades,
    bonusParLigne,
    lignes,
    seuilsEcartAberrantParLigne,
  ] = await Promise.all([
    chargerPreferenceContinuiteIndex(propositions),
    prisma.qualification.findMany({
      where: { ligneId: { in: ligneIds } },
      select: { iadeId: true, ligneId: true },
    }),
    prisma.disponibilite.findMany({
      where: {
        date: { gte: debut, lte: fin },
        ligneId: { in: ligneIds },
      },
      select: {
        iadeId: true,
        date: true,
        ligneId: true,
        typeCreneau: true,
      },
    }),
    prisma.utilisateur.findMany({
      where: { role: Role.IADE, actif: true },
      select: { id: true, nom: true, prenom: true },
    }),
    chargerBonusContinuiteParLigne(),
    prisma.ligneAstreinte.findMany({
      where: { id: { in: ligneIds } },
      select: { id: true, nom: true },
    }),
    chargerSeuilsEcartAberrantParLigne(ligneIds),
  ]);

  const iadeIds = iades.map((iade) => iade.id);
  const astreintesParAnnee = await Promise.all(
    [...annees].map((annee) => chargerAstreintesPointsParIade(annee, iadeIds)),
  );

  const qualificationsParLigne = new Map<string, Set<string>>();
  for (const qualification of qualifications) {
    const set =
      qualificationsParLigne.get(qualification.ligneId) ?? new Set<string>();
    set.add(qualification.iadeId);
    qualificationsParLigne.set(qualification.ligneId, set);
  }

  const disponibilitesParIade = new Map<string, Set<string>>();
  for (const disponibilite of disponibilites) {
    const date = disponibilite.date.toISOString().slice(0, 10);
    const slotKey = `${date}:${disponibilite.ligneId}:${disponibilite.typeCreneau}`;
    const set = disponibilitesParIade.get(disponibilite.iadeId) ?? new Set<string>();
    set.add(slotKey);
    disponibilitesParIade.set(disponibilite.iadeId, set);
  }

  const iadesParId = new Map(
    iades.map((iade) => [iade.id, { nom: iade.nom, prenom: iade.prenom }]),
  );

  const lignesParId = new Map(
    lignes.map((ligne) => [ligne.id, { nom: ligne.nom }]),
  );

  const astreintesExistantesParIade = new Map<string, AstreintePointsRow[]>(
    iadeIds.map((id) => [id, []]),
  );

  for (const map of astreintesParAnnee) {
    for (const [iadeId, rows] of map) {
      const liste = astreintesExistantesParIade.get(iadeId) ?? [];
      liste.push(...rows);
      astreintesExistantesParIade.set(iadeId, liste);
    }
  }

  return {
    preferenceIndex,
    qualificationsParLigne,
    disponibilitesParIade,
    iadesParId,
    lignesParId,
    astreintesExistantesParIade,
    bonusParLigne,
    seuilsEcartAberrantParLigne,
  };
}
