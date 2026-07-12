import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { findUtilisateurByIdentifiant } from "@/server/auth-identifiant";
import { envoyerLienReinitialisationEmail } from "@/server/auth-emails";
import {
  hasherMotDePasse,
  validateConfirmationMotDePasse,
} from "@/server/mot-de-passe";

const TOKEN_VALIDITE_MS = 60 * 60 * 1000;

export type ReinitialisationState = {
  error?: string;
  field?: string;
  success?: boolean;
  message?: string;
};

function hasherToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function genererToken(): string {
  return randomBytes(32).toString("hex");
}

export async function demanderReinitialisationMotDePasse(
  identifiant: string,
): Promise<ReinitialisationState> {
  const trimmed = identifiant.trim();

  if (!trimmed) {
    return {
      error: "Saisissez votre e-mail ou votre matricule.",
      field: "identifiant",
    };
  }

  const utilisateur = await findUtilisateurByIdentifiant(trimmed);

  if (utilisateur?.actif) {
    const token = genererToken();
    const tokenHash = hasherToken(token);

    await prisma.tokenReinitialisationMotDePasse.updateMany({
      where: {
        utilisateurId: utilisateur.id,
        utilise: false,
      },
      data: { utilise: true },
    });

    const enregistrement = await prisma.tokenReinitialisationMotDePasse.create({
      data: {
        utilisateurId: utilisateur.id,
        tokenHash,
        expireLe: new Date(Date.now() + TOKEN_VALIDITE_MS),
      },
    });

    await envoyerLienReinitialisationEmail({
      to: utilisateur.email,
      prenom: utilisateur.prenom,
      token,
      tokenId: enregistrement.id,
    });
  }

  return {
    success: true,
    message:
      "Si un compte correspond à ces informations, un e-mail de réinitialisation a été envoyé.",
  };
}

export async function reinitialiserMotDePasse(input: {
  token: string;
  motDePasse: string;
  confirmationMotDePasse: string;
}): Promise<
  | { ok: true; email: string; motDePasse: string }
  | { ok: false; error: string; field?: string }
> {
  const token = input.token.trim();

  if (!token) {
    return { ok: false, error: "Lien de réinitialisation invalide." };
  }

  const motDePasseError = validateConfirmationMotDePasse(
    input.motDePasse,
    input.confirmationMotDePasse,
  );

  if (motDePasseError) {
    return { ok: false, error: motDePasseError, field: "motDePasse" };
  }

  const tokenHash = hasherToken(token);

  const enregistrement = await prisma.tokenReinitialisationMotDePasse.findUnique({
    where: { tokenHash },
    include: { utilisateur: true },
  });

  if (
    !enregistrement ||
    enregistrement.utilise ||
    enregistrement.expireLe < new Date() ||
    !enregistrement.utilisateur.actif
  ) {
    return {
      ok: false,
      error: "Ce lien de réinitialisation est invalide ou a expiré.",
    };
  }

  const motDePasseHash = await hasherMotDePasse(input.motDePasse);

  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: enregistrement.utilisateurId },
      data: { motDePasseHash },
    }),
    prisma.tokenReinitialisationMotDePasse.update({
      where: { id: enregistrement.id },
      data: { utilise: true },
    }),
  ]);

  return {
    ok: true,
    email: enregistrement.utilisateur.email,
    motDePasse: input.motDePasse,
  };
}

export async function tokenReinitialisationValide(
  token: string,
): Promise<boolean> {
  if (!token.trim()) {
    return false;
  }

  const enregistrement = await prisma.tokenReinitialisationMotDePasse.findUnique({
    where: { tokenHash: hasherToken(token.trim()) },
    include: { utilisateur: true },
  });

  return Boolean(
    enregistrement &&
      !enregistrement.utilise &&
      enregistrement.expireLe >= new Date() &&
      enregistrement.utilisateur.actif,
  );
}
