"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import {
  changerMotDePasseMonCompte,
  demarrerChangementEmail,
  finaliserChangementEmail,
  type MonCompteState,
} from "@/server/mon-compte";

async function getUtilisateurId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function changerMotDePasseAction(
  _prevState: MonCompteState,
  formData: FormData,
): Promise<MonCompteState> {
  const utilisateurId = await getUtilisateurId();

  if (!utilisateurId) {
    return { error: "Non authentifié." };
  }

  const motDePasseActuel = formData.get("motDePasseActuel");
  const motDePasse = formData.get("motDePasse");
  const confirmationMotDePasse = formData.get("confirmationMotDePasse");

  if (
    typeof motDePasseActuel !== "string" ||
    typeof motDePasse !== "string" ||
    typeof confirmationMotDePasse !== "string"
  ) {
    return { error: "Données incomplètes." };
  }

  const result = await changerMotDePasseMonCompte(utilisateurId, {
    motDePasseActuel,
    motDePasse,
    confirmationMotDePasse,
  });

  if (result.success) {
    revalidatePath("/app/mon-compte");
  }

  return result;
}

export async function demanderChangementEmailAction(
  _prevState: MonCompteState,
  formData: FormData,
): Promise<MonCompteState> {
  const utilisateurId = await getUtilisateurId();

  if (!utilisateurId) {
    return { error: "Non authentifié." };
  }

  const nouvelEmail = formData.get("nouvelEmail");

  if (typeof nouvelEmail !== "string") {
    return { error: "Adresse e-mail requise.", field: "nouvelEmail" };
  }

  return demarrerChangementEmail(utilisateurId, nouvelEmail);
}

export async function verifierChangementEmailAction(
  _prevState: MonCompteState,
  formData: FormData,
): Promise<MonCompteState> {
  const utilisateurId = await getUtilisateurId();

  if (!utilisateurId) {
    return { error: "Non authentifié." };
  }

  const demandeId = formData.get("demandeId");
  const code = formData.get("code");

  if (typeof demandeId !== "string" || typeof code !== "string") {
    return { error: "Données incomplètes." };
  }

  const result = await finaliserChangementEmail(utilisateurId, {
    demandeId,
    code,
  });

  if (result.success) {
    revalidatePath("/app/mon-compte");
  }

  return result;
}
