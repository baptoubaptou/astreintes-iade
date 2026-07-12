import type { AstreinteListItem } from "@/server/astreintes";

/**
 * Résultat d'une simulation d'attribution (dry-run).
 * Conforme au cahier des charges §3.2 : l'algorithme ne doit jamais
 * écrire en base sans validation explicite du cadre.
 */
export type SimulatedAstreinte = {
  date: string;
  ligneId: string;
  ligneNom: string;
  iadeId: string;
  iadeNom: string;
  pointsAttribues: number;
  tirageAuSort?: boolean;
};

export type PlanningSimulationResult = {
  id: string;
  mois: string;
  createdAt: string;
  astreintes: SimulatedAstreinte[];
  stats: {
    total: number;
    parLigne: Record<string, number>;
  };
};

export type PlanningSimulationStatus =
  | "idle"
  | "running"
  | "ready"
  | "validated"
  | "rejected";

/**
 * Workflow cible (Phase 3) :
 * 1. simulatePlanning() → résultat figé en mémoire/session (pas de DB)
 * 2. validateSimulation() → persistance en base
 * 3. rejectSimulation() → abandon, possibilité de relancer
 *
 * Exclusion stricte : seuls les IADE qualifiés ET couverts par une
 * Disponibilite déclarée sont éligibles (cf. isIadeDisponibleSurDate,
 * validateAstreinteCoherenceStrict dans astreintes.ts).
 */
export type PlanningSimulationWorkflow = {
  status: PlanningSimulationStatus;
  result: PlanningSimulationResult | null;
};

export function createEmptySimulationWorkflow(): PlanningSimulationWorkflow {
  return { status: "idle", result: null };
}

/** Placeholder — implémentation Phase 3 */
export async function simulatePlanning(_options: {
  mois: string;
}): Promise<PlanningSimulationResult> {
  throw new Error(
    "La génération automatique en mode simulation sera disponible en Phase 3.",
  );
}

/** Placeholder — implémentation Phase 3 */
export async function validateSimulation(
  _simulationId: string,
): Promise<AstreinteListItem[]> {
  throw new Error(
    "La validation de simulation sera disponible en Phase 3.",
  );
}
