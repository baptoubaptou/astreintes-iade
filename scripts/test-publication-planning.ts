/**
 * Vérifie la publication du planning et les notifications associées.
 *
 * Usage : npx tsx scripts/test-publication-planning.ts
 */
import {
  PrismaClient,
  TypeActionAudit,
} from "@prisma/client";
import { publierMoisPlanning } from "../src/server/publication-planning";
import { parseMoisParam } from "../src/server/astreintes";

const prisma = new PrismaClient();

async function main() {
  const cadre = await prisma.utilisateur.findFirst({
    where: { email: "cadre@test.local" },
  });

  if (!cadre) {
    throw new Error("Cadre seed introuvable.");
  }

  const now = new Date();
  const mois = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const nonPublieesAvant = await prisma.astreinte.count({
    where: { publie: false, statut: { not: "ANNULEE" } },
  });

  if (nonPublieesAvant === 0) {
    throw new Error("Aucune astreinte non publiée en seed.");
  }

  const notificationsAvant = await prisma.notification.count({
    where: { type: "NOUVELLE_AFFECTATION" },
  });

  const result = await publierMoisPlanning(mois, cadre.id);
  if ("error" in result) {
    throw new Error(result.error);
  }

  const [nonPublieesApres, audit, notificationsApres] = await Promise.all([
    prisma.astreinte.count({
      where: {
        publie: false,
        statut: { not: "ANNULEE" },
        date: {
          gte: new Date(
            Date.UTC(
              parseMoisParam(mois).year,
              parseMoisParam(mois).month - 1,
              1,
            ),
          ),
          lt: new Date(
            Date.UTC(
              parseMoisParam(mois).year,
              parseMoisParam(mois).month,
              1,
            ),
          ),
        },
      },
    }),
    prisma.journalAudit.findFirst({
      where: { typeAction: TypeActionAudit.PLANNING_PUBLIE, acteurId: cadre.id },
      orderBy: { dateAction: "desc" },
    }),
    prisma.notification.count({
      where: { type: "NOUVELLE_AFFECTATION" },
    }),
  ]);

  console.log("=== Test publication mois ===");
  console.log(`Mois : ${mois}`);
  console.log(`Astreintes publiées : ${result.publiees}`);
  console.log(`Notifications NOUVELLE_AFFECTATION : +${notificationsApres - notificationsAvant}`);

  if (result.publiees === 0 || nonPublieesApres !== 0) {
    console.error("ÉCHEC : publication incomplète.");
    process.exit(1);
  }

  if (!audit) {
    console.error("ÉCHEC : audit PLANNING_PUBLIE manquant.");
    process.exit(1);
  }

  if (notificationsApres <= notificationsAvant) {
    console.error("ÉCHEC : aucune notification de nouvelle affectation.");
    process.exit(1);
  }

  console.log("\nOK — publication, notifications et audit conformes.");
}

main()
  .catch((error) => {
    console.error("Erreur :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
