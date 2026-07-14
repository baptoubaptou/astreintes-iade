import {
  StatutAstreinte,
  StatutFenetreGeneration,
  StatutLotGeneration,
  TypeActionAudit,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PropositionAffectation } from "@/server/algorithme-affectation";
import { resumerPropositions } from "@/server/algorithme-affectation";
import { parseDateInput, validateAstreinteCoherenceStrict } from "@/server/astreintes";
import { creneauxDisponiblesPour, chargerTypesJour } from "@/server/jours-feries";
import { journaliser } from "@/server/audit";
import { calculerPointsAttribues } from "@/server/points";
import {
  calculerPointsApresSimulation,
  type SimulationPlanningResult,
  type ValidationSimulationError,
} from "@/server/simulation-planning";
import { formatDateIso } from "@/server/campagnes";
import { getErreurDateDebutCalendrierPublie } from "@/server/calendrier-publie";
import { notifierNouvelleAffectationPlanning } from "@/server/publication-planning";
import { nettoyerDisponibilitesApresAffectationLigne } from "@/server/nettoyage-disponibilites-apres-affectation";
import { getModeAttribution } from "@/server/parametre-algorithme";

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function eachDayInclusive(debut: Date, fin: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(debut);

  while (cursor <= fin) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function collectAnneesPeriode(debut: Date, fin: Date): number[] {
  const annees = new Set<number>();
  const cursor = new Date(debut);

  while (cursor <= fin) {
    annees.add(cursor.getUTCFullYear());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...annees].sort((a, b) => a - b);
}

export type LotEnAttenteSummary = {
  id: string;
  ligneId: string;
  ligneNom: string;
  periodeDebut: string;
  periodeFin: string;
  dateCreation: string;
  astreintesCount: number;
  fenetreGenerationId: string | null;
};

export type EnregistrerLotResult =
  | {
      success: true;
      lotId: string;
      created: number;
      publie: boolean;
      nonPourvues: number;
    }
  | {
      success: false;
      errors: ValidationSimulationError[];
    };

export type PublierLotResult =
  | {
      success: true;
      publiees: number;
      disponibilitesSupprimees: number;
      preferencesSupprimees: number;
      campagneConfirmee: boolean;
    }
  | { error: string };

export type AnnulerLotResult =
  | { success: true; astreintesSupprimees: number }
  | { error: string };

export async function getLotEnAttentePublication(): Promise<LotEnAttenteSummary | null> {
  const lot = await prisma.lotGeneration.findFirst({
    where: { statut: StatutLotGeneration.EN_ATTENTE_PUBLICATION },
    orderBy: { dateCreation: "desc" },
    include: {
      ligne: { select: { nom: true } },
      _count: { select: { astreintes: true } },
    },
  });

  if (!lot) {
    return null;
  }

  return {
    id: lot.id,
    ligneId: lot.ligneId,
    ligneNom: lot.ligne.nom,
    periodeDebut: formatDateIso(lot.periodeDebut),
    periodeFin: formatDateIso(lot.periodeFin),
    dateCreation: lot.dateCreation.toISOString(),
    astreintesCount: lot._count.astreintes,
    fenetreGenerationId: lot.fenetreGenerationId,
  };
}

/** Verrou « Par astreinte » : bloque toute simulation ciblée tant qu'un lot est en attente. */
export async function getErreurVerrouSimulationParAstreinte(
  ligneId?: string,
): Promise<string | null> {
  if (!ligneId) {
    return null;
  }

  const lot = await getLotEnAttentePublication();
  if (!lot) {
    return null;
  }

  return `Une génération est déjà en attente de publication sur ${lot.ligneNom}, terminez-la d'abord.`;
}

export async function getLotEnAttentePourLigne(
  ligneId: string,
): Promise<LotEnAttenteSummary | null> {
  const lot = await prisma.lotGeneration.findFirst({
    where: {
      ligneId,
      statut: StatutLotGeneration.EN_ATTENTE_PUBLICATION,
    },
    include: {
      ligne: { select: { nom: true } },
      _count: { select: { astreintes: true } },
    },
  });

  if (!lot) {
    return null;
  }

  return {
    id: lot.id,
    ligneId: lot.ligneId,
    ligneNom: lot.ligne.nom,
    periodeDebut: formatDateIso(lot.periodeDebut),
    periodeFin: formatDateIso(lot.periodeFin),
    dateCreation: lot.dateCreation.toISOString(),
    astreintesCount: lot._count.astreintes,
    fenetreGenerationId: lot.fenetreGenerationId,
  };
}

export async function trouverFenetreGenerationAssociee(
  ligneId: string,
  periodeDebut: Date,
  periodeFin: Date,
): Promise<string | null> {
  const fenetre = await prisma.fenetreGeneration.findFirst({
    where: {
      ligneId,
      archivee: false,
      statut: StatutFenetreGeneration.PLANIFIEE,
      periodeDebut: normalizeUtcDay(periodeDebut),
      periodeFin: normalizeUtcDay(periodeFin),
    },
    select: { id: true },
  });

  return fenetre?.id ?? null;
}

export async function getCampagnePlanifieeProchaine(): Promise<{
  id: string;
  ligneId: string;
  ligneNom: string;
  periodeDebut: string;
  periodeFin: string;
  dateGenerationPrevue: string;
} | null> {
  const fenetre = await prisma.fenetreGeneration.findFirst({
    where: {
      archivee: false,
      statut: StatutFenetreGeneration.PLANIFIEE,
    },
    orderBy: [{ dateGenerationPrevue: "asc" }, { periodeDebut: "asc" }],
    include: {
      ligne: { select: { nom: true } },
    },
  });

  if (!fenetre) {
    return null;
  }

  return {
    id: fenetre.id,
    ligneId: fenetre.ligneId,
    ligneNom: fenetre.ligne.nom,
    periodeDebut: formatDateIso(fenetre.periodeDebut),
    periodeFin: formatDateIso(fenetre.periodeFin),
    dateGenerationPrevue: formatDateIso(fenetre.dateGenerationPrevue),
  };
}

async function validerPropositionsPourEnregistrement(
  propositions: PropositionAffectation[],
  ligneId: string,
): Promise<
  | {
      success: true;
      aCreer: PropositionAffectation[];
    }
  | { success: false; errors: ValidationSimulationError[] }
> {
  const horsLigne = propositions.filter(
    (proposition) => proposition.ligneId !== ligneId,
  );

  if (horsLigne.length > 0) {
    return {
      success: false,
      errors: [
        {
          date: "—",
          ligneNom: "—",
          message:
            "La simulation contient des propositions hors de la ligne sélectionnée.",
        },
      ],
    };
  }

  const aCreer = propositions.filter(
    (proposition) =>
      proposition.iadeId && !proposition.nonPourvu && !proposition.dejaPlanifie,
  );
  const errors: ValidationSimulationError[] = [];
  const slotsParLigneDate = new Map<string, import("@prisma/client").TypeCreneau[]>();
  const creneauxIadeParJour = new Map<string, import("@prisma/client").TypeCreneau[]>();

  for (const proposition of aCreer) {
    const ligneDateKey = `${proposition.date}:${proposition.ligneId}`;
    const typesLigne = slotsParLigneDate.get(ligneDateKey) ?? [];
    if (typesLigne.includes(proposition.typeCreneau)) {
      errors.push({
        date: proposition.date,
        ligneNom: proposition.ligneNom,
        message: "Doublon de créneau dans la simulation.",
      });
    } else {
      typesLigne.push(proposition.typeCreneau);
      slotsParLigneDate.set(ligneDateKey, typesLigne);
    }

    const iadeJourKey = `${proposition.date}:${proposition.iadeId}`;
    const typesIade = creneauxIadeParJour.get(iadeJourKey) ?? [];
    if (typesIade.includes(proposition.typeCreneau)) {
      errors.push({
        date: proposition.date,
        ligneNom: proposition.ligneNom,
        message: "IADE en double affectation dans la simulation.",
      });
    } else {
      typesIade.push(proposition.typeCreneau);
      creneauxIadeParJour.set(iadeJourKey, typesIade);
    }
  }

  for (const proposition of aCreer) {
    const date = parseDateInput(proposition.date);
    if (!date) {
      errors.push({
        date: proposition.date,
        ligneNom: proposition.ligneNom,
        message: "Date invalide.",
      });
      continue;
    }

    const coherenceError = await validateAstreinteCoherenceStrict({
      date,
      ligneId: proposition.ligneId,
      iadeId: proposition.iadeId!,
      typeCreneau: proposition.typeCreneau,
    });

    if (coherenceError) {
      errors.push({
        date: proposition.date,
        ligneNom: proposition.ligneNom,
        message: coherenceError.error.message,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, aCreer };
}

export async function enregistrerLotFromSimulation(
  params: {
    propositions: PropositionAffectation[];
    ligneId: string;
    dateDebut: Date;
    dateFin: Date;
    publier: boolean;
    acteurId: string;
  },
): Promise<EnregistrerLotResult> {
  const lotBloquant = await getLotEnAttentePublication();
  if (lotBloquant) {
    return {
      success: false,
      errors: [
        {
          date: "—",
          ligneNom: lotBloquant.ligneNom,
          message:
            "Une génération est déjà en attente de publication. Publiez-la ou annulez-la avant d'en enregistrer une nouvelle.",
        },
      ],
    };
  }

  const validation = await validerPropositionsPourEnregistrement(
    params.propositions,
    params.ligneId,
  );

  if (!validation.success) {
    return validation;
  }

  const erreurCalendrier = await getErreurDateDebutCalendrierPublie(
    params.dateDebut,
    params.ligneId,
  );
  if (erreurCalendrier) {
    return {
      success: false,
      errors: [{ date: "—", ligneNom: "—", message: erreurCalendrier }],
    };
  }

  const debut = normalizeUtcDay(params.dateDebut);
  const fin = normalizeUtcDay(params.dateFin);
  const fenetreGenerationId = await trouverFenetreGenerationAssociee(
    params.ligneId,
    debut,
    fin,
  );

  try {
    const baseCreations = await Promise.all(
      validation.aCreer.map(async (proposition) => {
        const date = parseDateInput(proposition.date)!;

        return {
          date,
          ligneId: proposition.ligneId,
          iadeId: proposition.iadeId!,
          typeCreneau: proposition.typeCreneau,
          pointsAttribues: await calculerPointsAttribues(
            proposition.ligneId,
            proposition.typeCreneau,
          ),
        };
      }),
    );

    const publier = params.publier;

    const lot = await prisma.$transaction(async (tx) => {
      const lotRecord = await tx.lotGeneration.create({
        data: {
          ligneId: params.ligneId,
          periodeDebut: debut,
          periodeFin: fin,
          statut: StatutLotGeneration.EN_ATTENTE_PUBLICATION,
          fenetreGenerationId,
        },
      });

      for (const creation of baseCreations) {
        await tx.astreinte.create({
          data: {
            ...creation,
            statut: StatutAstreinte.PLANIFIEE,
            publie: false,
            lotGenerationId: lotRecord.id,
          },
        });
      }

      return lotRecord;
    });

    await journaliser({
      acteurId: params.acteurId,
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      resume: `${baseCreations.length} astreinte(s) enregistrée(s) via lot ${lot.id}${publier ? " (publication immédiate)" : " (en attente de publication)"}.`,
      detail: {
        lotId: lot.id,
        ligneId: params.ligneId,
        count: baseCreations.length,
        publie: publier,
        fenetreGenerationId,
      },
    });

    if (publier) {
      const publishResult = await publierLotGeneration(lot.id, params.acteurId);

      if ("error" in publishResult) {
        return {
          success: false,
          errors: [
            {
              date: "—",
              ligneNom: "—",
              message: publishResult.error,
            },
          ],
        };
      }
    }

    return {
      success: true,
      lotId: lot.id,
      created: validation.aCreer.length,
      publie: publier,
      nonPourvues: params.propositions.filter(
        (proposition) => proposition.nonPourvu,
      ).length,
    };
  } catch {
    return {
      success: false,
      errors: [
        {
          date: "—",
          ligneNom: "—",
          message:
            "Conflit à l'enregistrement : le planning a peut-être changé depuis la simulation.",
        },
      ],
    };
  }
}

export async function publierLotGeneration(
  lotId: string,
  cadreId: string,
): Promise<PublierLotResult> {
  const lot = await prisma.lotGeneration.findUnique({
    where: { id: lotId },
    include: {
      ligne: { select: { id: true, nom: true } },
      fenetreGeneration: {
        select: { id: true, statut: true, archivee: true },
      },
      astreintes: {
        where: { statut: { not: StatutAstreinte.ANNULEE } },
        include: {
          ligne: { select: { nom: true } },
          iade: {
            select: { id: true, email: true, prenom: true, nom: true },
          },
        },
      },
    },
  });

  if (!lot) {
    return { error: "Lot introuvable." };
  }

  if (lot.statut !== StatutLotGeneration.EN_ATTENTE_PUBLICATION) {
    return { error: "Seul un lot en attente de publication peut être publié." };
  }

  const aNotifier = lot.astreintes.filter((astreinte) => !astreinte.publie);

  if (aNotifier.length === 0) {
    return { error: "Ce lot ne contient aucune astreinte à publier." };
  }

  const now = new Date();
  const pendingJournals: Parameters<typeof journaliser>[0][] = [];
  let disponibilitesSupprimees = 0;
  let preferencesSupprimees = 0;
  let campagneConfirmee = false;

  await prisma.$transaction(async (tx) => {
    await tx.lotGeneration.update({
      where: { id: lotId },
      data: {
        statut: StatutLotGeneration.PUBLIE,
        datePublication: now,
      },
    });

    await tx.astreinte.updateMany({
      where: {
        lotGenerationId: lotId,
        statut: { not: StatutAstreinte.ANNULEE },
      },
      data: {
        publie: true,
        datePublication: now,
      },
    });

    const { result, journals } = await nettoyerDisponibilitesApresAffectationLigne(
      {
        ligneOrigineId: lot.ligneId,
        ligneOrigineNom: lot.ligne.nom,
        astreintes: lot.astreintes.map((astreinte) => ({
          iadeId: astreinte.iadeId,
          date: astreinte.date,
          typeCreneau: astreinte.typeCreneau,
        })),
        motifJournal: `suite à publication du lot sur ${lot.ligne.nom}.`,
        detailJournal: {
          lotId: lot.id,
          fenetreGenerationId: lot.fenetreGenerationId,
        },
      },
      tx,
    );

    disponibilitesSupprimees = result.disponibilitesSupprimees;
    preferencesSupprimees = result.preferencesSupprimees;
    pendingJournals.push(...journals);

    if (
      lot.fenetreGenerationId &&
      lot.fenetreGeneration &&
      !lot.fenetreGeneration.archivee &&
      lot.fenetreGeneration.statut === StatutFenetreGeneration.PLANIFIEE
    ) {
      await tx.fenetreGeneration.update({
        where: { id: lot.fenetreGenerationId },
        data: {
          statut: StatutFenetreGeneration.CONFIRMEE,
          dateConfirmation: now,
        },
      });
      campagneConfirmee = true;
    }
  });

  for (const astreinte of aNotifier) {
    await notifierNouvelleAffectationPlanning(astreinte);
  }

  pendingJournals.push({
    acteurId: cadreId,
    typeAction: TypeActionAudit.PLANNING_PUBLIE,
    resume: `Lot publié sur ${lot.ligne.nom} (${formatDateIso(lot.periodeDebut)} — ${formatDateIso(lot.periodeFin)}) : ${aNotifier.length} astreinte(s).`,
    detail: {
      lotId: lot.id,
      ligneId: lot.ligneId,
      astreinteIds: aNotifier.map((astreinte) => astreinte.id),
      disponibilitesSupprimees,
      preferencesSupprimees,
      fenetreGenerationId: lot.fenetreGenerationId,
      campagneConfirmee,
    },
  });

  if (campagneConfirmee && lot.fenetreGenerationId) {
    pendingJournals.push({
      acteurId: cadreId,
      typeAction: TypeActionAudit.CAMPAGNE_CONFIRMEE,
      resume: `Campagne ${lot.ligne.nom} confirmée à la publication du lot.`,
      detail: {
        fenetreId: lot.fenetreGenerationId,
        lotId: lot.id,
        ligneId: lot.ligneId,
        periodeDebut: formatDateIso(lot.periodeDebut),
        periodeFin: formatDateIso(lot.periodeFin),
        disponibilitesSupprimees,
        preferencesSupprimees,
      },
    });
  }

  for (const entry of pendingJournals) {
    await journaliser(entry);
  }

  return {
    success: true,
    publiees: aNotifier.length,
    disponibilitesSupprimees,
    preferencesSupprimees,
    campagneConfirmee,
  };
}

export async function annulerLotGeneration(
  lotId: string,
  cadreId: string,
): Promise<AnnulerLotResult> {
  const lot = await prisma.lotGeneration.findUnique({
    where: { id: lotId },
    include: {
      ligne: { select: { nom: true } },
      astreintes: {
        where: { lotGenerationId: lotId },
        select: { id: true },
      },
    },
  });

  if (!lot) {
    return { error: "Lot introuvable." };
  }

  if (lot.statut !== StatutLotGeneration.EN_ATTENTE_PUBLICATION) {
    return { error: "Seul un lot en attente de publication peut être annulé." };
  }

  const astreinteIds = lot.astreintes.map((astreinte) => astreinte.id);

  await prisma.$transaction(async (tx) => {
    if (astreinteIds.length > 0) {
      await tx.astreinte.deleteMany({
        where: { id: { in: astreinteIds } },
      });
    }

    await tx.lotGeneration.update({
      where: { id: lotId },
      data: { statut: StatutLotGeneration.ANNULE },
    });
  });

  await journaliser({
    acteurId: cadreId,
    typeAction: TypeActionAudit.ASTREINTE_ANNULEE,
    resume: `Lot annulé sur ${lot.ligne.nom} (${formatDateIso(lot.periodeDebut)} — ${formatDateIso(lot.periodeFin)}) : ${astreinteIds.length} astreinte(s) supprimée(s).`,
    detail: {
      lotId: lot.id,
      ligneId: lot.ligneId,
      astreinteIds,
    },
  });

  return { success: true, astreintesSupprimees: astreinteIds.length };
}

export async function construireApercuDepuisLot(
  lotId: string,
): Promise<SimulationPlanningResult | { error: string }> {
  const lot = await prisma.lotGeneration.findUnique({
    where: { id: lotId },
    include: {
      ligne: { select: { id: true, nom: true } },
      astreintes: {
        where: { statut: { not: StatutAstreinte.ANNULEE } },
        include: {
          iade: { select: { id: true, nom: true, prenom: true } },
        },
      },
    },
  });

  if (!lot) {
    return { error: "Lot introuvable." };
  }

  const debut = normalizeUtcDay(lot.periodeDebut);
  const fin = normalizeUtcDay(lot.periodeFin);
  const jours = eachDayInclusive(debut, fin);
  const typesJourMap = await chargerTypesJour(jours);
  const typesJourParDate = Object.fromEntries(typesJourMap);

  const astreintesPeriode = await prisma.astreinte.findMany({
    where: {
      ligneId: lot.ligneId,
      date: { gte: debut, lte: fin },
      statut: { not: StatutAstreinte.ANNULEE },
    },
    select: {
      ligneId: true,
      typeCreneau: true,
      date: true,
      pointsAttribues: true,
      lotGenerationId: true,
      iade: { select: { id: true, nom: true, prenom: true } },
    },
  });

  const astreinteParSlot = new Map<string, (typeof astreintesPeriode)[number]>();
  for (const astreinte of astreintesPeriode) {
    const dateKey = formatDateIso(normalizeUtcDay(astreinte.date));
    astreinteParSlot.set(
      `${dateKey}:${astreinte.ligneId}:${astreinte.typeCreneau}`,
      astreinte,
    );
  }

  const propositions: PropositionAffectation[] = [];

  for (const jour of jours) {
    const dateKey = formatDateIso(jour);
    const typeJour = typesJourMap.get(dateKey);
    if (!typeJour) {
      continue;
    }

    const creneaux = creneauxDisponiblesPour(typeJour);

    for (const typeCreneau of creneaux) {
      const slotKey = `${dateKey}:${lot.ligneId}:${typeCreneau}`;
      const astreinte = astreinteParSlot.get(slotKey);

      if (astreinte) {
        const dansLot = astreinte.lotGenerationId === lot.id;
        propositions.push({
          date: dateKey,
          ligneId: lot.ligneId,
          ligneNom: lot.ligne.nom,
          typeCreneau,
          iadeId: astreinte.iade.id,
          iadeNom: `${astreinte.iade.prenom} ${astreinte.iade.nom}`,
          pointsAttribues: astreinte.pointsAttribues,
          dejaPlanifie: dansLot ? undefined : true,
        });
      } else {
        propositions.push({
          date: dateKey,
          ligneId: lot.ligneId,
          ligneNom: lot.ligne.nom,
          typeCreneau,
          iadeId: null,
          iadeNom: null,
          pointsAttribues: 0,
          nonPourvu: true,
        });
      }
    }
  }

  const annees = collectAnneesPeriode(debut, fin);
  const modeAttribution = await getModeAttribution();
  const pointsApresSimulation = await calculerPointsApresSimulation(
    annees,
    propositions,
  );

  return {
    propositions,
    resume: resumerPropositions(propositions),
    periode: {
      dateDebut: formatDateIso(debut),
      dateFin: formatDateIso(fin),
    },
    annees,
    lignes: [{ id: lot.ligne.id, nom: lot.ligne.nom }],
    pointsApresSimulation,
    typesJourParDate,
    modeAttribution,
  };
}

export async function getContexteAffectationParAstreinte(): Promise<{
  campagneProchaine: Awaited<ReturnType<typeof getCampagnePlanifieeProchaine>>;
  lotEnAttente: LotEnAttenteSummary | null;
}> {
  const [campagneProchaine, lotEnAttente] = await Promise.all([
    getCampagnePlanifieeProchaine(),
    getLotEnAttentePublication(),
  ]);

  return { campagneProchaine, lotEnAttente };
}
