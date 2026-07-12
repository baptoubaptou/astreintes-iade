import { GenerationAutomatiquePanel } from "@/components/generation-automatique/generation-automatique-panel";
import { getDefaultNextMonthRange } from "@/server/simulation-planning";
import { requireCadre } from "@/server/require-cadre";

export default async function GenerationAutomatiquePage() {
  await requireCadre();
  const { dateDebut, dateFin } = getDefaultNextMonthRange();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Génération automatique</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Simulation obligatoire avant enregistrement (cahier des charges §3.2).
          Priorité Greffe → Obstétrique → Urgences, points cumulés sur l&apos;année
          civile, exclusion stricte des IADE sans disponibilité déclarée.
        </p>
      </div>

      <GenerationAutomatiquePanel
        defaultDateDebut={dateDebut}
        defaultDateFin={dateFin}
      />
    </main>
  );
}
