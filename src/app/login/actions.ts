"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

function getSafeRedirectTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }

  return value;
}

export async function connecterUtilisateur(
  identifiant: string,
  motDePasse: string,
  redirectTo = "/app",
): Promise<void> {
  await signIn("credentials", {
    identifiant,
    password: motDePasse,
    redirectTo,
  });
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifiant = formData.get("identifiant");
  const password = formData.get("password");
  const redirectTo = getSafeRedirectTo(formData.get("callbackUrl"));

  if (typeof identifiant !== "string" || typeof password !== "string") {
    return { error: "Identifiant et mot de passe requis." };
  }

  try {
    await connecterUtilisateur(identifiant, password, redirectTo);
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Identifiant ou mot de passe incorrect." };
    }
    throw error;
  }

  return {};
}
