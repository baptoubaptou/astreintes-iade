import { StatutAstreinte, TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  genererPlanningAutomatique,
  resumerPropositions,
  type PropositionAffectation,
} from "@/server/algorithme-affectation";
import { chargerTypesJour, type TypeJour } from "@/server/jours-feries";
import { parseDateInput, validateAstreinteCoherenceStrict } from "@/server/astreintes";
import {
  calculerPointsAttribues,
  projecterPointsApresPropositions,
  type PointsProjectesIade,
} from "@/server/points";
import { journaliser } from "@/server/audit";
import { TypeActionAudit } from "@prisma/client";

export type PointsSimulesIade = PointsProjectesIade;

export type SimulationPlanningResult = {
  propositions: PropositionAffectation[];
  resume: ReturnType<typeof resumerPropositions>;
  periode: { dateDebut: string; dateFin: string };
  annees: number[];
  lignes: Array<{ id: string; nom: string }>;
  pointsApresSimulation: PointsSimulesIade[];
  typesJourParDate: Record<string, TypeJour>;
};

export type ValidationSimulationError = {
  date: string;
  ligneNom: string;
  message: string;
};

export type ValidationSimulationResult =
  | {
      success: true;
      created: number;
      nonPourvues: number;
    }
  | {
      success: false;
      errors: ValidationSimulationError[];
    };

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getDefaultNextMonthRange(): {
  dateDebut: string;
  dateFin: string;
} {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const dateDebut = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const dateFin = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { dateDebut, dateFin };
}

export function parsePeriodeInput(
  input: Record<string, unknown>,
): { dateDebut: Date; dateFin: Date } | { error: string } {
  const dateDebutStr =
    typeof input.dateDebut === "string" ? input.dateDebut.trim() : "";
  const dateFinStr =
    typeof input.dateFin === "string" ? input.dateFin.trim() : "";

  if (!dateDebutStr || !dateFinStr) {
    return { error: "Les dates de début et de fin sont requises." };
  }

  const dateDebut = parseDateInput(dateDebutStr);
  const dateFin = parseDateInput(dateFinStr);

  if (!dateDebut || !dateFin) {
    return { error: "Les dates sont invalides." };
  }

  if (dateFin < dateDebut) {
    return {
      error: "La date de fin doit être postérieure ou égale à la date de début.",
    };
  }

  return { dateDebut, dateFin };
}

export function parsePropositionsInput(
  input: unknown,
): PropositionAffectation[] | { error: string } {
  if (!Array.isArray(input)) {
    return { error: "Le champ propositions doit être un tableau." };
  }

  const propositions: PropositionAffectation[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { error: "Proposition invalide." };
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.date !== "string" ||
      typeof record.ligneId !== "string" ||
      typeof record.ligneNom !== "string"
    ) {
      return { error: "Proposition incomplète ou invalide." };
    }

    if (!parseDateInput(record.date)) {
      return { error: `Date invalide : ${record.date}` };
    }

    const iadeId =
      record.iadeId === null
        ? null
        : typeof record.iadeId === "string"
          ? record.iadeId
          : undefined;

    if (iadeId === undefined) {
      return { error: "iadeId invalide dans une proposition." };
    }

    const iadeNom =
      record.iadeNom === null
        ? null
        : typeof record.iadeNom === "string"
          ? record.iadeNom
          : undefined;

    if (iadeNom === undefined) {
      return { error: "iadeNom invalide dans une proposition." };
    }

    const typeCreneauRaw = record.typeCreneau;
    const typeCreneau =
      typeof typeCreneauRaw === "string" &&
      Object.values(TypeCreneau).includes(typeCreneauRaw as TypeCreneau)
        ? (typeCreneauRaw as TypeCreneau)
        : TypeCreneau.NUIT_SEMAINE;

    propositions.push({
      date: record.date,
      ligneId: record.ligneId,
      ligneNom: record.ligneNom,
      typeCreneau,
      iadeId,
      iadeNom,
      pointsAttribues:
        typeof record.pointsAttribues === "number" ? record.pointsAttribues : 0,
      nonPourvu: record.nonPourvu === true ? true : undefined,
      dejaPlanifie: record.dejaPlanifie === true ? true : undefined,
      tirageAuSort: record.tirageAuSort === true ? true : undefined,
    });
  }

  return propositions;
}

export async function calculerPointsApresSimulation(
  annees: number[],
  propositions: PropositionAffectation[],
): Promise<PointsSimulesIade[]> {
  const rows = await Promise.all(
    annees.map((annee) =>
      projecterPointsApresPropositions(annee, propositions),
    ),
  );

  return rows.flat();
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

export async function executerSimulationPlanning(
  dateDebut: Date,
  dateFin: Date,
): Promise<SimulationPlanningResult> {
  const debut = normalizeUtcDay(dateDebut);
  const fin = normalizeUtcDay(dateFin);
  const propositions = await genererPlanningAutomatique(debut, fin);
  const annees = collectAnneesPeriode(debut, fin);
  const joursPeriode: Date[] = [];
  const cursor = new Date(debut);
  while (cursor <= fin) {
    joursPeriode.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const typesJourMap = await chargerTypesJour(joursPeriode);
  const typesJourParDate = Object.fromEntries(typesJourMap) as Record<
    string,
    TypeJour
  >;

  const [lignes, pointsApresSimulation] = await Promise.all([
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true },
    }),
    calculerPointsApresSimulation(annees, propositions),
  ]);

  return {
    propositions,
    resume: resumerPropositions(propositions),
    periode: {
      dateDebut: debut.toISOString().slice(0, 10),
      dateFin: fin.toISOString().slice(0, 10),
    },
    annees,
    lignes,
    pointsApresSimulation,
    typesJourParDate,
  };
}

export async function validerSimulationPlanning(
  propositions: PropositionAffectation[],
  acteurId: string,
): Promise<ValidationSimulationResult> {
  const aCreer = propositions.filter(
    (proposition) =>
      proposition.iadeId && !proposition.nonPourvu && !proposition.dejaPlanifie,
  );
  const errors: ValidationSimulationError[] = [];
  const slotsParLigneDate = new Map<string, TypeCreneau[]>();
  const creneauxIadeParJour = new Map<string, TypeCreneau[]>();

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

  try {
    const baseCreations = await Promise.all(
      aCreer.map(async (proposition) => {
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
    const creations = baseCreations;

    await prisma.$transaction(
      creations.map((creation) =>
        prisma.astreinte.create({
          data: {
            ...creation,
            statut: StatutAstreinte.PLANIFIEE,
            publie: false,
          },
        }),
      ),
    );

    await journaliser({
      acteurId,
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      resume: `${creations.length} astreinte(s) créée(s) via validation de simulation.`,
      detail: { count: creations.length },
    });
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

  return {
    success: true,
    created: aCreer.length,
    nonPourvues: propositions.filter((proposition) => proposition.nonPourvu)
      .length,
  };
}
