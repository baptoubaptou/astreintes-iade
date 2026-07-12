import { Suspense } from "react";
import { AdminJournalPanel } from "@/components/journal/admin-journal-panel";
import { getJournalFilterOptions } from "@/server/journal-audit";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminJournalPage() {
  await requireCadre();

  const { iades, utilisateurs } = await getJournalFilterOptions();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Historique des actions sur les disponibilités, préférences de continuité
          et astreintes. Filtrable par IADE, type d&apos;action, période et
          acteur. Cliquez sur une ligne pour afficher le détail JSON lorsqu&apos;il
          est disponible.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm">Chargement...</p>}>
        <AdminJournalPanel iades={iades} utilisateurs={utilisateurs} />
      </Suspense>
    </main>
  );
}
