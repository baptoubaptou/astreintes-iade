export const MODES_ATTRIBUTION = ["GLOUTON", "LISSE"] as const;

export type ModeAttributionValue = (typeof MODES_ATTRIBUTION)[number];

export const LIBELLES_MODE_ATTRIBUTION: Record<ModeAttributionValue, string> = {
  GLOUTON: "Glouton (attribution au fil de l'eau)",
  LISSE: "Lissé (répartition optimisée sur toute la période)",
};
