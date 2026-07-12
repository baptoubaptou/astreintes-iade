import { prisma } from "@/lib/db";

export type CreateLigneInput = {
  nom: string;
  ordrePriorite: number;
};

export type UpdateLigneInput = {
  ordrePriorite?: number;
  actif?: boolean;
};

export type LigneValidationError = {
  error: string;
  field?: string;
};

function parsePositiveInt(
  value: unknown,
  field: string,
): { value: number } | LigneValidationError {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      error: `${field} doit être un entier positif.`,
      field,
    };
  }

  return { value: parsed };
}

export function validateCreateLigneInput(
  input: Record<string, unknown>,
): CreateLigneInput | LigneValidationError {
  const nom = typeof input.nom === "string" ? input.nom.trim() : "";

  if (!nom) {
    return { error: "Le nom est requis.", field: "nom" };
  }

  const ordreResult = parsePositiveInt(input.ordrePriorite, "ordrePriorite");
  if ("error" in ordreResult) {
    return ordreResult;
  }

  return {
    nom,
    ordrePriorite: ordreResult.value,
  };
}

export function validateUpdateLigneInput(
  input: Record<string, unknown>,
): UpdateLigneInput | LigneValidationError {
  const data: UpdateLigneInput = {};

  if (
    input.ordrePriorite !== undefined &&
    input.ordrePriorite !== null &&
    input.ordrePriorite !== ""
  ) {
    const ordreResult = parsePositiveInt(input.ordrePriorite, "ordrePriorite");
    if ("error" in ordreResult) {
      return ordreResult;
    }
    data.ordrePriorite = ordreResult.value;
  }

  if (input.actif !== undefined) {
    if (typeof input.actif === "boolean") {
      data.actif = input.actif;
    } else if (input.actif === "true" || input.actif === "false") {
      data.actif = input.actif === "true";
    } else {
      return { error: "Le champ actif est invalide.", field: "actif" };
    }
  }

  if (data.ordrePriorite === undefined && data.actif === undefined) {
    return { error: "Aucun champ à modifier." };
  }

  return data;
}

export async function listLignesAstreinte() {
  return prisma.ligneAstreinte.findMany({
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
  });
}

export async function createLigneAstreinte(input: CreateLigneInput) {
  return prisma.ligneAstreinte.create({
    data: {
      nom: input.nom,
      ordrePriorite: input.ordrePriorite,
      actif: true,
    },
  });
}

export async function updateLigneAstreinte(id: string, input: UpdateLigneInput) {
  return prisma.ligneAstreinte.update({
    where: { id },
    data: input,
  });
}

export async function getLigneAstreinteById(id: string) {
  return prisma.ligneAstreinte.findUnique({
    where: { id },
  });
}
