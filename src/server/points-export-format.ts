import { TypeCreneau } from "@prisma/client";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import type { PointsParLigne } from "@/server/points";

export function formatLigneCell(astreintes: number, points: number): string {
  if (astreintes === 0) {
    return "0 / 0 pt";
  }

  const astreinteLabel = astreintes > 1 ? "astreintes" : "astreinte";
  const pointLabel = points > 1 ? "pts" : "pt";

  return `${astreintes} ${astreinteLabel} / ${points} ${pointLabel}`;
}

export function shouldShowCreneauDetail(ligne: PointsParLigne): boolean {
  if (ligne.parCreneau.length === 0) {
    return false;
  }

  return (
    ligne.parCreneau.length > 1 ||
    ligne.parCreneau.some((entry) => entry.typeCreneau !== TypeCreneau.NUIT_SEMAINE)
  );
}

export function formatCreneauDetail(ligne: PointsParLigne): string {
  return ligne.parCreneau
    .map(
      (entry) =>
        `${LIBELLES_TYPE_CRENEAU_ASTREINTE[entry.typeCreneau]} ${entry.astreintes}·${entry.points}`,
    )
    .join(" · ");
}

export function formatLigneCellComplet(ligne: PointsParLigne): string {
  const main = formatLigneCell(ligne.astreintes, ligne.points);

  if (shouldShowCreneauDetail(ligne)) {
    return `${main}\n${formatCreneauDetail(ligne)}`;
  }

  return main;
}
