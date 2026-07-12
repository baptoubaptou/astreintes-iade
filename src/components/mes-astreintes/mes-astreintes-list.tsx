import { getLigneColorClass } from "@/lib/ligne-colors";
import { DonnerAstreinteButton } from "@/components/mes-astreintes/donner-astreinte-button";
import type { BourseEligibiliteAstreinte } from "@/server/bourse-astreintes";
import { MESSAGE_BOURSE_FERMEE } from "@/server/bourse-astreintes";
import type { AstreinteListItem } from "@/server/astreintes";

export type AstreinteAvecBourse = AstreinteListItem & {
  bourse: BourseEligibiliteAstreinte;
};

type MesAstreintesListProps = {
  astreintes: Array<AstreinteListItem | AstreinteAvecBourse>;
  showActions?: boolean;
  emptyMessage: string;
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

export function MesAstreintesList({
  astreintes,
  showActions = false,
  emptyMessage,
}: MesAstreintesListProps) {
  if (astreintes.length === 0) {
    return <p className="text-sm text-zinc-600">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
      {astreintes.map((astreinte) => (
        <li
          key={astreinte.id}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p className="font-medium">{formatDate(astreinte.date)}</p>
            <span
              className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium ${getLigneColorClass(astreinte.ligne.id, astreinte.ligne.nom)}`}
            >
              {astreinte.ligne.nom}
            </span>
            {!showActions ? (
              <p className="mt-1 text-sm text-zinc-600">
                {astreinte.pointsAttribues} point
                {astreinte.pointsAttribues > 1 ? "s" : ""}
              </p>
            ) : null}
          </div>

          {showActions ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                title="Disponible en Phase 4"
                className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Demander un échange
              </button>
              <DonnerAstreinteButton
                astreinteId={astreinte.id}
                eligibilite={
                  "bourse" in astreinte
                    ? astreinte.bourse
                    : { peutDonner: false, message: MESSAGE_BOURSE_FERMEE }
                }
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
