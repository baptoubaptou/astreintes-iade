import {
  StatutAstreinte,
  StatutFenetreGeneration,
  TypeActionAudit,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/server/astreintes";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { journaliser } from "@/server/audit";
import { cleanupPreferencesAfterDisponibiliteDelete } from "@/server/disponibilites";
import { compterAstreintesNonPubliees } from "@/server/publication-planning";

export const LIBELLES_STATUT_FENETRE: Record<StatutFenetreGeneration, string> = {
  [StatutFenetreGeneration.PLANIFIEE]: "Planifiée",
  [StatutFenetreGeneration.CONFIRMEE]: "Confirmée",
};

export const ORDRE_PRIORITE_RECOMMANDE =
  "Greffe (1) → Obstétrique (2) → Urgences (3)";

export type CampagneItem = {
  id: string;
  ligneId: string;
  ligneNom: string;
  ordrePriorite: number;
  periodeDebut: string;
  periodeFin: string;
  dateGenerationPrevue: string;
  statut: StatutFenetreGeneration;
  dateConfirmation: string | null;
  modifiable: boolean;
  confirmable: boolean;
  publiable: boolean;
  nonPublieesCount: number;
};

export type CampagneLigneRow = {
  ligneId: string;
  ligneNom: string;
  ordrePriorite: number;
  campagnes: CampagneItem[];
};

export type LigneCampagneOption = {
  id: string;
  nom: string;
  ordrePriorite: number;
};

export function formatDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function isCampagneAVenirOuEnCours(periodeFin: Date): boolean {
  return periodeFin >= startOfTodayUtc();
}

function mapFenetre(
  fenetre: {
    id: string;
    ligneId: string;
    periodeDebut: Date;
    periodeFin: Date;
    dateGenerationPrevue: Date;
    statut: StatutFenetreGeneration;
    dateConfirmation: Date | null;
  },
  ligne: { nom: string; ordrePriorite: number },
  options?: {
    confirmable?: boolean;
    nonPublieesCount?: number;
  },
): CampagneItem {
  return {
    id: fenetre.id,
    ligneId: fenetre.ligneId,
    ligneNom: ligne.nom,
    ordrePriorite: ligne.ordrePriorite,
    periodeDebut: formatDateIso(fenetre.periodeDebut),
    periodeFin: formatDateIso(fenetre.periodeFin),
    dateGenerationPrevue: formatDateIso(fenetre.dateGenerationPrevue),
    statut: fenetre.statut,
    dateConfirmation: fenetre.dateConfirmation
      ? formatDateIso(fenetre.dateConfirmation)
      : null,
    modifiable: fenetre.statut !== StatutFenetreGeneration.CONFIRMEE,
    confirmable: options?.confirmable ?? false,
    publiable: (options?.nonPublieesCount ?? 0) > 0,
    nonPublieesCount: options?.nonPublieesCount ?? 0,
  };
}

function formatDateFrCourt(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export async function campagneEstConfirmable(
  fenetreId: string,
): Promise<boolean> {
  const fenetre = await prisma.fenetreGeneration.findUnique({
    where: { id: fenetreId },
    select: {
      statut: true,
      ligneId: true,
      periodeDebut: true,
      periodeFin: true,
    },
  });

  if (!fenetre || fenetre.statut !== StatutFenetreGeneration.PLANIFIEE) {
    return false;
  }

  const astreintesCount = await prisma.astreinte.count({
    where: {
      ligneId: fenetre.ligneId,
      date: { gte: fenetre.periodeDebut, lte: fenetre.periodeFin },
      statut: { not: StatutAstreinte.ANNULEE },
    },
  });

  return astreintesCount > 0;
}

async function chargerConfirmabiliteParFenetre(
  fenetres: { id: string; statut: StatutFenetreGeneration }[],
  astreintesParFenetre: Map<string, number>,
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();

  for (const fenetre of fenetres) {
    const confirmable =
      fenetre.statut === StatutFenetreGeneration.PLANIFIEE &&
      (astreintesParFenetre.get(fenetre.id) ?? 0) > 0;
    map.set(fenetre.id, confirmable);
  }

  return map;
}

export async function listLignesCampagneOptions(): Promise<LigneCampagneOption[]> {
  return prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true, ordrePriorite: true },
  });
}

export async function listCampagnesParLigne(): Promise<CampagneLigneRow[]> {
  const today = startOfTodayUtc();

  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    include: {
      fenetresGeneration: {
        where: { periodeFin: { gte: today } },
        orderBy: [
          { dateGenerationPrevue: "asc" },
          { periodeDebut: "asc" },
        ],
      },
    },
  });

  const astreintesParFenetre = new Map<string, number>();
  for (const ligne of lignes) {
    for (const fenetre of ligne.fenetresGeneration) {
      const count = await prisma.astreinte.count({
        where: {
          ligneId: fenetre.ligneId,
          date: { gte: fenetre.periodeDebut, lte: fenetre.periodeFin },
          statut: { not: StatutAstreinte.ANNULEE },
        },
      });
      astreintesParFenetre.set(fenetre.id, count);
    }
  }

  const confirmabilite = await chargerConfirmabiliteParFenetre(
    lignes.flatMap((ligne) => ligne.fenetresGeneration),
    astreintesParFenetre,
  );

  const nonPublieesParFenetre = new Map<string, number>();
  for (const ligne of lignes) {
    for (const fenetre of ligne.fenetresGeneration) {
      const count = await compterAstreintesNonPubliees({
        ligneId: fenetre.ligneId,
        periodeDebut: fenetre.periodeDebut,
        periodeFin: fenetre.periodeFin,
      });
      nonPublieesParFenetre.set(fenetre.id, count);
    }
  }

  return lignes.map((ligne) => ({
    ligneId: ligne.id,
    ligneNom: ligne.nom,
    ordrePriorite: ligne.ordrePriorite,
    campagnes: ligne.fenetresGeneration.map((fenetre) =>
      mapFenetre(fenetre, ligne, {
        confirmable: confirmabilite.get(fenetre.id) ?? false,
        nonPublieesCount: nonPublieesParFenetre.get(fenetre.id) ?? 0,
      }),
    ),
  }));
}

export async function getCampagnesResume(): Promise<CampagneItem[]> {
  const lignes = await listCampagnesParLigne();

  return lignes
    .flatMap((ligne) => ligne.campagnes)
    .sort((a, b) => {
      if (a.ordrePriorite !== b.ordrePriorite) {
        return a.ordrePriorite - b.ordrePriorite;
      }

      return a.dateGenerationPrevue.localeCompare(b.dateGenerationPrevue);
    });
}

type CampagneInput = {
  ligneId: string;
  periodeDebut: Date;
  periodeFin: Date;
  dateGenerationPrevue: Date;
};

function validateCampagneInput(body: Record<string, unknown>):
  | { data: CampagneInput }
  | { error: string; field?: string } {
  const ligneId =
    typeof body.ligneId === "string" ? body.ligneId.trim() : "";
  const periodeDebutStr =
    typeof body.periodeDebut === "string" ? body.periodeDebut.trim() : "";
  const periodeFinStr =
    typeof body.periodeFin === "string" ? body.periodeFin.trim() : "";
  const dateGenerationStr =
    typeof body.dateGenerationPrevue === "string"
      ? body.dateGenerationPrevue.trim()
      : "";

  if (!ligneId) {
    return { error: "La ligne est obligatoire.", field: "ligneId" };
  }

  const periodeDebut = parseDateInput(periodeDebutStr);
  const periodeFin = parseDateInput(periodeFinStr);
  const dateGenerationPrevue = parseDateInput(dateGenerationStr);

  if (!periodeDebut) {
    return {
      error: "Date de début de période invalide.",
      field: "periodeDebut",
    };
  }

  if (!periodeFin) {
    return { error: "Date de fin de période invalide.", field: "periodeFin" };
  }

  if (!dateGenerationPrevue) {
    return {
      error: "Date de génération prévue invalide.",
      field: "dateGenerationPrevue",
    };
  }

  if (periodeFin < periodeDebut) {
    return {
      error: "La fin de période doit être postérieure ou égale au début.",
      field: "periodeFin",
    };
  }

  return {
    data: {
      ligneId,
      periodeDebut,
      periodeFin,
      dateGenerationPrevue,
    },
  };
}

async function assertLigneActive(
  ligneId: string,
): Promise<{ id: string } | { error: string }> {
  const ligne = await prisma.ligneAstreinte.findFirst({
    where: { id: ligneId, actif: true },
    select: { id: true },
  });

  if (!ligne) {
    return { error: "Ligne introuvable ou inactive." };
  }

  return ligne;
}

export async function createFenetreGeneration(
  body: Record<string, unknown>,
): Promise<{ campagne: CampagneItem } | { error: string; field?: string }> {
  const validated = validateCampagneInput(body);
  if ("error" in validated) {
    return validated;
  }

  const ligne = await assertLigneActive(validated.data.ligneId);
  if ("error" in ligne) {
    return { error: ligne.error, field: "ligneId" };
  }

  const fenetre = await prisma.fenetreGeneration.create({
    data: {
      ligneId: validated.data.ligneId,
      periodeDebut: validated.data.periodeDebut,
      periodeFin: validated.data.periodeFin,
      dateGenerationPrevue: validated.data.dateGenerationPrevue,
      statut: StatutFenetreGeneration.PLANIFIEE,
    },
    include: {
      ligne: { select: { nom: true, ordrePriorite: true } },
    },
  });

  return {
    campagne: mapFenetre(fenetre, fenetre.ligne, {
      confirmable: await campagneEstConfirmable(fenetre.id),
      nonPublieesCount: await compterAstreintesNonPubliees({
        ligneId: fenetre.ligneId,
        periodeDebut: fenetre.periodeDebut,
        periodeFin: fenetre.periodeFin,
      }),
    }),
  };
}

export async function updateFenetreGeneration(
  body: Record<string, unknown>,
): Promise<{ campagne: CampagneItem } | { error: string; field?: string }> {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return { error: "Identifiant de campagne manquant.", field: "id" };
  }

  const existing = await prisma.fenetreGeneration.findUnique({
    where: { id },
    select: { id: true, statut: true },
  });

  if (!existing) {
    return { error: "Campagne introuvable." };
  }

  if (existing.statut === StatutFenetreGeneration.CONFIRMEE) {
    return {
      error:
        "Une campagne confirmée ne peut plus être modifiée.",
    };
  }

  const validated = validateCampagneInput(body);
  if ("error" in validated) {
    return validated;
  }

  const ligne = await assertLigneActive(validated.data.ligneId);
  if ("error" in ligne) {
    return { error: ligne.error, field: "ligneId" };
  }

  const fenetre = await prisma.fenetreGeneration.update({
    where: { id },
    data: {
      ligneId: validated.data.ligneId,
      periodeDebut: validated.data.periodeDebut,
      periodeFin: validated.data.periodeFin,
      dateGenerationPrevue: validated.data.dateGenerationPrevue,
    },
    include: {
      ligne: { select: { nom: true, ordrePriorite: true } },
    },
  });

  return {
    campagne: mapFenetre(fenetre, fenetre.ligne, {
      confirmable: await campagneEstConfirmable(fenetre.id),
      nonPublieesCount: await compterAstreintesNonPubliees({
        ligneId: fenetre.ligneId,
        periodeDebut: fenetre.periodeDebut,
        periodeFin: fenetre.periodeFin,
      }),
    }),
  };
}

export type ConfirmationCampagneResult = {
  campagne: CampagneItem;
  disponibilitesSupprimees: number;
  preferencesSupprimees: number;
};

export async function confirmerCampagne(
  fenetreId: string,
  cadreId: string,
): Promise<ConfirmationCampagneResult | { error: string }> {
  const fenetre = await prisma.fenetreGeneration.findUnique({
    where: { id: fenetreId },
    include: {
      ligne: { select: { id: true, nom: true, ordrePriorite: true } },
    },
  });

  if (!fenetre) {
    return { error: "Campagne introuvable." };
  }

  if (fenetre.statut !== StatutFenetreGeneration.PLANIFIEE) {
    return { error: "Seule une campagne planifiée peut être confirmée." };
  }

  const confirmable = await campagneEstConfirmable(fenetreId);
  if (!confirmable) {
    return {
      error:
        "Impossible de confirmer : aucune astreinte enregistrée sur la période de cette campagne.",
    };
  }

  const astreintes = await prisma.astreinte.findMany({
    where: {
      ligneId: fenetre.ligneId,
      date: { gte: fenetre.periodeDebut, lte: fenetre.periodeFin },
      statut: { not: StatutAstreinte.ANNULEE },
    },
    select: {
      iadeId: true,
      date: true,
      typeCreneau: true,
    },
  });

  const pendingJournals: Parameters<typeof journaliser>[0][] = [];
  let disponibilitesSupprimees = 0;
  let preferencesSupprimees = 0;

  await prisma.$transaction(async (tx) => {
    for (const astreinte of astreintes) {
      const autresLignes = await tx.qualification.findMany({
        where: {
          iadeId: astreinte.iadeId,
          ligneId: { not: fenetre.ligneId },
          ligne: { actif: true },
        },
        include: {
          ligne: { select: { id: true, nom: true } },
        },
      });

      if (autresLignes.length === 0) {
        continue;
      }

      const disponibilites = await tx.disponibilite.findMany({
        where: {
          iadeId: astreinte.iadeId,
          date: astreinte.date,
          typeCreneau: astreinte.typeCreneau,
          ligneId: { in: autresLignes.map((entry) => entry.ligneId) },
        },
        include: {
          ligne: { select: { nom: true } },
        },
      });

      for (const disponibilite of disponibilites) {
        await tx.disponibilite.delete({ where: { id: disponibilite.id } });
        disponibilitesSupprimees += 1;

        const creneauLabel =
          LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau];
        const dateLabel = formatDateFrCourt(astreinte.date);

        pendingJournals.push({
          typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO,
          iadeConcerneId: astreinte.iadeId,
          resume: `Disponibilité retirée sur ${disponibilite.ligne.nom} (${creneauLabel}, ${dateLabel}) suite à confirmation de la campagne ${fenetre.ligne.nom}.`,
          detail: {
            fenetreId: fenetre.id,
            ligneOrigineId: fenetre.ligneId,
            ligneOrigineNom: fenetre.ligne.nom,
            ligneImpacteeId: disponibilite.ligneId,
            ligneImpacteeNom: disponibilite.ligne.nom,
            date: formatDateIso(astreinte.date),
            typeCreneau: astreinte.typeCreneau,
            disponibiliteId: disponibilite.id,
          },
        });

        const prefsSupprimees = await cleanupPreferencesAfterDisponibiliteDelete(
          astreinte.iadeId,
          disponibilite.ligneId,
          disponibilite.date,
          disponibilite.typeCreneau,
          tx,
        );

        for (const preference of prefsSupprimees) {
          preferencesSupprimees += 1;
          const prefLabel =
            preference.type === TypePreferenceContinuite.WEEKEND_48H
              ? "week-end complet (48h)"
              : "24h";

          pendingJournals.push({
            typeAction: TypeActionAudit.PREFERENCE_SUPPRIMEE,
            iadeConcerneId: astreinte.iadeId,
            resume: `Préférence ${prefLabel} retirée sur ${disponibilite.ligne.nom} (${formatDateFrCourt(preference.dateDebut)}) suite à confirmation de la campagne ${fenetre.ligne.nom}.`,
            detail: {
              fenetreId: fenetre.id,
              ligneOrigineId: fenetre.ligneId,
              ligneOrigineNom: fenetre.ligne.nom,
              ligneImpacteeId: preference.ligneId,
              preferenceId: preference.id,
              type: preference.type,
              dateDebut: formatDateIso(preference.dateDebut),
            },
          });
        }
      }
    }

    await tx.fenetreGeneration.update({
      where: { id: fenetreId },
      data: {
        statut: StatutFenetreGeneration.CONFIRMEE,
        dateConfirmation: new Date(),
      },
    });
  });

  pendingJournals.push({
    acteurId: cadreId,
    typeAction: TypeActionAudit.CAMPAGNE_CONFIRMEE,
    resume: `Campagne ${fenetre.ligne.nom} confirmée (${formatDateFrCourt(fenetre.periodeDebut)} — ${formatDateFrCourt(fenetre.periodeFin)}).`,
    detail: {
      fenetreId: fenetre.id,
      ligneId: fenetre.ligneId,
      periodeDebut: formatDateIso(fenetre.periodeDebut),
      periodeFin: formatDateIso(fenetre.periodeFin),
      disponibilitesSupprimees,
      preferencesSupprimees,
    },
  });

  for (const entry of pendingJournals) {
    await journaliser(entry);
  }

  const campagneConfirmee = await prisma.fenetreGeneration.findUnique({
    where: { id: fenetreId },
    include: {
      ligne: { select: { nom: true, ordrePriorite: true } },
    },
  });

  if (!campagneConfirmee) {
    return { error: "Erreur lors de la confirmation de la campagne." };
  }

  return {
    campagne: mapFenetre(campagneConfirmee, campagneConfirmee.ligne, {
      confirmable: false,
      nonPublieesCount: 0,
    }),
    disponibilitesSupprimees,
    preferencesSupprimees,
  };
}
