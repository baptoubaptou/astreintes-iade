/**
 * Vérifie les notifications à la clôture d'une offre bourse.
 *
 * Usage : npx tsx scripts/test-bourse-notifications.ts
 */
import {
  PrismaClient,
  Role,
  StatutAstreinte,
  StatutOffreAstreinte,
  TypeCreneau,
} from "@prisma/client";
import { traiterOffresBourseExpirees } from "../src/server/bourse-astreintes";

const prisma = new PrismaClient();

async function compterNotifications(types: string[]) {
  return prisma.notification.count({
    where: { type: { in: types } },
  });
}

async function main() {
  const greffe = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Greffe" },
  });
  const marie = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });
  const thomas = await prisma.utilisateur.findFirst({
    where: { email: "thomas.bernard@test.local" },
  });
  const cadre = await prisma.utilisateur.findFirst({
    where: { email: "cadre@test.local" },
  });

  if (!greffe || !marie || !thomas || !cadre) {
    throw new Error("Données seed introuvables.");
  }

  const dateFuture = new Date(Date.UTC(2026, 8, 1));

  await prisma.notification.deleteMany({
    where: {
      type: {
        in: [
          "BOURSE_ATTRIBUTION_REPRENEUR",
          "BOURSE_ATTRIBUTION_DONNEUR",
          "BOURSE_ATTRIBUTION_CADRE",
          "BOURSE_SANS_CANDIDAT",
        ],
      },
    },
  });

  console.log("=== Test 1 — Attribution avec candidat (3 notifications) ===");

  const astreinte1 = await prisma.astreinte.create({
    data: {
      date: dateFuture,
      ligneId: greffe.id,
      iadeId: marie.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      statut: StatutAstreinte.PLANIFIEE,
    },
  });

  const offre1 = await prisma.offreAstreinte.create({
    data: {
      astreinteId: astreinte1.id,
      proposantId: marie.id,
      dateOuverture: new Date(Date.UTC(2026, 6, 1)),
      dateFermeture: new Date(Date.UTC(2026, 6, 12, 8, 0, 0)),
      statut: StatutOffreAstreinte.OUVERTE,
    },
  });

  await prisma.candidature.create({
    data: { offreId: offre1.id, iadeId: thomas.id },
  });

  const avantAttribution = await compterNotifications([
    "BOURSE_ATTRIBUTION_REPRENEUR",
    "BOURSE_ATTRIBUTION_DONNEUR",
    "BOURSE_ATTRIBUTION_CADRE",
  ]);

  await traiterOffresBourseExpirees(new Date(Date.UTC(2026, 6, 12, 9, 0, 0)));

  const [rep, don, cad] = await Promise.all([
    prisma.notification.count({
      where: {
        type: "BOURSE_ATTRIBUTION_REPRENEUR",
        utilisateurId: thomas.id,
      },
    }),
    prisma.notification.count({
      where: {
        type: "BOURSE_ATTRIBUTION_DONNEUR",
        utilisateurId: marie.id,
      },
    }),
    prisma.notification.count({
      where: {
        type: "BOURSE_ATTRIBUTION_CADRE",
        utilisateurId: cadre.id,
      },
    }),
  ]);

  const astreinteMiseAJour = await prisma.astreinte.findUnique({
    where: { id: astreinte1.id },
    select: { iadeId: true },
  });

  console.log(`Repreneur (Thomas) : ${rep} notification(s)`);
  console.log(`Donneur (Marie)    : ${don} notification(s)`);
  console.log(`Cadre              : ${cad} notification(s)`);
  console.log(`Nouvel IADE        : ${astreinteMiseAJour?.iadeId}`);

  if (rep !== 1 || don !== 1 || cad !== 1) {
    throw new Error("ÉCHEC : les 3 notifications d'attribution ne sont pas toutes envoyées.");
  }

  if (astreinteMiseAJour?.iadeId !== thomas.id) {
    throw new Error("ÉCHEC : l'astreinte n'a pas été transférée au repreneur.");
  }

  console.log("OK — 3 notifications d'attribution.\n");

  console.log("=== Test 2 — Sans candidat (alerte cadre garantie) ===");

  const astreinte2 = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2026, 8, 5)),
      ligneId: greffe.id,
      iadeId: marie.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      statut: StatutAstreinte.PLANIFIEE,
    },
  });

  await prisma.offreAstreinte.create({
    data: {
      astreinteId: astreinte2.id,
      proposantId: marie.id,
      dateOuverture: new Date(Date.UTC(2026, 6, 1)),
      dateFermeture: new Date(Date.UTC(2026, 6, 12, 8, 30, 0)),
      statut: StatutOffreAstreinte.OUVERTE,
    },
  });

  await traiterOffresBourseExpirees(new Date(Date.UTC(2026, 6, 12, 9, 30, 0)));

  const alerteCadre = await prisma.notification.count({
    where: {
      type: "BOURSE_SANS_CANDIDAT",
      utilisateurId: cadre.id,
    },
  });

  const offreSansCandidat = await prisma.offreAstreinte.findFirst({
    where: { astreinteId: astreinte2.id },
    select: { statut: true },
  });

  console.log(`Alerte cadre : ${alerteCadre} notification(s)`);
  console.log(`Statut offre : ${offreSansCandidat?.statut}`);

  if (alerteCadre !== 1) {
    throw new Error("ÉCHEC : le cadre n'a pas reçu l'alerte sans candidat.");
  }

  if (offreSansCandidat?.statut !== StatutOffreAstreinte.SANS_CANDIDAT) {
    throw new Error("ÉCHEC : statut offre incorrect.");
  }

  console.log("OK — alerte cadre garantie.\n");

  await prisma.candidature.deleteMany({
    where: { offre: { astreinteId: { in: [astreinte1.id, astreinte2.id] } } },
  });
  await prisma.offreAstreinte.deleteMany({
    where: { astreinteId: { in: [astreinte1.id, astreinte2.id] } },
  });
  await prisma.astreinte.deleteMany({
    where: { id: { in: [astreinte1.id, astreinte2.id] } },
  });

  console.log("Tous les tests notifications sont conformes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
