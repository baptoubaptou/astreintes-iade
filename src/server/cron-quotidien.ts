import { traiterOffresBourseExpirees } from "@/server/bourse-astreintes";
import {
  executerEnvoiAutomatiqueSiEcheance,
  type ResultatEnvoiAutomatique,
} from "@/server/envoi-automatique";

export { traiterOffresBourseExpirees as cloturerOffresExpirees };

export type ResultatTachesCronQuotidiennes = {
  bourse: { traitees: number };
  envoiAutomatique: ResultatEnvoiAutomatique;
};

export async function executerTachesCronQuotidiennes(
  maintenant: Date = new Date(),
): Promise<ResultatTachesCronQuotidiennes> {
  const bourse = await traiterOffresBourseExpirees(maintenant);

  let envoiAutomatique: ResultatEnvoiAutomatique;
  try {
    envoiAutomatique = await executerEnvoiAutomatiqueSiEcheance(maintenant);
  } catch (error) {
    console.error("[cron-quotidien] Envoi automatique en échec :", error);
    envoiAutomatique = {
      statut: "erreur",
      message:
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de l'envoi automatique.",
    };
  }

  return { bourse, envoiAutomatique };
}
