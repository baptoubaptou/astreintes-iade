import {
  ModeAttribution,
  PrismaClient,
  Role,
  SourceJourFerie,
  StatutAstreinte,
  TypeBonusContinuite,
  TypeCreneau,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { calculerJoursFeries } from "../src/server/jours-feries";
import { CLE_MODE_ATTRIBUTION, CLE_LISSE_SEUIL_ECART_ABERRANT, VALEUR_META_LISSE_SEUIL_ECART_ABERRANT } from "../src/server/parametre-algorithme";

const prisma = new PrismaClient();

const TEST_PASSWORD = "password123";
const BCRYPT_ROUNDS = 10;

const TYPES_CRENEAU: TypeCreneau[] = [
  TypeCreneau.NUIT_SEMAINE,
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

function dateAt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

async function clearDatabase() {
  await prisma.journalAudit.deleteMany();
  await prisma.fenetreGeneration.deleteMany();
  await prisma.parametreAlgorithme.deleteMany();
  await prisma.bonusContinuite.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.candidature.deleteMany();
  await prisma.offreAstreinte.deleteMany();
  await prisma.demandeEchange.deleteMany();
  await prisma.astreinte.deleteMany();
  await prisma.preferenceContinuite.deleteMany();
  await prisma.disponibilite.deleteMany();
  await prisma.jourFerie.deleteMany();
  await prisma.qualification.deleteMany();
  await prisma.poidsCreneau.deleteMany();
  await prisma.utilisateur.deleteMany();
  await prisma.ligneAstreinte.deleteMany();
}

async function seedPoidsCreneaux(
  ligneId: string,
  nom: string,
): Promise<number> {
  const poids = nom === "Greffe" ? 2 : 1;

  await prisma.poidsCreneau.createMany({
    data: TYPES_CRENEAU.map((typeCreneau) => ({
      ligneId,
      typeCreneau,
      poids,
    })),
  });

  return poids;
}

async function seedBonusContinuite(ligneId: string): Promise<void> {
  await prisma.bonusContinuite.createMany({
    data: [
      {
        ligneId,
        type: TypeBonusContinuite.JOUR_NUIT,
        bonus: 1,
      },
      {
        ligneId,
        type: TypeBonusContinuite.WEEKEND_48H,
        bonus: 2,
      },
    ],
  });
}

function getJoursFeriesAnnee(year: number) {
  return calculerJoursFeries(year);
}

async function main() {
  const motDePasseHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  await clearDatabase();

  const lignes = await Promise.all([
    prisma.ligneAstreinte.create({
      data: { nom: "Greffe", ordrePriorite: 1 },
    }),
    prisma.ligneAstreinte.create({
      data: { nom: "Obstétrique", ordrePriorite: 2 },
    }),
    prisma.ligneAstreinte.create({
      data: { nom: "Urgences", ordrePriorite: 3 },
    }),
  ]);

  const [greffe, obstetrique, urgences] = lignes;

  const [poidsGreffe, poidsObstetrique, poidsUrgences] = await Promise.all([
    seedPoidsCreneaux(greffe.id, greffe.nom),
    seedPoidsCreneaux(obstetrique.id, obstetrique.nom),
    seedPoidsCreneaux(urgences.id, urgences.nom),
  ]);

  await Promise.all(lignes.map((ligne) => seedBonusContinuite(ligne.id)));

  await prisma.parametreAlgorithme.create({
    data: {
      cle: CLE_MODE_ATTRIBUTION,
      valeur: ModeAttribution.GLOUTON,
    },
  });

  await prisma.parametreAlgorithme.create({
    data: {
      cle: CLE_LISSE_SEUIL_ECART_ABERRANT,
      valeur: VALEUR_META_LISSE_SEUIL_ECART_ABERRANT,
    },
  });

  await prisma.utilisateur.create({
    data: {
      nom: "Leroy",
      prenom: "Nathalie",
      matricule: "CADRE001",
      email: "cadre@test.local",
      motDePasseHash,
      role: Role.CADRE,
    },
  });

  const iades = await Promise.all([
    prisma.utilisateur.create({
      data: {
        nom: "Dupont",
        prenom: "Marie",
        matricule: "IADE001",
        email: "marie.dupont@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
    prisma.utilisateur.create({
      data: {
        nom: "Bernard",
        prenom: "Thomas",
        matricule: "IADE002",
        email: "thomas.bernard@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
    prisma.utilisateur.create({
      data: {
        nom: "Martin",
        prenom: "Sophie",
        matricule: "IADE003",
        email: "sophie.martin@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
    prisma.utilisateur.create({
      data: {
        nom: "Petit",
        prenom: "Lucas",
        matricule: "IADE004",
        email: "lucas.petit@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
    prisma.utilisateur.create({
      data: {
        nom: "Rousseau",
        prenom: "Camille",
        matricule: "IADE005",
        email: "camille.rousseau@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
    prisma.utilisateur.create({
      data: {
        nom: "Moreau",
        prenom: "Antoine",
        matricule: "IADE006",
        email: "antoine.moreau@test.local",
        motDePasseHash,
        role: Role.IADE,
      },
    }),
  ]);

  const [marie, thomas, sophie, lucas, camille, antoine] = iades;

  const qualifications = [
    { iadeId: marie.id, ligneId: greffe.id },
    { iadeId: marie.id, ligneId: obstetrique.id },
    { iadeId: marie.id, ligneId: urgences.id },
    { iadeId: thomas.id, ligneId: greffe.id },
    { iadeId: thomas.id, ligneId: obstetrique.id },
    { iadeId: thomas.id, ligneId: urgences.id },
    { iadeId: sophie.id, ligneId: greffe.id },
    { iadeId: sophie.id, ligneId: obstetrique.id },
    { iadeId: lucas.id, ligneId: greffe.id },
    { iadeId: lucas.id, ligneId: urgences.id },
    { iadeId: camille.id, ligneId: obstetrique.id },
    { iadeId: antoine.id, ligneId: urgences.id },
  ];

  await prisma.qualification.createMany({ data: qualifications });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const astreintesPlanifiees: {
    day: number;
    ligneId: string;
    iadeId: string;
    pointsAttribues: number;
  }[] = [
    { day: 3, ligneId: greffe.id, iadeId: marie.id, pointsAttribues: poidsGreffe },
    { day: 3, ligneId: obstetrique.id, iadeId: camille.id, pointsAttribues: poidsObstetrique },
    { day: 3, ligneId: urgences.id, iadeId: antoine.id, pointsAttribues: poidsUrgences },
    { day: 7, ligneId: greffe.id, iadeId: thomas.id, pointsAttribues: poidsGreffe },
    { day: 7, ligneId: obstetrique.id, iadeId: sophie.id, pointsAttribues: poidsObstetrique },
    { day: 7, ligneId: urgences.id, iadeId: lucas.id, pointsAttribues: poidsUrgences },
    { day: 11, ligneId: greffe.id, iadeId: sophie.id, pointsAttribues: poidsGreffe },
    { day: 11, ligneId: obstetrique.id, iadeId: marie.id, pointsAttribues: poidsObstetrique },
    { day: 11, ligneId: urgences.id, iadeId: thomas.id, pointsAttribues: poidsUrgences },
    { day: 15, ligneId: greffe.id, iadeId: lucas.id, pointsAttribues: poidsGreffe },
    { day: 15, ligneId: obstetrique.id, iadeId: thomas.id, pointsAttribues: poidsObstetrique },
    { day: 18, ligneId: greffe.id, iadeId: marie.id, pointsAttribues: poidsGreffe },
    { day: 18, ligneId: urgences.id, iadeId: antoine.id, pointsAttribues: poidsUrgences },
    { day: 22, ligneId: obstetrique.id, iadeId: camille.id, pointsAttribues: poidsObstetrique },
    { day: 22, ligneId: urgences.id, iadeId: lucas.id, pointsAttribues: poidsUrgences },
    { day: 26, ligneId: greffe.id, iadeId: thomas.id, pointsAttribues: poidsGreffe },
    { day: 26, ligneId: obstetrique.id, iadeId: sophie.id, pointsAttribues: poidsObstetrique },
    { day: 30, ligneId: greffe.id, iadeId: marie.id, pointsAttribues: poidsGreffe },
    { day: 30, ligneId: urgences.id, iadeId: thomas.id, pointsAttribues: poidsUrgences },
  ];

  await prisma.astreinte.createMany({
    data: astreintesPlanifiees.map((astreinte) => ({
      date: dateAt(year, month, astreinte.day),
      ligneId: astreinte.ligneId,
      iadeId: astreinte.iadeId,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      statut: StatutAstreinte.PLANIFIEE,
      pointsAttribues: astreinte.pointsAttribues,
    })),
  });

  const joursMarieGreffeObstetrique = [3, 18, 30];
  await prisma.disponibilite.createMany({
    data: joursMarieGreffeObstetrique.flatMap((day) => [
      {
        iadeId: marie.id,
        ligneId: greffe.id,
        date: dateAt(year, month, day),
        typeCreneau: TypeCreneau.NUIT_SEMAINE,
      },
      {
        iadeId: marie.id,
        ligneId: obstetrique.id,
        date: dateAt(year, month, day),
        typeCreneau: TypeCreneau.NUIT_SEMAINE,
      },
    ]),
  });

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  await prisma.fenetreGeneration.create({
    data: {
      ligneId: greffe.id,
      periodeDebut: dateAt(year, month, 1),
      periodeFin: dateAt(year, month, lastDayOfMonth),
      dateGenerationPrevue: dateAt(year, month, 1),
    },
  });

  const joursFeries = getJoursFeriesAnnee(year);
  await prisma.jourFerie.createMany({
    data: joursFeries.map((jour) => ({
      date: jour.date,
      nom: jour.nom,
      source: SourceJourFerie.AUTO,
      actif: true,
    })),
  });

  const moisSuivant = month === 12 ? 1 : month + 1;
  const anneeCampagne = month === 12 ? year + 1 : year;

  await prisma.fenetreGeneration.createMany({
    data: [
      {
        ligneId: greffe.id,
        periodeDebut: dateAt(anneeCampagne, moisSuivant, 1),
        periodeFin: dateAt(anneeCampagne, moisSuivant, 30),
        dateGenerationPrevue: dateAt(anneeCampagne, moisSuivant, 1),
      },
      {
        ligneId: obstetrique.id,
        periodeDebut: dateAt(anneeCampagne, moisSuivant, 1),
        periodeFin: dateAt(anneeCampagne, moisSuivant, 30),
        dateGenerationPrevue: dateAt(anneeCampagne, moisSuivant, 10),
      },
      {
        ligneId: urgences.id,
        periodeDebut: dateAt(anneeCampagne, moisSuivant, 1),
        periodeFin: dateAt(anneeCampagne, moisSuivant, 30),
        dateGenerationPrevue: dateAt(anneeCampagne, moisSuivant, 15),
      },
    ],
  });

  const totalPoidsCreneaux = lignes.length * TYPES_CRENEAU.length;

  console.log("Seed terminé avec succès.");
  console.log(`- ${lignes.length} lignes d'astreinte`);
  console.log(`- ${totalPoidsCreneaux} entrées PoidsCreneau`);
  console.log(`- 1 cadre + ${iades.length} IADE`);
  console.log(`- ${qualifications.length} qualifications`);
  console.log(`- ${astreintesPlanifiees.length} astreintes planifiées (${month}/${year})`);
  console.log(`- ${joursMarieGreffeObstetrique.length * 2} disponibilités Marie (Greffe + Obstétrique)`);
  console.log(`- 1 campagne Greffe courante + 3 campagnes mois suivant`);
  console.log(`- ${joursFeries.length} jours fériés (${year}, source AUTO)`);
  console.log(`- 3 campagnes de planification (${moisSuivant}/${anneeCampagne})`);
  console.log(`Mot de passe de test pour tous les comptes : ${TEST_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Erreur lors du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
