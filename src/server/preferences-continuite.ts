import { TypeActionAudit, TypePreferenceContinuite } from "@prisma/client";
import { prisma } from "@/lib/db";
import { journaliser } from "@/server/audit";
import {
  resumePreferenceAjoutee,
  resumePreferenceSupprimee,
} from "@/server/audit-resumes";
import { parseDateInput, parseMoisParam } from "@/server/astreintes";
import { assertIadeQualifieSurLigne } from "@/server/disponibilites";
import { assertSaisieDisposOuverte } from "@/server/campagne-saisie-dispos";
import {
  creneauxDisponiblesPour,
  determinerTypeJour,
} from "@/server/jours-feries";

export type PreferenceContinuiteItem = {
  id: string;
  iadeId: string;
  ligneId: string;
  dateDebut: string;
  type: TypePreferenceContinuite;
};

export type PreferenceContinuiteInput = {
  ligneId: string;
  dateDebut: string;
  type: TypePreferenceContinuite;
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function mapPreference(record: {
  id: string;
  iadeId: string;
  ligneId: string;
  dateDebut: Date;
  type: TypePreferenceContinuite;
}): PreferenceContinuiteItem {
  return {
    id: record.id,
    iadeId: record.iadeId,
    ligneId: record.ligneId,
    dateDebut: record.dateDebut.toISOString().slice(0, 10),
    type: record.type,
  };
}

export function validatePreferenceContinuiteInput(
  input: Record<string, unknown>,
): PreferenceContinuiteInput | { error: string } {
  const ligneId =
    typeof input.ligneId === "string" ? input.ligneId.trim() : "";
  const dateDebut =
    typeof input.dateDebut === "string" ? input.dateDebut.trim() : "";
  const type = typeof input.type === "string" ? input.type : "";

  if (!ligneId) {
    return { error: "La ligne est requise." };
  }

  if (!dateDebut || !parseDateInput(dateDebut)) {
    return { error: "La date est invalide." };
  }

  if (
    type !== TypePreferenceContinuite.JOUR_NUIT &&
    type !== TypePreferenceContinuite.WEEKEND_48H
  ) {
    return { error: "Type de préférence invalide." };
  }

  return {
    ligneId,
    dateDebut,
    type: type as TypePreferenceContinuite,
  };
}

async function assertJourNuitDisponible(
  iadeId: string,
  ligneId: string,
  date: Date,
): Promise<{ error: string } | null> {
  const typeJour = await determinerTypeJour(date);
  const creneaux = creneauxDisponiblesPour(typeJour);

  if (creneaux.length < 2) {
    return {
      error:
        "Les 24h ne s'appliquent qu'aux jours avec créneaux Jour et Nuit.",
    };
  }

  const [creneauJour, creneauNuit] = creneaux;

  const [jour, nuit] = await Promise.all([
    prisma.disponibilite.findFirst({
      where: {
        iadeId,
        ligneId,
        date,
        typeCreneau: creneauJour,
      },
    }),
    prisma.disponibilite.findFirst({
      where: {
        iadeId,
        ligneId,
        date,
        typeCreneau: creneauNuit,
      },
    }),
  ]);

  if (!jour || !nuit) {
    return {
      error:
        "Les créneaux Jour et Nuit doivent être cochés pour déclarer les 24h.",
    };
  }

  return null;
}

export async function listPreferencesContinuite(options: {
  iadeId: string;
  mois?: string;
  periodeDebut?: string;
  periodeFin?: string;
}): Promise<PreferenceContinuiteItem[]> {
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;

  if (options.mois) {
    const { year, month } = parseMoisParam(options.mois);
    rangeStart = new Date(Date.UTC(year, month - 1, 1));
    rangeEnd = new Date(Date.UTC(year, month, 0));
  } else if (options.periodeDebut && options.periodeFin) {
    rangeStart = parseDateInput(options.periodeDebut);
    rangeEnd = parseDateInput(options.periodeFin);
  }

  const records = await prisma.preferenceContinuite.findMany({
    where: {
      iadeId: options.iadeId,
      ...(rangeStart && rangeEnd
        ? { dateDebut: { gte: rangeStart, lte: rangeEnd } }
        : {}),
    },
    orderBy: [{ dateDebut: "asc" }, { ligneId: "asc" }],
  });

  return records.map(mapPreference);
}

export async function createPreferenceContinuite(
  input: PreferenceContinuiteInput,
  ownerId: string,
): Promise<
  | { preference: PreferenceContinuiteItem; created: boolean }
  | { error: string }
> {
  const qualifError = await assertIadeQualifieSurLigne(ownerId, input.ligneId);
  if (qualifError) {
    return qualifError;
  }

  const date = parseDateInput(input.dateDebut)!;
  const verrouError = await assertSaisieDisposOuverte(input.ligneId, date);
  if (verrouError) {
    return verrouError;
  }

  const today = startOfTodayUtc();
  if (date < today) {
    return {
      error: "Impossible de déclarer une préférence dans le passé.",
    };
  }

  if (input.type === TypePreferenceContinuite.JOUR_NUIT) {
    const check = await assertJourNuitDisponible(ownerId, input.ligneId, date);
    if (check) {
      return check;
    }
  }

  if (input.type === TypePreferenceContinuite.WEEKEND_48H) {
    const typeJour = await determinerTypeJour(date);
    if (typeJour !== "SAMEDI") {
      return {
        error: "Le week-end complet (48h) se déclare à partir d'un samedi.",
      };
    }

    const dimanche = new Date(date);
    dimanche.setUTCDate(dimanche.getUTCDate() + 1);

    const [prefSamedi, prefDimanche] = await Promise.all([
      prisma.preferenceContinuite.findFirst({
        where: {
          iadeId: ownerId,
          ligneId: input.ligneId,
          dateDebut: date,
          type: TypePreferenceContinuite.JOUR_NUIT,
        },
      }),
      prisma.preferenceContinuite.findFirst({
        where: {
          iadeId: ownerId,
          ligneId: input.ligneId,
          dateDebut: dimanche,
          type: TypePreferenceContinuite.JOUR_NUIT,
        },
      }),
    ]);

    if (!prefSamedi || !prefDimanche) {
      return {
        error:
          'Cochez d\'abord "Partant pour les 24h" le samedi et le dimanche.',
      };
    }
  }

  const existing = await prisma.preferenceContinuite.findUnique({
    where: {
      iadeId_ligneId_dateDebut_type: {
        iadeId: ownerId,
        ligneId: input.ligneId,
        dateDebut: date,
        type: input.type,
      },
    },
  });

  if (existing) {
    return { preference: mapPreference(existing), created: false };
  }

  const ligne = await prisma.ligneAstreinte.findUniqueOrThrow({
    where: { id: input.ligneId },
    select: { nom: true },
  });

  const record = await prisma.preferenceContinuite.create({
    data: {
      iadeId: ownerId,
      ligneId: input.ligneId,
      dateDebut: date,
      type: input.type,
    },
  });

  const preference = mapPreference(record);

  await journaliser({
    acteurId: ownerId,
    typeAction: TypeActionAudit.PREFERENCE_AJOUTEE,
    iadeConcerneId: ownerId,
    resume: resumePreferenceAjoutee({
      ligneNom: ligne.nom,
      dateDebut: preference.dateDebut,
      type: preference.type,
    }),
    detail: {
      preferenceId: preference.id,
      ligneId: preference.ligneId,
      dateDebut: preference.dateDebut,
      type: preference.type,
    },
  });

  return { preference, created: true };
}

export async function deletePreferenceContinuite(
  id: string,
  requesterId: string,
): Promise<{ success: true } | { error: string; status?: number }> {
  const record = await prisma.preferenceContinuite.findUnique({
    where: { id },
    include: { ligne: { select: { nom: true } } },
  });

  if (!record) {
    return { error: "Préférence introuvable.", status: 404 };
  }

  if (record.iadeId !== requesterId) {
    return { error: "Accès refusé.", status: 403 };
  }

  const verrouError = await assertSaisieDisposOuverte(
    record.ligneId,
    record.dateDebut,
  );
  if (verrouError) {
    return { error: verrouError.error, status: 400 };
  }

  const today = startOfTodayUtc();
  if (record.dateDebut < today) {
    return {
      error: "Les préférences passées ne peuvent pas être supprimées.",
      status: 400,
    };
  }

  await prisma.preferenceContinuite.delete({ where: { id } });

  if (record.type === TypePreferenceContinuite.JOUR_NUIT) {
    await prisma.preferenceContinuite.deleteMany({
      where: {
        iadeId: record.iadeId,
        ligneId: record.ligneId,
        type: TypePreferenceContinuite.WEEKEND_48H,
        dateDebut:
          record.dateDebut.getUTCDay() === 0
            ? new Date(
                Date.UTC(
                  record.dateDebut.getUTCFullYear(),
                  record.dateDebut.getUTCMonth(),
                  record.dateDebut.getUTCDate() - 1,
                ),
              )
            : record.dateDebut,
      },
    });
  }

  await journaliser({
    acteurId: requesterId,
    typeAction: TypeActionAudit.PREFERENCE_SUPPRIMEE,
    iadeConcerneId: record.iadeId,
    resume: resumePreferenceSupprimee({
      ligneNom: record.ligne.nom,
      dateDebut: record.dateDebut.toISOString().slice(0, 10),
      type: record.type,
    }),
    detail: {
      preferenceId: record.id,
      ligneId: record.ligneId,
      dateDebut: record.dateDebut.toISOString().slice(0, 10),
      type: record.type,
    },
  });

  return { success: true };
}
