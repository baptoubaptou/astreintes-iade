import { AdminCampagnesPanel } from "@/components/campagnes/admin-campagnes-panel";
import {
  listCampagnesParLigne,
  listLignesCampagneOptions,
} from "@/server/campagnes";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminCampagnesPage() {
  await requireCadre();

  const [lignes, lignesOptions] = await Promise.all([
    listCampagnesParLigne(),
    listLignesCampagneOptions(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Campagnes de planification</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Planifiez, par ligne, les périodes couvertes et les dates de génération
          automatique du planning.
        </p>
      </header>
      <AdminCampagnesPanel lignes={lignes} lignesOptions={lignesOptions} />
    </main>
  );
}
