import { envoyerEmailResend } from "@/server/resend-email";

function getBaseUrl(): string {
  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) {
    return authUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export async function envoyerCodeVerificationEmail(input: {
  to: string;
  prenom: string;
  code: string;
  inscriptionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await envoyerEmailResend({
    to: input.to,
    subject: "Astreintes IADE — Code de vérification",
    body: `Bonjour ${input.prenom},

Votre code de vérification pour finaliser votre inscription est : ${input.code}

Ce code est valable 15 minutes.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.

Cordialement,
Astreintes IADE`,
    idempotencyKey: `inscription/${input.inscriptionId}/verification`,
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true };
}

export async function envoyerCodeChangementEmail(input: {
  to: string;
  prenom: string;
  code: string;
  demandeId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await envoyerEmailResend({
    to: input.to,
    subject: "Astreintes IADE — Vérification de votre nouvelle adresse",
    body: `Bonjour ${input.prenom},

Votre code de vérification pour confirmer votre nouvelle adresse e-mail est : ${input.code}

Ce code est valable 15 minutes.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.

Cordialement,
Astreintes IADE`,
    idempotencyKey: `changement-email/${input.demandeId}/verification`,
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true };
}

export async function envoyerLienReinitialisationEmail(input: {
  to: string;
  prenom: string;
  token: string;
  tokenId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const lien = `${getBaseUrl()}/reinitialiser-mot-de-passe?token=${encodeURIComponent(input.token)}`;

  const result = await envoyerEmailResend({
    to: input.to,
    subject: "Astreintes IADE — Réinitialisation du mot de passe",
    body: `Bonjour ${input.prenom},

Vous avez demandé la réinitialisation de votre mot de passe.

Cliquez sur le lien suivant pour choisir un nouveau mot de passe (valable 1 heure) :
${lien}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.

Cordialement,
Astreintes IADE`,
    idempotencyKey: `reset/${input.tokenId}`,
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true };
}
