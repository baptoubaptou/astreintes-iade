import Link from "next/link";
import {
  LIBELLES_STATUT_FENETRE,
  ORDRE_PRIORITE_RECOMMANDE,
  type CampagneItem,
} from "@/server/campagnes";

type CampagnesResumePanelProps = {
  campagnes: CampagneItem[];
  compact?: boolean;
};

function formatDateFr(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function CampagnesResumePanel({
  campagnes,
  compact = false,
}: CampagnesResumePanelProps) {
  return (
    <section className="rounded border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Campagnes de planification</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ordre recommandé (indicatif) : {ORDRE_PRIORITE_RECOMMANDE}
          </p>
        </div>
        <Link
          href="/admin/campagnes"
          className="text-sm text-blue-700 hover:underline"
        >
          Gérer les campagnes →
        </Link>
      </div>

      {campagnes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-600">
          Aucune campagne à venir ou en cours.{" "}
          <Link href="/admin/campagnes" className="text-blue-700 hover:underline">
            Planifier une campagne
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs text-zinc-600">
                <th className="px-4 py-2 font-medium">Ligne</th>
                <th className="px-4 py-2 font-medium">Priorité</th>
                <th className="px-4 py-2 font-medium">Période</th>
                <th className="px-4 py-2 font-medium">Génération prévue</th>
                <th className="px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {campagnes.map((campagne) => (
                <tr key={campagne.id}>
                  <td className="px-4 py-2 font-medium">{campagne.ligneNom}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {campagne.ordrePriorite}
                    {!compact ? (
                      <span className="ml-1 text-xs">(recommandé)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {formatDateFr(campagne.periodeDebut)} —{" "}
                    {formatDateFr(campagne.periodeFin)}
                  </td>
                  <td className="px-4 py-2">
                    {formatDateFr(campagne.dateGenerationPrevue)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        campagne.statut === "CONFIRMEE"
                          ? "rounded bg-green-50 px-2 py-0.5 text-xs text-green-800"
                          : "rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                      }
                    >
                      {LIBELLES_STATUT_FENETRE[campagne.statut]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
