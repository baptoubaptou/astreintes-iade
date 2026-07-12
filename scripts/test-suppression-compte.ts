/**
 * Vérifie la suppression en cascade d'un compte IADE et les règles de sécurité CADRE.
 *
 * Usage : npx tsx scripts/test-suppression-compte.ts
 */
import {
  PrismaClient,
  Role,
  StatutAstreinte,
  StatutDemandeEchange,
  StatutOffreAstreinte,
  TypeActionAudit,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { deleteUtilisateur } from "../src/server/utilisateurs";

const prisma = new PrismaClient();

async function compterDonneesLiees(iadeId: string) {
  const [
    astreintes,
    disponibilites,
    qualifications,
    preferences,
    notifications,
    auditsActeur,
    auditsConcerne,
    demandesDemandeur,
    demandesRemplacant,
    offres,
    candidatures,
    tokens,
    changementsEmail,
  ] = await Promise.all([
    prisma.astreinte.count({ where: { iadeId } }),
    prisma.disponibilite.count({ where: { iadeId } }),
    prisma.qualification.count({ where: { iadeId } }),
    prisma.preferenceContinuite.count({ where: { iadeId } }),
    prisma.notification.count({ where: { utilisateurId: iadeId } }),
    prisma.journalAudit.count({ where: { acteurId: iadeId } }),
    prisma.journalAudit.count({ where: { iadeConcerneId: iadeId } }),
    prisma.demandeEchange.count({ where: { demandeurId: iadeId } }),
    prisma.demandeEchange.count({ where: { remplacantId: iadeId } }),
    prisma.offreAstreinte.count({ where: { proposantId: iadeId } }),
    prisma.candidature.count({ where: { iadeId } }),
    prisma.tokenReinitialisationMotDePasse.count({
      where: { utilisateurId: iadeId },
    }),
    prisma.changementEmailEnAttente.count({
      where: { utilisateurId: iadeId },
    }),
  ]);

  return {
    astreintes,
    disponibilites,
    qualifications,
    preferences,
    notifications,
    auditsActeur,
    auditsConcerne,
    demandesDemandeur,
    demandesRemplacant,
    offres,
    candidatures,
    tokens,
    changementsEmail,
    total:
      astreintes +
      disponibilites +
      qualifications +
      preferences +
      notifications +
      auditsActeur +
      auditsConcerne +
      demandesDemandeur +
      demandesRemplacant +
      offres +
      candidatures +
      tokens +
      changementsEmail,
  };
}

async function main() {
  const greffe = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Greffe" },
  });
  const cadre = await prisma.utilisateur.findFirst({
    where: { email: "cadre@test.local" },
  });
  const autreIade = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });

  if (!greffe || !cadre || !autreIade) {
    throw new Error("Données seed introuvables (Greffe, cadre, Marie).");
  }

  console.log("=== Règles de sécurité CADRE ===");

  const autoSuppression = await deleteUtilisateur(cadre.id, cadre.id);
  if (!("error" in autoSuppression)) {
    throw new Error("ÉCHEC : un CADRE peut supprimer son propre compte.");
  }
  console.log(`Auto-suppression bloquée : ${autoSuppression.error}`);

  const cadresActifs = await prisma.utilisateur.count({
    where: { role: Role.CADRE, actif: true },
  });

  if (cadresActifs === 1) {
    const dernierCadre = await deleteUtilisateur(cadre.id, autreIade.id);
    if (!("error" in dernierCadre)) {
      throw new Error("ÉCHEC : le dernier CADRE actif a été supprimé.");
    }
    console.log(`Dernier CADRE protégé : ${dernierCadre.error}`);
  } else {
    console.log(
      `Skip protection dernier CADRE (${cadresActifs} CADRE actifs en base).`,
    );
  }

  console.log("\n=== Suppression en cascade IADE ===");

  const motDePasseHash = await bcrypt.hash("password123", 10);
  const testIade = await prisma.utilisateur.create({
    data: {
      nom: "Cascade",
      prenom: "Test",
      matricule: `TESTCASCADE${Date.now()}`,
      email: `test.cascade.${Date.now()}@test.local`,
      role: Role.IADE,
      motDePasseHash,
    },
  });

  const datePassee = new Date(Date.UTC(2024, 5, 10));
  const dateFuture = new Date(Date.UTC(2026, 11, 15));

  const astreintePassee = await prisma.astreinte.create({
    data: {
      date: datePassee,
      ligneId: greffe.id,
      iadeId: testIade.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      statut: StatutAstreinte.PLANIFIEE,
      publie: true,
    },
  });

  const astreinteFuture = await prisma.astreinte.create({
    data: {
      date: dateFuture,
      ligneId: greffe.id,
      iadeId: testIade.id,
      typeCreneau: TypeCreneau.JOUR_SAMEDI,
      pointsAttribues: 1,
      statut: StatutAstreinte.PLANIFIEE,
    },
  });

  await prisma.disponibilite.create({
    data: {
      iadeId: testIade.id,
      ligneId: greffe.id,
      date: dateFuture,
      typeCreneau: TypeCreneau.JOUR_SAMEDI,
    },
  });

  await prisma.qualification.create({
    data: { iadeId: testIade.id, ligneId: greffe.id },
  });

  await prisma.preferenceContinuite.create({
    data: {
      iadeId: testIade.id,
      ligneId: greffe.id,
      dateDebut: dateFuture,
      type: TypePreferenceContinuite.JOUR_NUIT,
    },
  });

  await prisma.notification.create({
    data: {
      utilisateurId: testIade.id,
      type: "TEST_SUPPRESSION",
      message: "Notification de test",
    },
  });

  await prisma.journalAudit.create({
    data: {
      acteurId: testIade.id,
      iadeConcerneId: testIade.id,
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      resume: "Audit test suppression cascade",
    },
  });

  const astreinteAutre = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2026, 10, 1)),
      ligneId: greffe.id,
      iadeId: autreIade.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      statut: StatutAstreinte.PLANIFIEE,
    },
  });

  await prisma.demandeEchange.create({
    data: {
      astreinteId: astreintePassee.id,
      demandeurId: testIade.id,
      remplacantId: autreIade.id,
      statut: StatutDemandeEchange.EN_ATTENTE,
    },
  });

  await prisma.demandeEchange.create({
    data: {
      astreinteId: astreinteAutre.id,
      demandeurId: autreIade.id,
      remplacantId: testIade.id,
      statut: StatutDemandeEchange.EN_ATTENTE,
    },
  });

  const offre = await prisma.offreAstreinte.create({
    data: {
      astreinteId: astreinteFuture.id,
      proposantId: testIade.id,
      dateOuverture: new Date(Date.UTC(2026, 10, 1)),
      dateFermeture: new Date(Date.UTC(2026, 10, 8)),
      statut: StatutOffreAstreinte.OUVERTE,
    },
  });

  await prisma.candidature.create({
    data: { offreId: offre.id, iadeId: testIade.id },
  });

  const avantSuppression = await compterDonneesLiees(testIade.id);
  console.log("Données liées avant suppression :", avantSuppression);

  if (avantSuppression.total < 10) {
    throw new Error("ÉCHEC : jeu de données de test incomplet.");
  }

  const resultat = await deleteUtilisateur(testIade.id, cadre.id);
  if ("error" in resultat) {
    throw new Error(`ÉCHEC suppression : ${resultat.error}`);
  }

  const utilisateurRestant = await prisma.utilisateur.findUnique({
    where: { id: testIade.id },
  });

  if (utilisateurRestant) {
    throw new Error("ÉCHEC : le compte IADE existe encore.");
  }

  const apresSuppression = await compterDonneesLiees(testIade.id);
  console.log("Données liées après suppression :", apresSuppression);

  if (apresSuppression.total > 0) {
    throw new Error("ÉCHEC : des données orphelines subsistent.");
  }

  const astreinteAutreRestante = await prisma.astreinte.findUnique({
    where: { id: astreinteAutre.id },
  });

  if (!astreinteAutreRestante) {
    throw new Error("ÉCHEC : l'astreinte d'un autre IADE a été supprimée.");
  }

  const demandeAutreRestante = await prisma.demandeEchange.count({
    where: { astreinteId: astreinteAutre.id },
  });

  if (demandeAutreRestante !== 0) {
    throw new Error(
      "ÉCHEC : la demande d'échange où le test IADE était remplaçant devrait être supprimée.",
    );
  }

  console.log("\nOK — Suppression en cascade validée, aucune donnée orpheline.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
