import type { AstreinteListItem } from "@/server/astreintes";
import { getLigneColorClass } from "@/lib/ligne-colors";
import { AstreinteBrouillonBadge } from "@/components/planning/astreinte-brouillon-badge";
import {
  estJourScindeAstreinte,
  LIBELLES_TYPE_CRENEAU_ASTREINTE,
} from "@/server/astreinte-creneaux";

type AstreinteChipProps = {
  astreinte: AstreinteListItem;
  compact?: boolean;
  showBrouillon?: boolean;
};

export function AstreinteChip({
  astreinte,
  compact = false,
  showBrouillon = false,
}: AstreinteChipProps) {
  const colorClass = getLigneColorClass(astreinte.ligne.id, astreinte.ligne.nom);
  const iadeName = `${astreinte.iade.prenom} ${astreinte.iade.nom}`;
  const creneauLabel = LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau];
  const brouillon = showBrouillon && !astreinte.publie;

  return (
    <div
      className={`rounded border px-1.5 py-0.5 text-xs ${colorClass} ${
        compact ? "truncate" : ""
      } ${brouillon ? "border-dashed border-amber-400" : ""}`}
      title={`${astreinte.ligne.nom} (${creneauLabel}) — ${iadeName}${
        brouillon ? " — Brouillon (non publié)" : ""
      }`}
    >
      <span className="font-medium">{astreinte.ligne.nom}</span>
      {estJourScindeAstreinte(astreinte.typeCreneau) ? (
        <>
          <span className="mx-1">·</span>
          <span className="opacity-80">{creneauLabel}</span>
        </>
      ) : null}
      <span className="mx-1">·</span>
      <span>{iadeName}</span>
      {showBrouillon ? (
        <AstreinteBrouillonBadge publie={astreinte.publie} compact={compact} />
      ) : null}
    </div>
  );
}
