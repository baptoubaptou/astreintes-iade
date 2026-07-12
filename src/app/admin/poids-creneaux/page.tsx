import { AdminPoidsCreneauxPanel } from "@/components/poids-creneaux/admin-poids-creneaux-panel";
import { listPoidsCreneauxParLigne } from "@/server/poids-creneaux";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminPoidsCreneauxPage() {
  await requireCadre();
  const lignes = await listPoidsCreneauxParLigne();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Poids par créneau</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Chaque combinaison ligne × type de créneau a un poids paramétrable
          indépendamment. Ces points sont crédités à l&apos;IADE lors de
          l&apos;astreinte et servent à l&apos;équité de répartition de
          l&apos;algorithme.
        </p>
      </div>

      <AdminPoidsCreneauxPanel lignes={lignes} />
    </main>
  );
}
