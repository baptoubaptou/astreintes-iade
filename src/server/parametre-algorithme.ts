import { ModeAttribution } from "@prisma/client";
import { prisma } from "@/lib/db";

export const CLE_MODE_ATTRIBUTION = "mode_attribution";

export const LIBELLES_MODE_ATTRIBUTION: Record<ModeAttribution, string> = {
  [ModeAttribution.GLOUTON]: "Glouton (attribution au fil de l'eau)",
  [ModeAttribution.LISSE]: "Lissé (répartition optimisée sur toute la période)",
};

export const ERREUR_MODE_LISSE_NON_IMPLEMENTE =
  "Mode lissé non encore implémenté";

export async function getModeAttribution(): Promise<ModeAttribution> {
  const record = await prisma.parametreAlgorithme.findUnique({
    where: { cle: CLE_MODE_ATTRIBUTION },
    select: { valeur: true },
  });

  if (record?.valeur === ModeAttribution.LISSE) {
    return ModeAttribution.LISSE;
  }

  return ModeAttribution.GLOUTON;
}

export async function setModeAttribution(
  mode: ModeAttribution,
): Promise<{ success: true } | { error: string }> {
  if (mode === ModeAttribution.LISSE) {
    return {
      error:
        "Le mode lissé sera disponible dans une prochaine version. Utilisez le mode glouton pour l'instant.",
    };
  }

  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_MODE_ATTRIBUTION },
    create: { cle: CLE_MODE_ATTRIBUTION, valeur: mode },
    update: { valeur: mode },
  });

  return { success: true };
}
