"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireCadre } from "@/server/require-cadre";
import {
  createLigneAstreinte,
  updateLigneAstreinte,
  validateCreateLigneInput,
  validateUpdateLigneInput,
} from "@/server/lignes";

export type LigneActionState = {
  error?: string;
  success?: string;
};

export async function createLigneAction(
  _prevState: LigneActionState,
  formData: FormData,
): Promise<LigneActionState> {
  await requireCadre();

  const validated = validateCreateLigneInput({
    nom: formData.get("nom"),
    ordrePriorite: formData.get("ordrePriorite"),
  });

  if ("error" in validated) {
    return { error: validated.error };
  }

  try {
    await createLigneAstreinte(validated);
    revalidatePath("/admin/lignes");
    return { success: "Ligne créée avec succès." };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "Une ligne avec ce nom existe déjà." };
    }

    throw error;
  }
}

export async function updateLigneAction(
  id: string,
  _prevState: LigneActionState,
  formData: FormData,
): Promise<LigneActionState> {
  await requireCadre();

  const validated = validateUpdateLigneInput({
    ordrePriorite: formData.get("ordrePriorite"),
    actif: formData.get("actif"),
  });

  if ("error" in validated) {
    return { error: validated.error };
  }

  try {
    await updateLigneAstreinte(id, validated);
    revalidatePath("/admin/lignes");
    return { success: "Ligne mise à jour." };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { error: "Ligne introuvable." };
    }

    throw error;
  }
}
