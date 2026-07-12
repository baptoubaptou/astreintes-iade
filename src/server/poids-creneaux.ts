import { TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  LIBELLES_TYPE_CRENEAU_ASTREINTE,
  TYPES_CRENEAU_ASTREINTE,
} from "@/server/astreinte-creneaux";

export const TYPES_CRENEAU = TYPES_CRENEAU_ASTREINTE;

export const LIBELLES_TYPE_CRENEAU = LIBELLES_TYPE_CRENEAU_ASTREINTE;

export type PoidsCreneauCellule = {
  id: string | null;
  valeur: number;
};

export type PoidsCreneauLigne = {
  ligneId: string;
  ligneNom: string;
  ordrePriorite: number;
  poids: Record<TypeCreneau, PoidsCreneauCellule>;
};

export type UpsertPoidsCreneauInput = {
  ligneId: string;
  typeCreneau: TypeCreneau;
  poids: number;
};

export type PoidsCreneauValidationError = {
  error: string;
  field?: string;
};

function buildPoidsParType(
  poidsCreneaux: { id: string; typeCreneau: TypeCreneau; poids: number }[],
): Record<TypeCreneau, PoidsCreneauCellule> {
  const result = {} as Record<TypeCreneau, PoidsCreneauCellule>;

  for (const type of TYPES_CRENEAU) {
    const existing = poidsCreneaux.find((entry) => entry.typeCreneau === type);
    result[type] = {
      id: existing?.id ?? null,
      valeur: existing?.poids ?? 0,
    };
  }

  return result;
}

export async function listPoidsCreneauxParLigne(): Promise<PoidsCreneauLigne[]> {
  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    include: {
      poidsCreneaux: {
        select: { id: true, typeCreneau: true, poids: true },
      },
    },
  });

  return lignes.map((ligne) => ({
    ligneId: ligne.id,
    ligneNom: ligne.nom,
    ordrePriorite: ligne.ordrePriorite,
    poids: buildPoidsParType(ligne.poidsCreneaux),
  }));
}

function parseNonNegativeInt(
  value: unknown,
  field: string,
): { value: number } | PoidsCreneauValidationError {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      error: `${field} doit être un entier positif ou nul.`,
      field,
    };
  }

  return { value: parsed };
}

export function validateUpsertPoidsCreneauInput(
  input: Record<string, unknown>,
): UpsertPoidsCreneauInput | PoidsCreneauValidationError {
  const ligneId = typeof input.ligneId === "string" ? input.ligneId.trim() : "";

  if (!ligneId) {
    return { error: "La ligne est requise.", field: "ligneId" };
  }

  const typeCreneau =
    typeof input.typeCreneau === "string" ? input.typeCreneau : "";

  if (!TYPES_CRENEAU.includes(typeCreneau as TypeCreneau)) {
    return { error: "Type de créneau invalide.", field: "typeCreneau" };
  }

  const poidsResult = parseNonNegativeInt(input.poids, "poids");
  if ("error" in poidsResult) {
    return poidsResult;
  }

  return {
    ligneId,
    typeCreneau: typeCreneau as TypeCreneau,
    poids: poidsResult.value,
  };
}

export async function upsertPoidsCreneau(
  input: UpsertPoidsCreneauInput,
): Promise<
  | { poidsCreneau: { id: string; ligneId: string; typeCreneau: TypeCreneau; poids: number } }
  | PoidsCreneauValidationError
> {
  const ligne = await prisma.ligneAstreinte.findUnique({
    where: { id: input.ligneId },
    select: { id: true },
  });

  if (!ligne) {
    return { error: "Ligne introuvable.", field: "ligneId" };
  }

  const poidsCreneau = await prisma.poidsCreneau.upsert({
    where: {
      ligneId_typeCreneau: {
        ligneId: input.ligneId,
        typeCreneau: input.typeCreneau,
      },
    },
    create: {
      ligneId: input.ligneId,
      typeCreneau: input.typeCreneau,
      poids: input.poids,
    },
    update: {
      poids: input.poids,
    },
    select: {
      id: true,
      ligneId: true,
      typeCreneau: true,
      poids: true,
    },
  });

  return { poidsCreneau };
}
