import {
  Prisma,
  Role,
  StatutAstreinte,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { TypeActionAudit } from "@prisma/client";
import { journaliser } from "@/server/audit";
import {
  resumeDisponibiliteAjoutee,
  resumeDisponibiliteSupprimeeManuelle,
  resumePreferenceAjoutee,
} from "@/server/audit-resumes";
import { parseDateInput, parseMoisParam } from "@/server/astreintes";
import {
  chargerTypesJour,
  creneauxDisponiblesPour,
  determinerTypeJour,
  type TypeJour,
} from "@/server/jours-feries";
import type { FenetreCampagneSaisie } from "@/server/campagne-saisie-dispos";
import {
  assertSaisieDisposOuverte,
  getFenetresCampagnesPourMois,
} from "@/server/campagne-saisie-dispos";

export const TYPES_DISPONIBILITE: TypeCreneau[] = [
  TypeCreneau.NUIT_SEMAINE,
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

/** Libellés affichés pour les disponibilités déclarées (IADE + vue cadre). */
export const LIBELLES_DISPONIBILITE_CRENEAU: Record<TypeCreneau, string> = {
  [TypeCreneau.NUIT_SEMAINE]: "Disponible (nuit)",
  [TypeCreneau.JOUR_SAMEDI]: "Jour",
  [TypeCreneau.NUIT_SAMEDI]: "Nuit",
  [TypeCreneau.JOUR_DIMANCHE]: "Jour",
  [TypeCreneau.NUIT_DIMANCHE]: "Nuit",
  [TypeCreneau.JOUR_FERIE]: "Jour",
  [TypeCreneau.NUIT_FERIE]: "Nuit",
};

export type DisponibiliteItem = {
  id: string;
  iadeId: string;
  ligneId: string;
  ligneNom?: string;
  date: string;
  typeCreneau: TypeCreneau;
  iade?: { id: string; nom: string; prenom: string };
};

export type DisponibiliteInput = {
  ligneId: string;
  date: string;
  typeCreneau: TypeCreneau;
};

export type CoverageAlert = {
  date: string;
  ligneId: string;
  ligneNom: string;
  iadesDisponiblesQualifies: number;
};

export type LigneQualifiee = {
  id: string;
  nom: string;
};

export type MesDisponibilitesMoisData = {
  mois: string;
  lignesQualifiees: LigneQualifiee[];
  disponibilites: DisponibiliteItem[];
  preferencesContinuite: Array<{
    id: string;
    ligneId: string;
    dateDebut: string;
    type: TypePreferenceContinuite;
  }>;
  typesJourParDate: Record<string, TypeJour>;
  fenetresCampagnes: FenetreCampagneSaisie[];
};

export type DupliquerLignesPreview = {
  lignes: Array<{ ligneId: string; ligneNom: string; nouvelles: number }>;
  total: number;
};

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getMonthUtcRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  return { start, end };
}

function formatDateFr(date: Date | string): string {
  const value = typeof date === "string" ? parseDateInput(date) : date;
  if (!value) {
    return String(date);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function mapDisponibilite(record: {
  id: string;
  iadeId: string;
  ligneId: string;
  date: Date;
  typeCreneau: TypeCreneau;
  ligne?: { nom: string };
  iade?: { id: string; nom: string; prenom: string };
}): DisponibiliteItem {
  return {
    id: record.id,
    iadeId: record.iadeId,
    ligneId: record.ligneId,
    ligneNom: record.ligne?.nom,
    date: record.date.toISOString().slice(0, 10),
    typeCreneau: record.typeCreneau,
    iade: record.iade,
  };
}

function eachDayUtc(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function validateDisponibiliteInput(
  input: Record<string, unknown>,
): DisponibiliteInput | { error: string } {
  const ligneId =
    typeof input.ligneId === "string" ? input.ligneId.trim() : "";
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const typeCreneau =
    typeof input.typeCreneau === "string" ? input.typeCreneau : "";

  if (!ligneId) {
    return { error: "La ligne est requise." };
  }

  if (!date || !parseDateInput(date)) {
    return { error: "La date est invalide." };
  }

  if (!TYPES_DISPONIBILITE.includes(typeCreneau as TypeCreneau)) {
    return { error: "Type de créneau invalide." };
  }

  return {
    ligneId,
    date,
    typeCreneau: typeCreneau as TypeCreneau,
  };
}

export async function getLignesQualifiees(
  iadeId: string,
): Promise<LigneQualifiee[]> {
  const qualifications = await prisma.qualification.findMany({
    where: {
      iadeId,
      ligne: { actif: true },
    },
    include: {
      ligne: { select: { id: true, nom: true, ordrePriorite: true } },
    },
    orderBy: { ligne: { ordrePriorite: "asc" } },
  });

  return qualifications.map((qualification) => ({
    id: qualification.ligne.id,
    nom: qualification.ligne.nom,
  }));
}

export async function assertIadeQualifieSurLigne(
  iadeId: string,
  ligneId: string,
): Promise<{ error: string } | null> {
  const qualification = await prisma.qualification.findUnique({
    where: { iadeId_ligneId: { iadeId, ligneId } },
    include: { ligne: { select: { actif: true } } },
  });

  if (!qualification || !qualification.ligne.actif) {
    return { error: "Vous n'êtes pas qualifié sur cette ligne." };
  }

  return null;
}

export async function isIadeQualifieSurLigne(
  iadeId: string,
  ligneId: string,
): Promise<boolean> {
  const erreur = await assertIadeQualifieSurLigne(iadeId, ligneId);
  return erreur === null;
}

export async function isIadeDisponibleSurCreneau(
  iadeId: string,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
): Promise<boolean> {
  const disponibilite = await prisma.disponibilite.findFirst({
    where: {
      iadeId,
      ligneId,
      date: normalizeUtcDay(date),
      typeCreneau,
    },
  });

  return !!disponibilite;
}

/** Opt-in : disponibilité granulaire (ligne + créneau). */
export async function isIadeDisponibleSurDate(
  iadeId: string,
  date: Date,
  ligneId?: string,
  typeCreneau?: TypeCreneau,
): Promise<boolean> {
  if (ligneId && typeCreneau) {
    return isIadeDisponibleSurCreneau(iadeId, ligneId, date, typeCreneau);
  }

  const disponibilite = await prisma.disponibilite.findFirst({
    where: {
      iadeId,
      date: normalizeUtcDay(date),
      ...(ligneId ? { ligneId } : {}),
      ...(typeCreneau ? { typeCreneau } : {}),
    },
  });

  return !!disponibilite;
}

export async function getDisponibiliteWarningForDate(
  iadeId: string,
  date: Date,
  ligneId: string,
  typeCreneau: TypeCreneau,
): Promise<string | null> {
  const { isIadeEligiblePourCreneau, LIBELLES_TYPE_CRENEAU_ASTREINTE } =
    await import("@/server/astreinte-creneaux");
  const disponible = await isIadeEligiblePourCreneau(
    iadeId,
    ligneId,
    date,
    typeCreneau,
  );
  if (disponible) {
    return null;
  }

  const label = LIBELLES_TYPE_CRENEAU_ASTREINTE[typeCreneau] ?? typeCreneau;
  return `Cet IADE n'a pas déclaré le créneau ${label} disponible pour cette ligne le ${formatDateFr(date)}. Vous pouvez tout de même enregistrer l'affectation manuellement.`;
}

export async function listDisponibilites(options: {
  iadeId?: string;
  mois?: string;
  periodeDebut?: string;
  periodeFin?: string;
  includeIade?: boolean;
}): Promise<DisponibiliteItem[]> {
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;

  if (options.mois) {
    const { year, month } = parseMoisParam(options.mois);
    const range = getMonthUtcRange(year, month);
    rangeStart = range.start;
    rangeEnd = range.end;
  } else if (options.periodeDebut && options.periodeFin) {
    rangeStart = parseDateInput(options.periodeDebut);
    rangeEnd = parseDateInput(options.periodeFin);
  }

  const records = await prisma.disponibilite.findMany({
    where: {
      ...(options.iadeId ? { iadeId: options.iadeId } : {}),
      ...(rangeStart && rangeEnd
        ? { date: { gte: rangeStart, lte: rangeEnd } }
        : {}),
    },
    include: {
      ligne: { select: { nom: true } },
      ...(options.includeIade
        ? { iade: { select: { id: true, nom: true, prenom: true } } }
        : {}),
    },
    orderBy: [{ date: "asc" }, { ligneId: "asc" }, { typeCreneau: "asc" }],
  });

  return records.map(mapDisponibilite);
}

export async function getMesDisponibilitesMoisData(options: {
  iadeId: string;
  mois: string;
}): Promise<MesDisponibilitesMoisData> {
  const { year, month, value } = parseMoisParam(options.mois);
  const { start, end } = getMonthUtcRange(year, month);

  const [lignesQualifiees, disponibilites, preferencesContinuite, fenetresCampagnes] =
    await Promise.all([
      getLignesQualifiees(options.iadeId),
      listDisponibilites({ iadeId: options.iadeId, mois: value }),
      prisma.preferenceContinuite.findMany({
        where: {
          iadeId: options.iadeId,
          dateDebut: { gte: start, lte: end },
        },
        orderBy: [{ dateDebut: "asc" }, { ligneId: "asc" }],
      }),
      getFenetresCampagnesPourMois(options.iadeId, value),
    ]);

  const joursPeriode = eachDayUtc(start, end);
  const typesJourMap = await chargerTypesJour(joursPeriode);
  const typesJourParDate = Object.fromEntries(typesJourMap) as Record<
    string,
    TypeJour
  >;

  return {
    mois: value,
    lignesQualifiees,
    disponibilites,
    preferencesContinuite: preferencesContinuite.map((preference) => ({
      id: preference.id,
      ligneId: preference.ligneId,
      dateDebut: preference.dateDebut.toISOString().slice(0, 10),
      type: preference.type,
    })),
    typesJourParDate,
    fenetresCampagnes,
  };
}

export async function createDisponibilite(
  input: DisponibiliteInput,
  ownerId: string,
  acteurId?: string,
): Promise<
  | { disponibilite: DisponibiliteItem; created: boolean }
  | { error: string }
> {
  const qualifError = await assertIadeQualifieSurLigne(ownerId, input.ligneId);
  if (qualifError) {
    return qualifError;
  }

  const date = parseDateInput(input.date)!;
  const verrouError = await assertSaisieDisposOuverte(input.ligneId, date);
  if (verrouError) {
    return verrouError;
  }

  const today = startOfTodayUtc();
  if (date < today) {
    return { error: "Impossible de déclarer une disponibilité dans le passé." };
  }

  const typeJour = await determinerTypeJour(date);
  const creneauxAutorises = creneauxDisponiblesPour(typeJour);

  if (!creneauxAutorises.includes(input.typeCreneau)) {
    return {
      error: `Ce créneau n'est pas disponible pour un jour de type ${typeJour}.`,
    };
  }

  const existing = await prisma.disponibilite.findUnique({
    where: {
      iadeId_ligneId_date_typeCreneau: {
        iadeId: ownerId,
        ligneId: input.ligneId,
        date,
        typeCreneau: input.typeCreneau,
      },
    },
    include: { ligne: { select: { nom: true } } },
  });

  if (existing) {
    return { disponibilite: mapDisponibilite(existing), created: false };
  }

  const record = await prisma.disponibilite.create({
    data: {
      iadeId: ownerId,
      ligneId: input.ligneId,
      date,
      typeCreneau: input.typeCreneau,
    },
    include: { ligne: { select: { nom: true } } },
  });

  const disponibilite = mapDisponibilite(record);

  await journaliser({
    acteurId: acteurId ?? ownerId,
    typeAction: TypeActionAudit.DISPONIBILITE_AJOUTEE,
    iadeConcerneId: ownerId,
    resume: resumeDisponibiliteAjoutee({
      ligneNom: record.ligne.nom,
      date: disponibilite.date,
      typeCreneau: disponibilite.typeCreneau,
    }),
    detail: {
      disponibiliteId: disponibilite.id,
      ligneId: disponibilite.ligneId,
      date: disponibilite.date,
      typeCreneau: disponibilite.typeCreneau,
    },
  });

  return { disponibilite, created: true };
}

export async function getAstreinteConflictWarningForDisponibilite(
  iadeId: string,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
): Promise<string | null> {
  const astreinte = await prisma.astreinte.findFirst({
    where: {
      iadeId,
      ligneId,
      date: normalizeUtcDay(date),
      typeCreneau,
      statut: { not: StatutAstreinte.ANNULEE },
    },
    include: { ligne: { select: { nom: true } } },
  });

  if (!astreinte) {
    return null;
  }

  return `Attention : une astreinte ${typeCreneau} est déjà planifiée le ${formatDateFr(astreinte.date)} sur ${astreinte.ligne.nom}. Contactez le cadre si besoin.`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function cleanupPreferencesAfterDisponibiliteDelete(
  iadeId: string,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
  client: DbClient = prisma,
): Promise<
  {
    id: string;
    iadeId: string;
    ligneId: string;
    dateDebut: Date;
    type: TypePreferenceContinuite;
  }[]
> {
  const deleted: {
    id: string;
    iadeId: string;
    ligneId: string;
    dateDebut: Date;
    type: TypePreferenceContinuite;
  }[] = [];

  async function retirerPreferences(where: {
    iadeId: string;
    ligneId: string;
    dateDebut: Date;
    type: TypePreferenceContinuite;
  }) {
    const prefs = await client.preferenceContinuite.findMany({ where });
    for (const pref of prefs) {
      await client.preferenceContinuite.delete({ where: { id: pref.id } });
      deleted.push(pref);
    }
  }

  const typeJour = await determinerTypeJour(date);
  const creneaux = creneauxDisponiblesPour(typeJour);

  if (creneaux.length < 2) {
    return deleted;
  }

  const [creneauJour, creneauNuit] = creneaux;

  const jourDispo = await client.disponibilite.findFirst({
    where: {
      iadeId,
      ligneId,
      date,
      typeCreneau: creneauJour,
    },
  });
  const nuitDispo = await client.disponibilite.findFirst({
    where: {
      iadeId,
      ligneId,
      date,
      typeCreneau: creneauNuit,
    },
  });

  if (!jourDispo || !nuitDispo) {
    await retirerPreferences({
      iadeId,
      ligneId,
      dateDebut: date,
      type: TypePreferenceContinuite.JOUR_NUIT,
    });
  }

  if (typeJour === "SAMEDI") {
    const dimanche = new Date(date);
    dimanche.setUTCDate(dimanche.getUTCDate() + 1);

    const prefSamedi = await client.preferenceContinuite.findFirst({
      where: {
        iadeId,
        ligneId,
        dateDebut: date,
        type: TypePreferenceContinuite.JOUR_NUIT,
      },
    });
    const prefDimanche = await client.preferenceContinuite.findFirst({
      where: {
        iadeId,
        ligneId,
        dateDebut: dimanche,
        type: TypePreferenceContinuite.JOUR_NUIT,
      },
    });

    if (!prefSamedi || !prefDimanche) {
      await retirerPreferences({
        iadeId,
        ligneId,
        dateDebut: date,
        type: TypePreferenceContinuite.WEEKEND_48H,
      });
    }
  }

  return deleted;
}

export { cleanupPreferencesAfterDisponibiliteDelete };

export async function deleteDisponibilite(
  id: string,
  requesterId: string,
): Promise<
  | { success: true; warning: string | null }
  | { error: string; status?: number }
> {
  const record = await prisma.disponibilite.findUnique({
    where: { id },
    include: { ligne: { select: { nom: true } } },
  });

  if (!record) {
    return { error: "Disponibilité introuvable.", status: 404 };
  }

  if (record.iadeId !== requesterId) {
    return { error: "Accès refusé.", status: 403 };
  }

  const verrouError = await assertSaisieDisposOuverte(
    record.ligneId,
    record.date,
  );
  if (verrouError) {
    return { error: verrouError.error, status: 400 };
  }

  const today = startOfTodayUtc();
  if (record.date < today) {
    return {
      error: "Les disponibilités passées ne peuvent pas être supprimées.",
      status: 400,
    };
  }

  const warning = await getAstreinteConflictWarningForDisponibilite(
    record.iadeId,
    record.ligneId,
    record.date,
    record.typeCreneau,
  );

  await prisma.disponibilite.delete({ where: { id } });
  await cleanupPreferencesAfterDisponibiliteDelete(
    record.iadeId,
    record.ligneId,
    record.date,
    record.typeCreneau,
  );

  await journaliser({
    acteurId: requesterId,
    typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_MANUELLE,
    iadeConcerneId: record.iadeId,
    resume: resumeDisponibiliteSupprimeeManuelle({
      ligneNom: record.ligne.nom,
      date: record.date.toISOString().slice(0, 10),
      typeCreneau: record.typeCreneau,
    }),
    detail: {
      disponibiliteId: record.id,
      ligneId: record.ligneId,
      date: record.date.toISOString().slice(0, 10),
      typeCreneau: record.typeCreneau,
    },
  });

  return { success: true, warning };
}

export async function previewDupliquerDisponibilitesLignes(options: {
  iadeId: string;
  mois: string;
  ligneSourceId: string;
  lignesCibles: string[];
}): Promise<DupliquerLignesPreview | { error: string }> {
  const qualifError = await assertIadeQualifieSurLigne(
    options.iadeId,
    options.ligneSourceId,
  );
  if (qualifError) {
    return qualifError;
  }

  const { year, month } = parseMoisParam(options.mois);
  const { start, end } = getMonthUtcRange(year, month);

  const sourceDispos = await prisma.disponibilite.findMany({
    where: {
      iadeId: options.iadeId,
      ligneId: options.ligneSourceId,
      date: { gte: start, lte: end },
    },
  });

  const lignesCibles = options.lignesCibles.filter(
    (ligneId) => ligneId !== options.ligneSourceId,
  );

  const lignesInfo = await prisma.ligneAstreinte.findMany({
    where: { id: { in: lignesCibles }, actif: true },
    select: { id: true, nom: true },
  });

  const counts = new Map<string, { ligneNom: string; nouvelles: number }>();

  for (const ligne of lignesInfo) {
    counts.set(ligne.id, { ligneNom: ligne.nom, nouvelles: 0 });
  }

  for (const targetLigneId of lignesCibles) {
    const qualif = await assertIadeQualifieSurLigne(
      options.iadeId,
      targetLigneId,
    );
    if (qualif) {
      continue;
    }

    for (const sourceDispo of sourceDispos) {
      const exists = await prisma.disponibilite.findFirst({
        where: {
          iadeId: options.iadeId,
          ligneId: targetLigneId,
          date: sourceDispo.date,
          typeCreneau: sourceDispo.typeCreneau,
        },
      });

      if (!exists) {
        const entry = counts.get(targetLigneId);
        if (entry) {
          entry.nouvelles += 1;
        }
      }
    }
  }

  const lignes = Array.from(counts.entries()).map(([ligneId, value]) => ({
    ligneId,
    ligneNom: value.ligneNom,
    nouvelles: value.nouvelles,
  }));

  return {
    lignes: lignes.filter((ligne) => ligne.nouvelles > 0),
    total: lignes.reduce((sum, ligne) => sum + ligne.nouvelles, 0),
  };
}

export async function appliquerDupliquerDisponibilitesLignes(options: {
  iadeId: string;
  acteurId: string;
  mois: string;
  ligneSourceId: string;
  lignesCibles: string[];
}): Promise<{ created: number } | { error: string }> {
  const preview = await previewDupliquerDisponibilitesLignes(options);
  if ("error" in preview) {
    return preview;
  }

  const { year, month } = parseMoisParam(options.mois);
  const { start, end } = getMonthUtcRange(year, month);

  const sourceDispos = await prisma.disponibilite.findMany({
    where: {
      iadeId: options.iadeId,
      ligneId: options.ligneSourceId,
      date: { gte: start, lte: end },
    },
  });

  const sourcePreferences = await prisma.preferenceContinuite.findMany({
    where: {
      iadeId: options.iadeId,
      ligneId: options.ligneSourceId,
      dateDebut: { gte: start, lte: end },
    },
  });

  let created = 0;
  const lignesCibles = options.lignesCibles.filter(
    (ligneId) => ligneId !== options.ligneSourceId,
  );

  const lignesInfo = await prisma.ligneAstreinte.findMany({
    where: { id: { in: lignesCibles } },
    select: { id: true, nom: true },
  });
  const ligneNomParId = new Map(lignesInfo.map((ligne) => [ligne.id, ligne.nom]));

  for (const targetLigneId of lignesCibles) {
    const qualif = await assertIadeQualifieSurLigne(
      options.iadeId,
      targetLigneId,
    );
    if (qualif) {
      continue;
    }

    for (const sourceDispo of sourceDispos) {
      const exists = await prisma.disponibilite.findFirst({
        where: {
          iadeId: options.iadeId,
          ligneId: targetLigneId,
          date: sourceDispo.date,
          typeCreneau: sourceDispo.typeCreneau,
        },
      });
      if (!exists) {
        const record = await prisma.disponibilite.create({
          data: {
            iadeId: options.iadeId,
            ligneId: targetLigneId,
            date: sourceDispo.date,
            typeCreneau: sourceDispo.typeCreneau,
          },
        });
        created += 1;

        const ligneNom = ligneNomParId.get(targetLigneId) ?? targetLigneId;
        const date = record.date.toISOString().slice(0, 10);

        await journaliser({
          acteurId: options.acteurId,
          typeAction: TypeActionAudit.DISPONIBILITE_AJOUTEE,
          iadeConcerneId: options.iadeId,
          resume: resumeDisponibiliteAjoutee({
            ligneNom,
            date,
            typeCreneau: record.typeCreneau,
            duplicationMultiLignes: true,
          }),
          detail: {
            disponibiliteId: record.id,
            ligneId: record.ligneId,
            date,
            typeCreneau: record.typeCreneau,
            duplicationMultiLignes: true,
            ligneSourceId: options.ligneSourceId,
          },
        });
      }
    }

    for (const preference of sourcePreferences) {
      const exists = await prisma.preferenceContinuite.findFirst({
        where: {
          iadeId: options.iadeId,
          ligneId: targetLigneId,
          dateDebut: preference.dateDebut,
          type: preference.type,
        },
      });
      if (!exists) {
        const record = await prisma.preferenceContinuite.create({
          data: {
            iadeId: options.iadeId,
            ligneId: targetLigneId,
            dateDebut: preference.dateDebut,
            type: preference.type,
          },
        });
        created += 1;

        const ligneNom = ligneNomParId.get(targetLigneId) ?? targetLigneId;
        const dateDebut = record.dateDebut.toISOString().slice(0, 10);

        await journaliser({
          acteurId: options.acteurId,
          typeAction: TypeActionAudit.PREFERENCE_AJOUTEE,
          iadeConcerneId: options.iadeId,
          resume: resumePreferenceAjoutee({
            ligneNom,
            dateDebut,
            type: record.type,
            duplicationMultiLignes: true,
          }),
          detail: {
            preferenceId: record.id,
            ligneId: record.ligneId,
            dateDebut,
            type: record.type,
            duplicationMultiLignes: true,
            ligneSourceId: options.ligneSourceId,
          },
        });
      }
    }
  }

  return { created };
}

export async function countQualifiedAvailableIades(
  ligneId: string,
  date: Date,
): Promise<number> {
  const typeJour = await determinerTypeJour(date);
  const typeCreneaux = creneauxDisponiblesPour(typeJour);

  const qualifications = await prisma.qualification.findMany({
    where: {
      ligneId,
      iade: { role: Role.IADE, actif: true },
    },
    select: { iadeId: true },
  });

  const iadeIds = qualifications.map((q) => q.iadeId);
  if (iadeIds.length === 0) {
    return 0;
  }

  const disponibilites = await prisma.disponibilite.findMany({
    where: {
      iadeId: { in: iadeIds },
      ligneId,
      date: normalizeUtcDay(date),
      typeCreneau: { in: typeCreneaux },
    },
    select: { iadeId: true },
  });

  return new Set(disponibilites.map((d) => d.iadeId)).size;
}

export async function getCoverageAlerts(options: {
  periodeDebut: string;
  periodeFin: string;
}): Promise<CoverageAlert[]> {
  const debut = parseDateInput(options.periodeDebut);
  const fin = parseDateInput(options.periodeFin);
  if (!debut || !fin || fin < debut) {
    return [];
  }

  const today = startOfTodayUtc();
  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
  });

  const alerts: CoverageAlert[] = [];

  for (const day of eachDayUtc(debut, fin)) {
    if (day < today) {
      continue;
    }

    for (const ligne of lignes) {
      const count = await countQualifiedAvailableIades(ligne.id, day);
      if (count === 0) {
        alerts.push({
          date: day.toISOString().slice(0, 10),
          ligneId: ligne.id,
          ligneNom: ligne.nom,
          iadesDisponiblesQualifies: 0,
        });
      }
    }
  }

  return alerts;
}
