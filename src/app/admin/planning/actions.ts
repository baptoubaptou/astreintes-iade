"use server";

import { revalidatePath } from "next/cache";
import { requireCadre } from "@/server/require-cadre";
import {
  cancelAstreinte,
  createAstreinte,
  updateAstreinte,
  validateCreateAstreinteInput,
  validateUpdateAstreinteInput,
  type AstreinteField,
  type AstreinteServiceError,
} from "@/server/astreintes";
import { publierMoisPlanning } from "@/server/publication-planning";

export type AstreinteFormError = {
  code: string;
  message: string;
  field?: AstreinteField;
};

export type AstreinteFormActionState = {
  success?: string;
  warning?: string;
  error?: AstreinteFormError;
};

function mapServiceError(error: AstreinteServiceError): AstreinteFormActionState {
  return { error: error.error };
}

export async function createAstreinteAction(
  _mois: string,
  _prevState: AstreinteFormActionState,
  formData: FormData,
): Promise<AstreinteFormActionState> {
  const cadre = await requireCadre();

  const validated = validateCreateAstreinteInput({
    date: formData.get("date"),
    ligneId: formData.get("ligneId"),
    iadeId: formData.get("iadeId"),
    iadeIdJour: formData.get("iadeIdJour"),
    iadeIdNuit: formData.get("iadeIdNuit"),
  });

  if ("error" in validated) {
    return {
      error: {
        code: "INVALID_INPUT",
        message: validated.error,
        field: validated.field,
      },
    };
  }

  const result = await createAstreinte(validated, cadre.id);
  if ("success" in result && result.success === false) {
    return mapServiceError(result);
  }

  revalidatePath("/admin/planning");
  revalidatePath("/planning");

  const count = "astreintes" in result ? result.astreintes.length : 0;
  return {
    success:
      count > 1
        ? `${count} astreintes créées avec succès.`
        : "Astreinte créée avec succès.",
    warning: "warning" in result ? result.warning : undefined,
  };
}

export async function updateAstreinteAction(
  astreinteId: string,
  _prevState: AstreinteFormActionState,
  formData: FormData,
): Promise<AstreinteFormActionState> {
  const cadre = await requireCadre();

  const validated = validateUpdateAstreinteInput({
    date: formData.get("date"),
    ligneId: formData.get("ligneId"),
    iadeId: formData.get("iadeId"),
  });

  if ("error" in validated) {
    return {
      error: {
        code: "INVALID_INPUT",
        message: validated.error,
        field: validated.field,
      },
    };
  }

  const result = await updateAstreinte(astreinteId, validated, cadre.id);
  if ("success" in result && result.success === false) {
    return mapServiceError(result);
  }

  revalidatePath("/admin/planning");
  revalidatePath("/planning");
  return {
    success: "Astreinte mise à jour.",
    warning: "warning" in result ? result.warning : undefined,
  };
}

export async function cancelAstreinteAction(
  astreinteId: string,
): Promise<AstreinteFormActionState> {
  const cadre = await requireCadre();

  const result = await cancelAstreinte(astreinteId, cadre.id);
  if ("success" in result && result.success === false) {
    return mapServiceError(result);
  }

  revalidatePath("/admin/planning");
  revalidatePath("/planning");
  return { success: "Astreinte annulée." };
}

export async function publierMoisPlanningAction(
  mois: string,
): Promise<AstreinteFormActionState> {
  const cadre = await requireCadre();

  const result = await publierMoisPlanning(mois, cadre.id);
  if ("error" in result) {
    return {
      error: {
        code: "INVALID_INPUT",
        message: result.error,
      },
    };
  }

  revalidatePath("/admin/planning");
  revalidatePath("/planning");
  revalidatePath("/mes-astreintes");
  revalidatePath("/admin/campagnes");

  return {
    success: `${result.publiees} astreinte(s) publiée(s). Les IADE concernés ont été notifiés.`,
  };
}
