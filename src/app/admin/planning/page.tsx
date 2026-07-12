import { Suspense } from "react";
import { PlanningAdmin } from "@/components/planning/planning-admin";
import { PlanningSimulationPanel } from "@/components/planning/planning-simulation-panel";
import {
  getActiveIadesOptions,
  getActiveLignesOptions,
  getQualifiedIadesByLigne,
  listAstreintes,
  parseMoisParam,
  shiftMois,
} from "@/server/astreintes";
import { compterAstreintesNonPubliees } from "@/server/publication-planning";
import { requireCadre } from "@/server/require-cadre";

type AdminPlanningPageProps = {
  searchParams: Promise<{
    mois?: string;
    ligneId?: string;
    iadeId?: string;
    success?: string;
    created?: string;
    nonPourvues?: string;
  }>;
};

export default async function AdminPlanningPage({
  searchParams,
}: AdminPlanningPageProps) {
  await requireCadre();

  const params = await searchParams;
  const { value: mois } = parseMoisParam(params.mois);
  const ligneId = params.ligneId || undefined;
  const iadeId = params.iadeId || undefined;

  const [astreintes, lignes, iades, qualifiedByLigne, nonPublieesCount] =
    await Promise.all([
    listAstreintes({ mois, ligneId, iadeId }),
    getActiveLignesOptions(),
    getActiveIadesOptions(),
    getQualifiedIadesByLigne(),
    compterAstreintesNonPubliees({ mois }),
  ]);

  const currentMonth = shiftMois(mois, 0);
  const prevMois = shiftMois(mois, -1).value;
  const nextMois = shiftMois(mois, 1).value;
  const simulationSuccess = params.success === "simulation";
  const createdCount = params.created ? Number(params.created) : 0;
  const nonPourvuesCount = params.nonPourvues ? Number(params.nonPourvues) : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Gestion du planning</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Gestion manuelle des astreintes. La génération automatique passera
          obligatoirement par une simulation validée par le cadre (cf. cahier
          des charges §3.2).
        </p>
      </div>

      {simulationSuccess ? (
        <div
          className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="status"
        >
          Simulation validée et appliquée : {createdCount} astreinte
          {createdCount > 1 ? "s" : ""} créée{createdCount > 1 ? "s" : ""}.
          {nonPourvuesCount > 0
            ? ` ${nonPourvuesCount} créneau${nonPourvuesCount > 1 ? "x" : ""} non pourvu${nonPourvuesCount > 1 ? "s" : ""} reste${nonPourvuesCount > 1 ? "nt" : ""} à traiter manuellement.`
            : ""}
        </div>
      ) : null}

      <PlanningSimulationPanel mois={mois} />

      <Suspense fallback={<p className="text-sm">Chargement...</p>}>
        <PlanningAdmin
          mois={mois}
          moisLabel={currentMonth.label}
          prevMois={prevMois}
          nextMois={nextMois}
          astreintes={astreintes}
          lignes={lignes}
          iades={iades}
          qualifiedByLigne={qualifiedByLigne}
          selectedLigneId={ligneId}
          selectedIadeId={iadeId}
          nonPublieesCount={nonPublieesCount}
        />
      </Suspense>
    </main>
  );
}
