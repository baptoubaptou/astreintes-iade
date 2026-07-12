/**
 * Vérifie le stockage (poids seuls) et le calcul dynamique du bonus 24h.
 *
 * Usage : npx tsx scripts/test-weekend48h-points.ts
 */
import {
  PrismaClient,
  StatutAstreinte,
  TypeBonusContinuite,
  TypeCreneau,
} from "@prisma/client";
import { getBonusContinuite } from "../src/server/bonus-continuite";
import { calculerPointsAttribues, calculerPointsCumules } from "../src/server/points";

const prisma = new PrismaClient();

async function main() {
  const greffe = await prisma.ligneAstreinte.findFirst({
    where: { nom: "Greffe" },
  });
  const marie = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });

  if (!greffe || !marie) {
    throw new Error("Données seed introuvables (Greffe / marie.dupont).");
  }

  const samedi = new Date(Date.UTC(2026, 10, 7));
  const annee = samedi.getUTCFullYear();

  const existing = await prisma.astreinte.findFirst({
    where: {
      ligneId: greffe.id,
      date: samedi,
      statut: { not: StatutAstreinte.ANNULEE },
    },
  });

  if (existing) {
    throw new Error(
      `Le samedi ${samedi.toISOString().slice(0, 10)} est déjà occupé en base.`,
    );
  }

  for (const type of [TypeCreneau.JOUR_SAMEDI, TypeCreneau.NUIT_SAMEDI] as const) {
    await prisma.disponibilite.upsert({
      where: {
        iadeId_ligneId_date_typeCreneau: {
          iadeId: marie.id,
          ligneId: greffe.id,
          date: samedi,
          typeCreneau: type,
        },
      },
      create: {
        iadeId: marie.id,
        ligneId: greffe.id,
        date: samedi,
        typeCreneau: type,
      },
      update: {},
    });
  }

  const [poidsJour, poidsNuit, bonus24h] = await Promise.all([
    calculerPointsAttribues(greffe.id, TypeCreneau.JOUR_SAMEDI),
    calculerPointsAttribues(greffe.id, TypeCreneau.NUIT_SAMEDI),
    getBonusContinuite(greffe.id, TypeBonusContinuite.JOUR_NUIT),
  ]);
  const poidsAttendu = poidsJour + poidsNuit;
  const totalAttendu = poidsAttendu + bonus24h;
  const pointsAvant = await calculerPointsCumules(marie.id, annee);

  const created = await prisma.$transaction([
    prisma.astreinte.create({
      data: {
        date: samedi,
        ligneId: greffe.id,
        iadeId: marie.id,
        typeCreneau: TypeCreneau.JOUR_SAMEDI,
        pointsAttribues: poidsJour,
        statut: StatutAstreinte.PLANIFIEE,
      },
    }),
    prisma.astreinte.create({
      data: {
        date: samedi,
        ligneId: greffe.id,
        iadeId: marie.id,
        typeCreneau: TypeCreneau.NUIT_SAMEDI,
        pointsAttribues: poidsNuit,
        statut: StatutAstreinte.PLANIFIEE,
      },
    }),
  ]);

  const pointsApres = await calculerPointsCumules(marie.id, annee);
  const delta = pointsApres - pointsAvant;
  const sommeEnregistree = created.reduce(
    (sum, astreinte) => sum + astreinte.pointsAttribues,
    0,
  );

  console.log("=== Test samedi — poids en base + bonus dynamique ===");
  console.log(`IADE : ${marie.prenom} ${marie.nom}`);
  console.log(`Ligne : ${greffe.nom}`);
  console.log(`Date : ${samedi.toISOString().slice(0, 10)}`);
  console.log(`Poids JOUR_SAMEDI : ${poidsJour}`);
  console.log(`Poids NUIT_SAMEDI : ${poidsNuit}`);
  console.log(`Bonus JOUR_NUIT (dynamique) : ${bonus24h}`);
  console.log(`Somme pointsAttribues en base : ${sommeEnregistree}`);
  console.log(`Delta points cumulés : ${delta}`);

  if (sommeEnregistree !== poidsAttendu) {
    console.error(
      `\nÉCHEC stockage : somme=${sommeEnregistree}, poids attendu=${poidsAttendu}`,
    );
    process.exit(1);
  }

  if (delta !== totalAttendu) {
    console.error(
      `\nÉCHEC cumul : delta=${delta}, attendu=${totalAttendu} (poids + bonus)`,
    );
    process.exit(1);
  }

  console.log("\nOK — poids seuls en base, bonus 24h calculé à la lecture.");

  await prisma.astreinte.deleteMany({
    where: { id: { in: created.map((a) => a.id) } },
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
