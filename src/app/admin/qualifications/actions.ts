"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireCadre } from "@/server/require-cadre";
import {
  createQualification,
  deleteQualification,
  getUncheckWarning,
  validateQualificationInput,
} from "@/server/qualifications";

export type QualificationActionState = {
  error?: string;
  success?: string;
};

export async function createQualificationAction(
  iadeId: string,
  ligneId: string,
): Promise<QualificationActionState> {
  await requireCadre();

  const validated = validateQualificationInput({ iadeId, ligneId });
  if ("error" in validated) {
    return { error: validated.error };
  }

  try {
    const result = await createQualification(validated);
    if ("error" in result) {
      return { error: result.error };
    }

    revalidatePath("/admin/qualifications");
    return { success: "Qualification ajoutée." };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "Cette qualification existe déjà." };
    }

    throw error;
  }
}

export async function checkUncheckWarningAction(
  iadeId: string,
  ligneId: string,
) {
  await requireCadre();

  const validated = validateQualificationInput({ iadeId, ligneId });
  if ("error" in validated) {
    return { error: validated.error };
  }

  return getUncheckWarning(validated.iadeId, validated.ligneId);
}

export async function deleteQualificationAction(
  iadeId: string,
  ligneId: string,
): Promise<QualificationActionState> {
  await requireCadre();

  const validated = validateQualificationInput({ iadeId, ligneId });
  if ("error" in validated) {
    return { error: validated.error };
  }

  const result = await deleteQualification(validated);
  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/admin/qualifications");
  return { success: "Qualification retirée." };
}
