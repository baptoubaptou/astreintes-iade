import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type NotificationEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

export async function creerNotification(
  utilisateurId: string,
  type: string,
  message: string,
  email?: NotificationEmailPayload,
): Promise<void> {
  await prisma.notification.create({
    data: {
      utilisateurId,
      type,
      message,
    },
  });

  if (email) {
    await envoyerEmailNotification(email);
  }
}

export async function notifierPlusieurs(
  destinataires: Array<{
    utilisateurId: string;
    type: string;
    message: string;
    email?: NotificationEmailPayload;
  }>,
): Promise<void> {
  for (const destinataire of destinataires) {
    await creerNotification(
      destinataire.utilisateurId,
      destinataire.type,
      destinataire.message,
      destinataire.email,
    );
  }
}

async function envoyerEmailNotification(
  payload: NotificationEmailPayload,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[email] À: ${payload.to} | ${payload.subject} | ${payload.body}`,
    );
  }
}

export async function listerCadresActifs(): Promise<
  Array<{ id: string; email: string; prenom: string; nom: string }>
> {
  return prisma.utilisateur.findMany({
    where: { role: Role.CADRE, actif: true },
    select: { id: true, email: true, prenom: true, nom: true },
  });
}
