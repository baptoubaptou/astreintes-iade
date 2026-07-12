/**
 * Tâches planifiées quotidiennes : clôture bourse + envoi automatique planning.
 *
 * Usage :
 *   npx tsx scripts/cron-taches-quotidiennes.ts
 *   npm run cron:quotidien
 *
 * À programmer une fois par jour (ex. crontab à 3 h) aux côtés de backup.sh.
 */
import { PrismaClient } from "@prisma/client";
import { executerTachesCronQuotidiennes } from "../src/server/cron-quotidien";

const prisma = new PrismaClient();

async function main() {
  const resultat = await executerTachesCronQuotidiennes();

  console.log(
    `[cron] Bourse : ${resultat.bourse.traitees} offre(s) expirée(s) traitée(s).`,
  );

  switch (resultat.envoiAutomatique.statut) {
    case "envoye":
      console.log(
        `[cron] Envoi automatique : planning envoyé à ${resultat.envoiAutomatique.destinataire} (${resultat.envoiAutomatique.periodeDebut} → ${resultat.envoiAutomatique.periodeFin}).`,
      );
      break;
    case "ignore":
      console.log(
        `[cron] Envoi automatique ignoré : ${resultat.envoiAutomatique.raison}`,
      );
      break;
    case "erreur":
      console.error(
        `[cron] Envoi automatique en échec : ${resultat.envoiAutomatique.message}`,
      );
      process.exitCode = 1;
      break;
  }
}

main()
  .catch((error) => {
    console.error("[cron] Erreur fatale :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
