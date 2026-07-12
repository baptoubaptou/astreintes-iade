import type { AstreinteListItem } from "@/server/astreintes";
import { getLigneColorClass } from "@/lib/ligne-colors";
import { AstreinteChip } from "@/components/planning-calendar/astreinte-chip";
import { AstreinteBrouillonBadge } from "@/components/planning/astreinte-brouillon-badge";
import {
  estCreneauJour,
  estCreneauNuit,
} from "@/server/astreinte-creneaux";

type DayAstreintesDisplayProps = {
  astreintes: AstreinteListItem[];
  compact?: boolean;
  showBrouillon?: boolean;
};

function groupByLigne(astreintes: AstreinteListItem[]) {
  const map = new Map<string, AstreinteListItem[]>();

  for (const astreinte of astreintes) {
    const current = map.get(astreinte.ligne.id) ?? [];
    current.push(astreinte);
    map.set(astreinte.ligne.id, current);
  }

  return map;
}

function LigneSplitCell({
  ligneId,
  ligneNom,
  jour,
  nuit,
  showBrouillon = false,
}: {
  ligneId: string;
  ligneNom: string;
  jour?: AstreinteListItem;
  nuit?: AstreinteListItem;
  showBrouillon?: boolean;
}) {
  const colorClass = getLigneColorClass(ligneId, ligneNom);
  const brouillonJour = showBrouillon && jour && !jour.publie;
  const brouillonNuit = showBrouillon && nuit && !nuit.publie;

  return (
    <div
      className={`overflow-hidden rounded border text-xs ${colorClass} ${
        brouillonJour || brouillonNuit ? "border-dashed border-amber-400" : ""
      }`}
    >
      <div className="border-b border-current/20 px-1 py-0.5 font-medium opacity-80">
        {ligneNom}
      </div>
      <div className="grid grid-cols-1 divide-y divide-current/15">
        <div className="px-1 py-0.5">
          <span className="font-medium">Jour</span>
          <span className="mx-1">·</span>
          <span>
            {jour
              ? `${jour.iade.prenom} ${jour.iade.nom.charAt(0)}.`
              : "—"}
          </span>
          {showBrouillon && jour ? (
            <AstreinteBrouillonBadge publie={jour.publie} compact />
          ) : null}
        </div>
        <div className="px-1 py-0.5">
          <span className="font-medium">Nuit</span>
          <span className="mx-1">·</span>
          <span>
            {nuit
              ? `${nuit.iade.prenom} ${nuit.iade.nom.charAt(0)}.`
              : "—"}
          </span>
          {showBrouillon && nuit ? (
            <AstreinteBrouillonBadge publie={nuit.publie} compact />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DayAstreintesDisplay({
  astreintes,
  compact = false,
  showBrouillon = false,
}: DayAstreintesDisplayProps) {
  if (astreintes.length === 0) {
    return null;
  }

  const byLigne = groupByLigne(astreintes);
  const rendered: React.ReactNode[] = [];

  for (const [ligneId, ligneAstreintes] of byLigne) {
    const ligneNom = ligneAstreintes[0].ligne.nom;
    const jour = ligneAstreintes.find((a) => estCreneauJour(a.typeCreneau));
    const nuit = ligneAstreintes.find((a) => estCreneauNuit(a.typeCreneau));
    const usesSplitLayout = ligneAstreintes.some(
      (a) => a.typeCreneau !== "NUIT_SEMAINE",
    );

    if (usesSplitLayout) {
      rendered.push(
        <LigneSplitCell
          key={`split-${ligneId}`}
          ligneId={ligneId}
          ligneNom={ligneNom}
          jour={jour}
          nuit={nuit}
          showBrouillon={showBrouillon}
        />,
      );
      continue;
    }

    for (const astreinte of ligneAstreintes) {
      rendered.push(
        <AstreinteChip
          key={astreinte.id}
          astreinte={astreinte}
          compact={compact}
          showBrouillon={showBrouillon}
        />,
      );
    }
  }

  return <div className="space-y-1">{rendered}</div>;
}
