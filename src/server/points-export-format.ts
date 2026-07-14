import type { PointsParLigne } from "@/server/points";

export function formatLigneCell(astreintes: number, points: number): string {
  return `${points} (${astreintes})`;
}

export function formatLigneCellComplet(ligne: PointsParLigne): string {
  return formatLigneCell(ligne.astreintes, ligne.points);
}
