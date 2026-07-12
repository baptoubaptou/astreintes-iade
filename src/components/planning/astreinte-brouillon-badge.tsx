import type { AstreinteListItem } from "@/server/astreintes";

type AstreinteBrouillonBadgeProps = {
  publie: boolean;
  compact?: boolean;
};

export function AstreinteBrouillonBadge({
  publie,
  compact = false,
}: AstreinteBrouillonBadgeProps) {
  if (publie) {
    return null;
  }

  return (
    <span
      className={`ml-1 rounded bg-amber-100 font-medium text-amber-900 ${
        compact ? "px-1 text-[10px]" : "px-1.5 text-[11px]"
      }`}
      title="Astreinte enregistrée mais non encore publiée aux IADE"
    >
      Brouillon
    </span>
  );
}

export function astreinteEstBrouillon(astreinte: Pick<AstreinteListItem, "publie">) {
  return !astreinte.publie;
}
