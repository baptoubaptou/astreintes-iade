import Link from "next/link";

type PlanningMonthSelectorProps = {
  moisLabel: string;
  prevHref: string;
  nextHref: string;
};

export function PlanningMonthSelector({
  moisLabel,
  prevHref,
  nextHref,
}: PlanningMonthSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={prevHref}
        className="rounded border border-zinc-300 px-3 py-1 text-sm"
        aria-label="Mois précédent"
      >
        ←
      </Link>
      <h2 className="min-w-40 text-center text-lg font-medium">{moisLabel}</h2>
      <Link
        href={nextHref}
        className="rounded border border-zinc-300 px-3 py-1 text-sm"
        aria-label="Mois suivant"
      >
        →
      </Link>
    </div>
  );
}
