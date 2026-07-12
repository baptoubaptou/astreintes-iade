/**
 * Vérifie la confirmation de campagne Greffe et le nettoyage des disponibilités.
 *
 * Prérequis : npm run db:seed
 * Usage : npx tsx scripts/test-confirmation-campagne.ts
 */
import {
  PrismaClient,
  StatutFenetreGeneration,
  TypeActionAudit,
  TypeCreneau,
} from "@prisma/client";
import { confirmerCampagne } from "../src/server/campagnes";

const prisma = new PrismaClient();

async function main() {
  const [greffe, obstetrique, marie, cadre] = await Promise.all([
    prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } }),
    prisma.ligneAstreinte.findFirst({ where: { nom: "Obstétrique" } }),
    prisma.utilisateur.findFirst({ where: { email: "marie.dupont@test.local" } }),
    prisma.utilisateur.findFirst({ where: { email: "cadre@test.local" } }),
  ]);

  if (!greffe || !obstetrique || !marie || !cadre) {
    throw new Error("Données seed introuvables.");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const jourTest = 3;
  const dateTest = new Date(Date.UTC(year, month - 1, jourTest));

  const campagne = await prisma.fenetreGeneration.findFirst({
    where: {
      ligneId: greffe.id,
      statut: StatutFenetreGeneration.PLANIFIEE,
      periodeDebut: { lte: dateTest },
      periodeFin: { gte: dateTest },
    },
    orderBy: { periodeDebut: "asc" },
  });

  if (!campagne) {
    throw new Error("Aucune campagne Greffe planifiée couvrant le jour de test.");
  }

  const dispoObstAvant = await prisma.disponibilite.findUnique({
    where: {
      iadeId_ligneId_date_typeCreneau: {
        iadeId: marie.id,
        ligneId: obstetrique.id,
        date: dateTest,
        typeCreneau: TypeCreneau.NUIT_SEMAINE,
      },
    },
  });

  if (!dispoObstAvant) {
    throw new Error(
      "Disponibilité Marie/Obstétrique attendue en seed pour le jour de test.",
    );
  }

  const auditsAvant = await prisma.journalAudit.count({
    where: {
      typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO,
      iadeConcerneId: marie.id,
    },
  });

  const result = await confirmerCampagne(campagne.id, cadre.id);
  if ("error" in result) {
    throw new Error(`Confirmation échouée : ${result.error}`);
  }

  const [dispoObstApres, auditSuppression, auditCampagne] = await Promise.all([
    prisma.disponibilite.findUnique({
      where: {
        iadeId_ligneId_date_typeCreneau: {
          iadeId: marie.id,
          ligneId: obstetrique.id,
          date: dateTest,
          typeCreneau: TypeCreneau.NUIT_SEMAINE,
        },
      },
    }),
    prisma.journalAudit.findFirst({
      where: {
        typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO,
        iadeConcerneId: marie.id,
      },
      orderBy: { dateAction: "desc" },
    }),
    prisma.journalAudit.findFirst({
      where: {
        typeAction: TypeActionAudit.CAMPAGNE_CONFIRMEE,
        acteurId: cadre.id,
      },
      orderBy: { dateAction: "desc" },
    }),
  ]);

  const campagneApres = await prisma.fenetreGeneration.findUnique({
    where: { id: campagne.id },
    select: { statut: true, dateConfirmation: true },
  });

  console.log("=== Test confirmation campagne Greffe ===");
  console.log(`Campagne : ${campagne.id}`);
  console.log(`Disponibilités supprimées : ${result.disponibilitesSupprimees}`);
  console.log(`Audit suppression : ${auditSuppression?.resume ?? "—"}`);

  if (dispoObstApres) {
    console.error("ÉCHEC : la disponibilité Obstétrique est toujours présente.");
    process.exit(1);
  }

  if (!auditSuppression?.resume.includes("Obstétrique")) {
    console.error("ÉCHEC : entrée JournalAudit introuvable ou incomplète.");
    process.exit(1);
  }

  if (!auditCampagne || campagneApres?.statut !== StatutFenetreGeneration.CONFIRMEE) {
    console.error("ÉCHEC : campagne non confirmée ou audit manquant.");
    process.exit(1);
  }

  const auditsApres = await prisma.journalAudit.count({
    where: {
      typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO,
      iadeConcerneId: marie.id,
    },
  });

  if (auditsApres <= auditsAvant) {
    console.error("ÉCHEC : aucun nouvel audit de suppression enregistré.");
    process.exit(1);
  }

  console.log("\nOK — disponibilité Obstétrique retirée et campagne confirmée.");

  await prisma.fenetreGeneration.update({
    where: { id: campagne.id },
    data: {
      statut: StatutFenetreGeneration.PLANIFIEE,
      dateConfirmation: null,
    },
  });
}

main()
  .catch((error) => {
    console.error("Erreur :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
