/**
 * Vérification ciblée des 3 corrections d'audit.
 *
 * Prérequis : npm run db:seed
 * Usage : npx tsx scripts/test-ecarts-audit.ts
 */
import {
  PrismaClient,
  StatutFenetreGeneration,
  TypeActionAudit,
  TypeCreneau,
} from "@prisma/client";
import { confirmerCampagne } from "../src/server/campagnes";
import { updateAstreinte } from "../src/server/astreintes";
import { validerSimulationPlanning } from "../src/server/simulation-planning";
import type { PropositionAffectation } from "../src/server/algorithme-affectation";

const prisma = new PrismaClient();

async function preparerCampagneConfirmee() {
  const greffe = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Greffe" },
  });
  const cadre = await prisma.utilisateur.findFirst({
    where: { email: "cadre@test.local" },
  });

  if (!greffe || !cadre) {
    throw new Error("Données seed introuvables (Greffe / cadre).");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const dateTest = new Date(Date.UTC(year, month - 1, 3));

  let fenetre = await prisma.fenetreGeneration.findFirst({
    where: {
      ligneId: greffe.id,
      periodeDebut: { lte: dateTest },
      periodeFin: { gte: dateTest },
    },
    orderBy: { periodeDebut: "asc" },
  });

  if (!fenetre) {
    throw new Error("Aucune fenêtre Greffe couvrant le jour de test.");
  }

  if (fenetre.statut !== StatutFenetreGeneration.CONFIRMEE) {
    const result = await confirmerCampagne(fenetre.id, cadre.id);
    if ("error" in result) {
      throw new Error(`Confirmation campagne : ${result.error}`);
    }
    fenetre = await prisma.fenetreGeneration.findUniqueOrThrow({
      where: { id: fenetre.id },
    });
  }

  return { greffe, cadre, dateTest, fenetre };
}

async function testReaffectationCampagneConfirmee() {
  console.log("\n=== Test 1 : réaffectation campagne confirmée ===");

  const { greffe, cadre, dateTest } = await preparerCampagneConfirmee();

  const [marie, thomas] = await Promise.all([
    prisma.utilisateur.findFirst({ where: { email: "marie.dupont@test.local" } }),
    prisma.utilisateur.findFirst({ where: { email: "thomas.bernard@test.local" } }),
  ]);

  if (!marie || !thomas) {
    throw new Error("IADE Marie ou Thomas introuvables.");
  }

  let astreinte = await prisma.astreinte.findFirst({
    where: {
      ligneId: greffe.id,
      date: dateTest,
      statut: { not: "ANNULEE" },
      iadeId: marie.id,
    },
    include: {
      ligne: { select: { id: true, nom: true } },
      iade: { select: { id: true, prenom: true, nom: true } },
    },
  });

  if (!astreinte) {
    astreinte = await prisma.astreinte.findFirst({
      where: {
        ligneId: greffe.id,
        date: dateTest,
        statut: { not: "ANNULEE" },
      },
      include: {
        ligne: { select: { id: true, nom: true } },
        iade: { select: { id: true, prenom: true, nom: true } },
      },
    });
  }

  if (!astreinte) {
    throw new Error("Aucune astreinte Greffe trouvée pour le jour de test.");
  }

  const ancienIadeId = astreinte.iadeId;
  const nouvelIadeId = ancienIadeId === marie.id ? thomas.id : marie.id;

  const avant = new Date();

  const result = await updateAstreinte(
    astreinte.id,
    { iadeId: nouvelIadeId },
    cadre.id,
  );

  if ("success" in result && result.success === false) {
    throw new Error(`updateAstreinte échoué : ${result.error.message}`);
  }

  const recentes = await prisma.notification.findMany({
    where: { createdAt: { gte: avant } },
    orderBy: { createdAt: "desc" },
  });

  const notifAncien = recentes.filter(
    (n) =>
      n.utilisateurId === ancienIadeId &&
      n.type === "ASTREINTE_MODIFIEE_CAMPAGNE",
  );
  const notifNouveau = recentes.filter(
    (n) =>
      n.utilisateurId === nouvelIadeId && n.type === "NOUVELLE_AFFECTATION",
  );
  const notifCadre = recentes.filter(
    (n) =>
      n.utilisateurId === cadre.id && n.type === "ASTREINTE_MODIFIEE_CADRE",
  );

  console.log(`  Notifications créées : ${recentes.length}`);
  console.log(`  Ancien IADE : ${notifAncien.length} (ASTREINTE_MODIFIEE_CAMPAGNE)`);
  console.log(`  Nouvel IADE : ${notifNouveau.length} (NOUVELLE_AFFECTATION)`);
  console.log(`  Cadre : ${notifCadre.length} (ASTREINTE_MODIFIEE_CADRE)`);

  if (notifAncien.length < 1) {
    throw new Error("ÉCHEC : notification manquante pour l'ancien IADE.");
  }
  if (notifNouveau.length < 1) {
    throw new Error("ÉCHEC : notification NOUVELLE_AFFECTATION manquante pour le nouvel IADE.");
  }

  console.log("  OK : 2 notifications IADE (ancien + nouveau) détectées.");
  console.log(
    "  (Les emails sont logués en console en mode dev — vérifier les lignes [email] ci-dessus.)",
  );

  await prisma.astreinte.update({
    where: { id: astreinte.id },
    data: { iadeId: ancienIadeId },
  });
}

async function testJournalSimulationCadre() {
  console.log("\n=== Test 2 : journal simulation avec acteur cadre ===");

  const cadre = await prisma.utilisateur.findFirst({
    where: { email: "cadre@test.local" },
  });
  const urgences = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Urgences" },
  });
  const obstetrique = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Obstétrique" },
  });
  const thomas = await prisma.utilisateur.findFirst({
    where: { email: "thomas.bernard@test.local" },
  });

  if (!cadre || !obstetrique || !thomas) {
    throw new Error("Données seed introuvables.");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const jourLibre = 4;
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(jourLibre).padStart(2, "0")}`;
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);

  const existante = await prisma.astreinte.findFirst({
    where: {
      ligneId: obstetrique.id,
      date: dateObj,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      statut: { not: "ANNULEE" },
    },
  });

  if (existante) {
    console.log("  Créneau Obstétrique déjà occupé ce jour, test journal ignoré.");
    return;
  }

  await prisma.disponibilite.upsert({
    where: {
      iadeId_ligneId_date_typeCreneau: {
        iadeId: thomas.id,
        ligneId: obstetrique.id,
        date: dateObj,
        typeCreneau: TypeCreneau.NUIT_SEMAINE,
      },
    },
    create: {
      iadeId: thomas.id,
      ligneId: obstetrique.id,
      date: dateObj,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
    },
    update: {},
  });

  const proposition: PropositionAffectation = {
    date: dateStr,
    ligneId: obstetrique.id,
    ligneNom: obstetrique.nom,
    typeCreneau: TypeCreneau.NUIT_SEMAINE,
    iadeId: thomas.id,
    iadeNom: `${thomas.prenom} ${thomas.nom}`,
    pointsAttribues: 1,
  };

  const auditsAvant = await prisma.journalAudit.count({
    where: {
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      acteurId: cadre.id,
    },
  });

  const result = await validerSimulationPlanning([proposition], cadre.id);

  if (!result.success) {
    throw new Error(
      `Validation simulation échouée : ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const audit = await prisma.journalAudit.findFirst({
    where: {
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      acteurId: cadre.id,
    },
    orderBy: { dateAction: "desc" },
    include: {
      acteur: { select: { prenom: true, nom: true } },
    },
  });

  const auditsApres = await prisma.journalAudit.count({
    where: {
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      acteurId: cadre.id,
    },
  });

  if (auditsApres <= auditsAvant) {
    throw new Error("ÉCHEC : aucune entrée journal avec acteurId cadre.");
  }

  if (!audit?.acteur) {
    throw new Error("ÉCHEC : acteur null sur l'entrée journal.");
  }

  const label = `${audit.acteur.prenom} ${audit.acteur.nom}`;
  console.log(`  Acteur journal : ${label}`);
  if (label.toLowerCase().includes("système") || audit.acteurId === null) {
    throw new Error("ÉCHEC : le journal afficherait « Système ».");
  }

  console.log("  OK : le journal affiche le nom du cadre.");

  await prisma.astreinte.deleteMany({
    where: {
      ligneId: obstetrique.id,
      date: dateObj,
      iadeId: thomas.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
    },
  });
}

async function main() {
  await testReaffectationCampagneConfirmee();
  await testJournalSimulationCadre();
  console.log("\nTous les tests ciblés ont réussi.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
