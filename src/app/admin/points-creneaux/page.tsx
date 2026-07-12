import { AdminBonusContinuitePanel } from "@/components/bonus-continuite/admin-bonus-continuite-panel";
import { AdminPoidsCreneauxPanel } from "@/components/poids-creneaux/admin-poids-creneaux-panel";
import { getBonusContinuiteMatrix } from "@/server/bonus-continuite";
import { listPoidsCreneauxParLigne } from "@/server/poids-creneaux";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminPointsCreneauxPage() {
  await requireCadre();

  const [lignesPoints, lignesBonus] = await Promise.all([
    listPoidsCreneauxParLigne(),
    getBonusContinuiteMatrix(),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Points par créneau</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Chaque combinaison ligne × type de créneau a un nombre de points
          paramétrable. Ces points sont crédités à l&apos;IADE lors de
          l&apos;astreinte et servent à l&apos;équité de répartition de
          l&apos;algorithme.
        </p>
      </header>

      <AdminPoidsCreneauxPanel lignes={lignesPoints} />

      <section id="bonus-continuite" className="space-y-4 border-t border-zinc-200 pt-10">
        <header>
          <h2 className="text-xl font-semibold">Bonus de continuité</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Points supplémentaires lorsqu&apos;un même IADE couvre des créneaux
            liés (24 h ou 48 h), par ligne d&apos;astreinte.
          </p>
        </header>

        <AdminBonusContinuitePanel lignes={lignesBonus} />
      </section>
    </main>
  );
}
