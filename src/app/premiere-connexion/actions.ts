"use server";

import { AuthError } from "next-auth";
import { connecterUtilisateur } from "@/app/login/actions";
import {
  demarrerInscription,
  finaliserInscription,
  parseInscriptionFormData,
  type InscriptionState,
} from "@/server/inscription";

export async function inscriptionAction(
  _prevState: InscriptionState,
  formData: FormData,
): Promise<InscriptionState> {
  const parsed = parseInscriptionFormData(formData);

  if ("error" in parsed) {
    return parsed;
  }

  return demarrerInscription(parsed);
}

export async function verificationInscriptionAction(
  _prevState: InscriptionState,
  formData: FormData,
): Promise<InscriptionState> {
  const inscriptionId = formData.get("inscriptionId");
  const code = formData.get("code");
  const motDePasse = formData.get("motDePasse");

  if (
    typeof inscriptionId !== "string" ||
    typeof code !== "string" ||
    typeof motDePasse !== "string"
  ) {
    return { error: "Données de vérification incomplètes." };
  }

  const result = await finaliserInscription({
    inscriptionId,
    code,
    motDePasse,
  });

  if (!result.ok) {
    return { error: result.error, field: result.field };
  }

  try {
    await connecterUtilisateur(result.email, result.motDePasse, "/app");
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          "Compte créé, mais la connexion automatique a échoué. Connectez-vous manuellement.",
      };
    }
    throw error;
  }

  return {};
}
