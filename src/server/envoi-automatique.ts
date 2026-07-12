import { JourSemaine } from "@prisma/client";
import { formatDateParam } from "@/lib/calendar";
import {
  calculerPeriodeEnvoi,
  calculerProchainEnvoiEtPeriode,
  formaterApercuEnvoiAutomatique,
  type ApercuEnvoiAutomatique,
} from "@/lib/envoi-automatique-periode";
import { prisma } from "@/lib/db";
import { genererPlanningPdfPeriode } from "@/server/planning-pdf";
import { envoyerEmailResend } from "@/server/resend-email";

export type ConfigurationEnvoiAutomatiqueDto = {
  id: string;
  emailDestinataire: string;
  jourEnvoi: JourSemaine;
  actif: boolean;
  dateDernierEnvoi: string | null;
};

export type ConfigurationEnvoiAutomatiqueAvecApercu =
  ConfigurationEnvoiAutomatiqueDto & {
    apercu: ApercuEnvoiAutomatique;
  };

export type UpdateConfigurationEnvoiAutomatiqueInput = {
  emailDestinataire: string;
  jourEnvoi: JourSemaine;
  actif: boolean;
};

export type ResultatEnvoiAutomatique =
  | { statut: "ignore"; raison: string }
  | {
      statut: "envoye";
      periodeDebut: string;
      periodeFin: string;
      destinataire: string;
      filename: string;
    }
  | { statut: "erreur"; message: string };

const JOUR_ENVOI_VERS_UTC_DAY: Record<JourSemaine, number> = {
  [JourSemaine.DIMANCHE]: 0,
  [JourSemaine.LUNDI]: 1,
  [JourSemaine.MARDI]: 2,
  [JourSemaine.MERCREDI]: 3,
  [JourSemaine.JEUDI]: 4,
  [JourSemaine.VENDREDI]: 5,
  [JourSemaine.SAMEDI]: 6,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDateFrLong(date: Date): string {
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return label.charAt(0).toLowerCase() + label.slice(1);
}

function mapConfiguration(configuration: {
  id: string;
  emailDestinataire: string;
  jourEnvoi: JourSemaine;
  actif: boolean;
  dateDernierEnvoi: Date | null;
}): ConfigurationEnvoiAutomatiqueDto {
  return {
    id: configuration.id,
    emailDestinataire: configuration.emailDestinataire,
    jourEnvoi: configuration.jourEnvoi,
    actif: configuration.actif,
    dateDernierEnvoi: configuration.dateDernierEnvoi
      ? configuration.dateDernierEnvoi.toISOString()
      : null,
  };
}

function toDto(
  configuration: ConfigurationEnvoiAutomatiqueDto,
): ConfigurationEnvoiAutomatiqueAvecApercu {
  return {
    ...configuration,
    apercu: formaterApercuEnvoiAutomatique(configuration.jourEnvoi),
  };
}

function estMemeJourUtc(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formaterTextePeriode(debut: Date, fin: Date): string {
  return `du ${formatDateFrLong(debut)} au ${formatDateFrLong(fin)}`;
}

export { calculerPeriodeEnvoi, calculerProchainEnvoiEtPeriode, formaterApercuEnvoiAutomatique };

export async function getOuCreerConfiguration(): Promise<ConfigurationEnvoiAutomatiqueAvecApercu> {
  const existing = await prisma.configurationEnvoiAutomatique.findFirst({
    orderBy: { id: "asc" },
  });

  if (existing) {
    return toDto(mapConfiguration(existing));
  }

  const created = await prisma.configurationEnvoiAutomatique.create({
    data: {},
  });

  return toDto(mapConfiguration(created));
}

export function validateUpdateConfigurationEnvoiAutomatique(
  body: Record<string, unknown>,
):
  | UpdateConfigurationEnvoiAutomatiqueInput
  | { error: string; field?: string } {
  const emailDestinataire =
    typeof body.emailDestinataire === "string"
      ? normalizeEmail(body.emailDestinataire)
      : "";

  const jourEnvoiRaw =
    typeof body.jourEnvoi === "string" ? body.jourEnvoi.trim() : "";

  if (!Object.values(JourSemaine).includes(jourEnvoiRaw as JourSemaine)) {
    return { error: "Jour d'envoi invalide.", field: "jourEnvoi" };
  }

  const jourEnvoi = jourEnvoiRaw as JourSemaine;
  const actif = body.actif === true || body.actif === "true";

  if (emailDestinataire && !isValidEmail(emailDestinataire)) {
    return {
      error: "L'adresse e-mail du destinataire est invalide.",
      field: "emailDestinataire",
    };
  }

  if (actif && !emailDestinataire) {
    return {
      error:
        "Un e-mail destinataire est requis pour activer l'envoi automatique.",
      field: "emailDestinataire",
    };
  }

  return { emailDestinataire, jourEnvoi, actif };
}

export async function updateConfigurationEnvoiAutomatique(
  input: UpdateConfigurationEnvoiAutomatiqueInput,
): Promise<ConfigurationEnvoiAutomatiqueAvecApercu> {
  const configuration = await getOuCreerConfiguration();

  const updated = await prisma.configurationEnvoiAutomatique.update({
    where: { id: configuration.id },
    data: input,
  });

  return toDto(mapConfiguration(updated));
}

export async function executerEnvoiAutomatiqueSiEcheance(
  maintenant: Date = new Date(),
): Promise<ResultatEnvoiAutomatique> {
  try {
    const configuration = await prisma.configurationEnvoiAutomatique.findFirst({
      orderBy: { id: "asc" },
    });

    if (!configuration) {
      return { statut: "ignore", raison: "Aucune configuration d'envoi." };
    }

    if (!configuration.actif) {
      return { statut: "ignore", raison: "Envoi automatique désactivé." };
    }

    const aujourdhui = new Date(
      Date.UTC(
        maintenant.getUTCFullYear(),
        maintenant.getUTCMonth(),
        maintenant.getUTCDate(),
      ),
    );

    if (aujourdhui.getUTCDay() !== JOUR_ENVOI_VERS_UTC_DAY[configuration.jourEnvoi]) {
      return {
        statut: "ignore",
        raison: "Ce n'est pas le jour d'envoi configuré.",
      };
    }

    if (
      configuration.dateDernierEnvoi &&
      estMemeJourUtc(configuration.dateDernierEnvoi, aujourdhui)
    ) {
      return {
        statut: "ignore",
        raison: "Un envoi a déjà été effectué aujourd'hui.",
      };
    }

    const emailDestinataire = normalizeEmail(configuration.emailDestinataire);
    if (!emailDestinataire || !isValidEmail(emailDestinataire)) {
      console.error(
        "[envoi-automatique] E-mail destinataire invalide ou manquant.",
      );
      return {
        statut: "erreur",
        message: "E-mail destinataire invalide ou manquant.",
      };
    }

    const { debut, fin } = calculerPeriodeEnvoi(aujourdhui);
    const periodeDebut = formatDateParam(debut);
    const periodeFin = formatDateParam(fin);
    const periodeTexte = formaterTextePeriode(debut, fin);

    const { buffer, filename } = await genererPlanningPdfPeriode({
      periodeDebut: debut,
      periodeFin: fin,
    });

    const subject = `Planning des astreintes IADE — période ${periodeTexte}`;
    const body = `Bonjour,

Veuillez trouver ci-joint le planning des astreintes IADE publiées pour la période ${periodeTexte}.

Cordialement,
Astreintes IADE`;

    const envoi = await envoyerEmailResend({
      to: emailDestinataire,
      subject,
      body,
      attachments: [{ filename, content: buffer }],
      idempotencyKey: `envoi-auto/${configuration.id}/${periodeDebut}`,
    });

    if (!envoi.ok) {
      console.error(
        `[envoi-automatique] Échec d'envoi vers ${emailDestinataire} : ${envoi.error}`,
      );
      return { statut: "erreur", message: envoi.error };
    }

    await prisma.configurationEnvoiAutomatique.update({
      where: { id: configuration.id },
      data: { dateDernierEnvoi: maintenant },
    });

    console.info(
      `[envoi-automatique] Planning envoyé à ${emailDestinataire} (${periodeDebut} → ${periodeFin}).`,
    );

    return {
      statut: "envoye",
      periodeDebut,
      periodeFin,
      destinataire: emailDestinataire,
      filename,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue lors de l'envoi.";
    console.error("[envoi-automatique] Erreur inattendue :", error);
    return { statut: "erreur", message };
  }
}

export function verifierCalculPeriodeEnvoiExempleCdc(): boolean {
  const jeudiIllustratif = new Date(Date.UTC(2026, 6, 17));
  const { debut, fin } = calculerPeriodeEnvoi(jeudiIllustratif);

  return (
    formatDateParam(debut) === "2026-07-20" &&
    formatDateParam(fin) === "2026-07-26"
  );
}

export function verifierCalculPeriodeEnvoiJeudiStrict(): boolean {
  const jeudi = new Date(Date.UTC(2026, 6, 16));
  const { debut, fin } = calculerPeriodeEnvoi(jeudi);

  return (
    formatDateParam(debut) === "2026-07-20" &&
    formatDateParam(fin) === "2026-07-26"
  );
}
