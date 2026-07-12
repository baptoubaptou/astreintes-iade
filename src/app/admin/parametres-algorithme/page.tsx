import { AdminAlgorithmePanel } from "@/components/algorithme/admin-algorithme-panel";
import {
  ensureParametreLisseSeuilEcartAberrant,
  getModeAttribution,
  listSeuilsEcartAberrantParLigne,
} from "@/server/parametre-algorithme";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminParametresAlgorithmePage() {
  await requireCadre();
  await ensureParametreLisseSeuilEcartAberrant();

  const [mode, seuilsEcartAberrant] = await Promise.all([
    getModeAttribution(),
    listSeuilsEcartAberrantParLigne(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Paramètres de l&apos;algorithme</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Mode d&apos;attribution et seuils du mode lissé pour la génération
          automatique du planning.
        </p>
      </header>
      <AdminAlgorithmePanel
        modeInitial={mode}
        seuilsInitiaux={seuilsEcartAberrant}
      />
    </main>
  );
}
