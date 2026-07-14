const LIGNE_COLOR_BY_NOM: Record<string, string> = {
  Greffe: "bg-blue-100 text-blue-900 border-blue-200",
  Obstetrique: "bg-pink-100 text-pink-900 border-pink-200",
  Obstétrique: "bg-pink-100 text-pink-900 border-pink-200",
  Urgences: "bg-orange-100 text-orange-900 border-orange-200",
};

export type LignePdfColors = {
  rowBg: string;
  rowText: string;
  accent: string;
};

const LIGNE_PDF_COLOR_BY_NOM: Record<string, LignePdfColors> = {
  Greffe: { rowBg: "#dbeafe", rowText: "#1e40af", accent: "#3b82f6" },
  Obstetrique: { rowBg: "#fce7f3", rowText: "#9d174d", accent: "#ec4899" },
  Obstétrique: { rowBg: "#fce7f3", rowText: "#9d174d", accent: "#ec4899" },
  Urgences: { rowBg: "#ffedd5", rowText: "#9a3412", accent: "#f97316" },
};

const FALLBACK_COLOR_CLASSES = [
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-violet-100 text-violet-900 border-violet-200",
  "bg-teal-100 text-teal-900 border-teal-200",
];

const FALLBACK_PDF_COLORS: LignePdfColors[] = [
  { rowBg: "#d1fae5", rowText: "#065f46", accent: "#10b981" },
  { rowBg: "#ede9fe", rowText: "#5b21b6", accent: "#8b5cf6" },
  { rowBg: "#ccfbf1", rowText: "#115e59", accent: "#14b8a6" },
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

export function getLignePdfColors(ligneId: string, nom?: string): LignePdfColors {
  if (nom && LIGNE_PDF_COLOR_BY_NOM[nom]) {
    return LIGNE_PDF_COLOR_BY_NOM[nom];
  }

  let hash = 0;
  for (const char of ligneId) {
    hash = (hash + char.charCodeAt(0)) % FALLBACK_PDF_COLORS.length;
  }

  return FALLBACK_PDF_COLORS[hash] ?? FALLBACK_PDF_COLORS[0];
}

export function getLigneLegendColors(
  lignes: Array<{ id: string; nom: string }>,
): Array<{ nom: string; colorClass: string }> {
  return lignes.map((ligne) => ({
    nom: ligne.nom,
    colorClass: getLigneColorClass(ligne.id, ligne.nom),
  }));
}
