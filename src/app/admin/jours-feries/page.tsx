import { Suspense } from "react";
import { AdminJoursFeriesPanel } from "@/components/jours-feries/admin-jours-feries-panel";
import {
  listJoursFeries,
  parseAnneeJoursFeries,
} from "@/server/jours-feries";
import { requireCadre } from "@/server/require-cadre";

type AdminJoursFeriesPageProps = {
  searchParams: Promise<{ annee?: string }>;
};

export default async function AdminJoursFeriesPage({
  searchParams,
}: AdminJoursFeriesPageProps) {
  await requireCadre();

  const params = await searchParams;
  const anneeCourante = new Date().getUTCFullYear();
  const annee = parseAnneeJoursFeries(params.annee ?? String(anneeCourante));
  const anneeSuivante = anneeCourante + 1;
  const joursFeries = await listJoursFeries(annee);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Jours fériés</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Gestion hybride : calcul automatique des jours fériés français (fixes +
          Pâques), modifiable par le cadre. Un jour férié actif bascule les lignes
          en mode créneaux scindables (JOUR/NUIT), comme un week-end.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm">Chargement...</p>}>
        <AdminJoursFeriesPanel
          key={annee}
          annee={annee}
          anneeCourante={anneeCourante}
          anneeSuivante={anneeSuivante}
          joursFeries={joursFeries}
        />
      </Suspense>
    </main>
  );
}
