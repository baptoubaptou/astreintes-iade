import Link from "next/link";

type PlanningSimulationPanelProps = {
  mois: string;
};

export function PlanningSimulationPanel({ mois }: PlanningSimulationPanelProps) {
  return (
    <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4">
      <h2 className="text-lg font-medium">Génération automatique (simulation)</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Conformément au cahier des charges, l&apos;algorithme d&apos;attribution
        fonctionne en mode <strong>aperçu obligatoire</strong> avant tout
        enregistrement :
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>Lancer une simulation → planning proposé affiché sans enregistrement</li>
        <li>Résultat figé : un seul tirage par simulation</li>
        <li>
          <strong>Valider</strong> → enregistrement en base, puis ajustements
          manuels possibles ci-dessous
        </li>
        <li>
          <strong>Rejeter</strong> → aucune écriture ; relancer une nouvelle
          simulation ou planifier manuellement
        </li>
      </ol>
      <Link
        href="/admin/generation-automatique"
        className="mt-4 inline-block rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
      >
        Ouvrir la génération automatique
      </Link>
      <p className="mt-2 text-xs text-zinc-500">
        Vue planning actuelle : {mois}
      </p>
    </section>
  );
}
