import type { BourseSupervisionOffre } from "@/server/bourse-astreintes";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { getLigneColorClass } from "@/lib/ligne-colors";

type BourseCadreSupervisionProps = {
  offres: BourseSupervisionOffre[];
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BourseCadreSupervision({ offres }: BourseCadreSupervisionProps) {
  if (offres.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Aucune offre ouverte pour le moment.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {offres.map((offre) => (
        <section
          key={offre.id}
          className="rounded border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{formatDate(offre.date)}</p>
              <span
                className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium ${getLigneColorClass(offre.ligneId, offre.ligneNom)}`}
              >
                {offre.ligneNom}
              </span>
              <p className="mt-2 text-sm text-zinc-600">
                {LIBELLES_TYPE_CRENEAU_ASTREINTE[offre.typeCreneau]} · Proposée
                par <strong>{offre.proposantNom}</strong>
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium text-zinc-900">Clôture</p>
              <p className="text-zinc-600">
                {formatDateTime(offre.dateFermeture)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Ouverte le {formatDateTime(offre.dateOuverture)}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-4">
            <h3 className="text-sm font-medium text-zinc-900">
              Postulants ({offre.candidats.length})
            </h3>

            {offre.sansCandidat ? (
              <p className="mt-2 text-sm text-amber-800">
                Aucun postulant pour l&apos;instant. À la clôture, une alerte
                vous sera envoyée si la bourse reste sans candidat.
              </p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-zinc-100 rounded border border-zinc-100">
                  {offre.candidats.map((candidat) => (
                    <li
                      key={candidat.iadeId}
                      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                        candidat.favori ? "bg-green-50" : ""
                      }`}
                    >
                      <div>
                        <span className="font-medium">{candidat.nom}</span>
                        {candidat.favori ? (
                          <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            Favori actuel
                          </span>
                        ) : null}
                      </div>
                      <div className="text-zinc-600">
                        <span className="font-mono">{candidat.pointsCumules}</span>{" "}
                        pt · postulé le {formatDateTime(candidat.dateCandidature)}
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-sm text-zinc-700">
                  <strong>Attribution projetée :</strong>{" "}
                  {offre.favoriActuel ?? "—"}
                  {offre.exAequo ? (
                    <span className="text-amber-800">
                      {" "}
                      (égalité — tirage au sort à la clôture)
                    </span>
                  ) : null}
                </p>
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
