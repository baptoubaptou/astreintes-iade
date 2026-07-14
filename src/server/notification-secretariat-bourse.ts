import { estDateDansPeriodeDejaEnvoyee } from "@/lib/envoi-automatique-periode";
import { prisma } from "@/lib/db";
import { envoyerEmailResend } from "@/server/resend-email";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatIadeNom(iade: { prenom: string; nom: string }): string {
  return `${iade.prenom} ${iade.nom}`;
}

export async function notifierSecretariatChangementBourse(input: {
  astreinteId: string;
  date: Date;
  ligneNom: string;
  donneur: { prenom: string; nom: string };
  repreneur: { id: string; prenom: string; nom: string };
}): Promise<{ envoye: boolean; raison?: string }> {
  const configuration = await prisma.configurationEnvoiAutomatique.findFirst({
    orderBy: { id: "asc" },
    select: {
      emailDestinataire: true,
      jourEnvoi: true,
      dateDernierEnvoi: true,
    },
  });

  if (!configuration?.dateDernierEnvoi) {
    return { envoye: false, raison: "Aucun planning n'a encore été envoyé." };
  }

  const emailDestinataire = normalizeEmail(configuration.emailDestinataire);
  if (!emailDestinataire || !isValidEmail(emailDestinataire)) {
    return {
      envoye: false,
      raison: "E-mail secrétariat non configuré.",
    };
  }

  if (
    !estDateDansPeriodeDejaEnvoyee(
      input.date,
      configuration.dateDernierEnvoi,
      configuration.jourEnvoi,
    )
  ) {
    return {
      envoye: false,
      raison: "La date de l'astreinte n'est pas dans une période déjà transmise.",
    };
  }

  const dateLabel = formatDateFr(
    new Date(
      Date.UTC(
        input.date.getUTCFullYear(),
        input.date.getUTCMonth(),
        input.date.getUTCDate(),
      ),
    ),
  );
  const agentInitial = formatIadeNom(input.donneur);
  const agentRemplacant = formatIadeNom(input.repreneur);

  const subject = `Modification planning astreintes — ${dateLabel}`;
  const body = `Bonjour,

Un changement a été effectué via la bourse aux astreintes pour une période déjà transmise :

Date : ${dateLabel}
Spécialité : ${input.ligneNom}
Agent initialement prévu : ${agentInitial}
Agent remplaçant : ${agentRemplacant}

Cordialement,
Astreintes IADE`;

  const envoi = await envoyerEmailResend({
    to: emailDestinataire,
    subject,
    body,
    idempotencyKey: `secretariat-bourse/${input.astreinteId}/${input.repreneur.id}`,
  });

  if (!envoi.ok) {
    console.error(
      `[notification-secretariat-bourse] Échec d'envoi vers ${emailDestinataire} : ${envoi.error}`,
    );
    return { envoye: false, raison: envoi.error };
  }

  console.info(
    `[notification-secretariat-bourse] Alerte envoyée à ${emailDestinataire} (${input.ligneNom}, ${dateLabel}).`,
  );

  return { envoye: true };
}
