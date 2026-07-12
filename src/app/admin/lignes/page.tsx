import { CreateLigneForm } from "@/components/lignes/create-ligne-form";
import { LignesTable } from "@/components/lignes/lignes-table";
import { listLignesAstreinte } from "@/server/lignes";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminLignesPage() {
  await requireCadre();
  const lignes = await listLignesAstreinte();

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Lignes d&apos;astreinte</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Gérer les lignes et leur ordre de priorité. Les poids par créneau se
          configurent sur{" "}
          <a href="/admin/poids-creneaux" className="underline">
            Poids par créneau
          </a>
          . La désactivation préserve l&apos;historique des astreintes liées.
        </p>
      </div>

      <CreateLigneForm />
      <LignesTable lignes={lignes} />
    </main>
  );
}
