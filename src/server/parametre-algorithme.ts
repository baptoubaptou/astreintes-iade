import { ModeAttribution } from "@prisma/client";
import { LIBELLES_MODE_ATTRIBUTION } from "@/lib/mode-attribution";
import { prisma } from "@/lib/db";
import type { SeuilEcartAberrantLigne } from "@/types/parametre-algorithme";

export type { SeuilEcartAberrantLigne };

export const CLE_MODE_ATTRIBUTION = "mode_attribution";

/**
 * Métadonnée ParametreAlgorithme : le seuil d'écart aberrant du mode lissé est
 * stocké par ligne sur {@link LigneAstreinte.seuilEcartAberrant} (nullable).
 * La table clé/valeur globale ne permet pas un réglage par ligne ; cette entrée
 * documente la clé fonctionnelle et la formule de défaut.
 */
export const CLE_LISSE_SEUIL_ECART_ABERRANT = "lisse_seuil_ecart_aberrant";

/** Valeur documentaire en base : formule appliquée quand seuilEcartAberrant est null. */
export const VALEUR_META_LISSE_SEUIL_ECART_ABERRANT =
  "par_ligne;defaut=2×max(PoidsCreneau.poids)";

export { LIBELLES_MODE_ATTRIBUTION };

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
  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_MODE_ATTRIBUTION },
    create: { cle: CLE_MODE_ATTRIBUTION, valeur: mode },
    update: { valeur: mode },
  });

  return { success: true };
}

export function calculerSeuilEcartAberrantDefautDepuisPoids(
  poidsCreneaux: Array<{ poids: number }>,
): number {
  const maxPoids = poidsCreneaux.reduce(
    (max, entry) => Math.max(max, entry.poids),
    0,
  );

  return maxPoids * 2;
}

export async function calculerSeuilEcartAberrantDefaut(
  ligneId: string,
): Promise<number> {
  const poidsCreneaux = await prisma.poidsCreneau.findMany({
    where: { ligneId },
    select: { poids: true },
  });

  return calculerSeuilEcartAberrantDefautDepuisPoids(poidsCreneaux);
}

export async function getSeuilEcartAberrantEffectif(
  ligneId: string,
): Promise<number> {
  const ligne = await prisma.ligneAstreinte.findUnique({
    where: { id: ligneId },
    select: {
      seuilEcartAberrant: true,
      poidsCreneaux: { select: { poids: true } },
    },
  });

  if (!ligne) {
    return 0;
  }

  if (ligne.seuilEcartAberrant != null) {
    return ligne.seuilEcartAberrant;
  }

  return calculerSeuilEcartAberrantDefautDepuisPoids(ligne.poidsCreneaux);
}

export async function chargerSeuilsEcartAberrantParLigne(
  ligneIds: Iterable<string>,
): Promise<Map<string, number>> {
  const ids = [...new Set(ligneIds)];

  if (ids.length === 0) {
    return new Map();
  }

  const lignes = await prisma.ligneAstreinte.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      seuilEcartAberrant: true,
      poidsCreneaux: { select: { poids: true } },
    },
  });

  const seuils = new Map<string, number>();

  for (const ligne of lignes) {
    const defaut = calculerSeuilEcartAberrantDefautDepuisPoids(ligne.poidsCreneaux);
    seuils.set(ligne.id, ligne.seuilEcartAberrant ?? defaut);
  }

  return seuils;
}

export async function listSeuilsEcartAberrantParLigne(): Promise<
  SeuilEcartAberrantLigne[]
> {
  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    select: {
      id: true,
      nom: true,
      seuilEcartAberrant: true,
      poidsCreneaux: { select: { poids: true } },
    },
  });

  return lignes.map((ligne) => {
    const poidsMax = ligne.poidsCreneaux.reduce(
      (max, entry) => Math.max(max, entry.poids),
      0,
    );
    const seuilDefaut = calculerSeuilEcartAberrantDefautDepuisPoids(
      ligne.poidsCreneaux,
    );

    return {
      ligneId: ligne.id,
      nom: ligne.nom,
      seuilEffectif: ligne.seuilEcartAberrant ?? seuilDefaut,
      seuilDefaut,
      seuilPersonnalise: ligne.seuilEcartAberrant,
      poidsMax,
    };
  });
}

export async function ensureParametreLisseSeuilEcartAberrant(): Promise<void> {
  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_LISSE_SEUIL_ECART_ABERRANT },
    create: {
      cle: CLE_LISSE_SEUIL_ECART_ABERRANT,
      valeur: VALEUR_META_LISSE_SEUIL_ECART_ABERRANT,
    },
    update: {},
  });
}

export type UpsertSeuilEcartAberrantInput = {
  ligneId: string;
  seuil: number | null;
};

export function validateUpsertSeuilEcartAberrantInput(
  input: Record<string, unknown>,
): UpsertSeuilEcartAberrantInput | { error: string } {
  const ligneId = typeof input.ligneId === "string" ? input.ligneId.trim() : "";

  if (!ligneId) {
    return { error: "ligneId est requis." };
  }

  if (input.seuil === null || input.seuil === undefined || input.seuil === "") {
    return { ligneId, seuil: null };
  }

  const parsed = Number(input.seuil);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      error: "Le seuil doit être un entier positif, ou null pour la valeur par défaut.",
    };
  }

  return { ligneId, seuil: parsed };
}

export async function upsertSeuilEcartAberrantLigne(
  input: UpsertSeuilEcartAberrantInput,
): Promise<{ success: true } | { error: string }> {
  const ligne = await prisma.ligneAstreinte.findUnique({
    where: { id: input.ligneId },
    select: { id: true },
  });

  if (!ligne) {
    return { error: "Ligne introuvable." };
  }

  await prisma.ligneAstreinte.update({
    where: { id: input.ligneId },
    data: { seuilEcartAberrant: input.seuil },
  });

  return { success: true };
}
