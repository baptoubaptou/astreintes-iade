import { AdminBonusContinuitePanel } from "@/components/bonus-continuite/admin-bonus-continuite-panel";
import { getBonusContinuiteMatrix } from "@/server/bonus-continuite";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminBonusContinuitePage() {
  await requireCadre();
  const lignes = await getBonusContinuiteMatrix();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Bonus de continuité</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Points supplémentaires lorsqu&apos;un même IADE couvre des créneaux
          liés (24h ou 48h), par ligne d&apos;astreinte.
        </p>
      </header>
      <AdminBonusContinuitePanel lignes={lignes} />
    </main>
  );
}
