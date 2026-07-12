const LIGNE_COLOR_BY_NOM: Record<string, string> = {
  Greffe: "bg-blue-100 text-blue-900 border-blue-200",
  Obstetrique: "bg-pink-100 text-pink-900 border-pink-200",
  Obstétrique: "bg-pink-100 text-pink-900 border-pink-200",
  Urgences: "bg-orange-100 text-orange-900 border-orange-200",
};

const FALLBACK_COLOR_CLASSES = [
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-violet-100 text-violet-900 border-violet-200",
  "bg-teal-100 text-teal-900 border-teal-200",
];

export function getLigneColorClass(ligneId: string, nom?: string): string {
  if (nom && LIGNE_COLOR_BY_NOM[nom]) {
    return LIGNE_COLOR_BY_NOM[nom];
  }

  let hash = 0;
  for (const char of ligneId) {
    hash = (hash + char.charCodeAt(0)) % FALLBACK_COLOR_CLASSES.length;
  }

  return FALLBACK_COLOR_CLASSES[hash] ?? FALLBACK_COLOR_CLASSES[0];
}

export function getLigneLegendColors(
  lignes: Array<{ id: string; nom: string }>,
): Array<{ nom: string; colorClass: string }> {
  return lignes.map((ligne) => ({
    nom: ligne.nom,
    colorClass: getLigneColorClass(ligne.id, ligne.nom),
  }));
}
