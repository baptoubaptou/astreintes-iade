"use server";

import { AuthError } from "next-auth";
import { connecterUtilisateur } from "@/app/login/actions";
import {
  demanderReinitialisationMotDePasse,
  reinitialiserMotDePasse,
  type ReinitialisationState,
} from "@/server/reinitialisation-mot-de-passe";

export async function motDePasseOublieAction(
  _prevState: ReinitialisationState,
  formData: FormData,
): Promise<ReinitialisationState> {
  const identifiant = formData.get("identifiant");

  if (typeof identifiant !== "string") {
    return { error: "Saisissez votre e-mail ou votre matricule." };
  }

  return demanderReinitialisationMotDePasse(identifiant);
}

export async function reinitialiserMotDePasseAction(
  _prevState: ReinitialisationState,
  formData: FormData,
): Promise<ReinitialisationState> {
  const token = formData.get("token");
  const motDePasse = formData.get("motDePasse");
  const confirmationMotDePasse = formData.get("confirmationMotDePasse");

  if (
    typeof token !== "string" ||
    typeof motDePasse !== "string" ||
    typeof confirmationMotDePasse !== "string"
  ) {
    return { error: "Données incomplètes." };
  }

  const result = await reinitialiserMotDePasse({
    token,
    motDePasse,
    confirmationMotDePasse,
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
          "Mot de passe mis à jour, mais la connexion automatique a échoué. Connectez-vous manuellement.",
      };
    }
    throw error;
  }

  return {};
}
