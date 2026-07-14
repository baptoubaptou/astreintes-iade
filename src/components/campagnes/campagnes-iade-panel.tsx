import type { CampagneIadeParLigne } from "@/server/campagne-saisie-dispos";
import { formatDateFrIso } from "@/server/campagne-saisie-dispos";

type CampagnesIadePanelProps = {
  lignes: CampagneIadeParLigne[];
};

export function CampagnesIadePanel({ lignes }: CampagnesIadePanelProps) {
  if (lignes.length === 0) {
    return (
      <section className="rounded border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
        Vous n&apos;êtes qualifié sur aucune ligne d&apos;astreinte.
      </section>
    );
  }

  return (
    <section className="rounded border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Prochaines campagnes</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Dates de planification par ligne sur laquelle vous êtes qualifié.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs text-zinc-600">
              <th className="px-4 py-2 font-medium">Ligne</th>
              <th className="px-4 py-2 font-medium">Période</th>
              <th className="px-4 py-2 font-medium">Limite saisie dispos.</th>
              <th className="px-4 py-2 font-medium">Génération prévue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lignes.map((ligne) => (
              <tr key={ligne.ligneId}>
                <td className="px-4 py-3 font-medium">{ligne.ligneNom}</td>
                {ligne.campagne ? (
                  <>
                    <td className="px-4 py-3">
                      {formatDateFrIso(ligne.campagne.periodeDebut)} —{" "}
                      {formatDateFrIso(ligne.campagne.periodeFin)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateFrIso(ligne.campagne.dateLimiteSaisieDispos)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateFrIso(ligne.campagne.dateGenerationPrevue)}
                    </td>
                  </>
                ) : (
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-zinc-500 italic"
                  >
                    Aucune campagne programmée
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
