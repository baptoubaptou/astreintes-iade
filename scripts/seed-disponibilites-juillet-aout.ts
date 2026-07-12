/**
 * Attribue des disponibilités de test sur juillet et août à tous les IADE actifs,
 * pour chaque ligne sur laquelle ils sont qualifiés et chaque créneau applicable.
 *
 * Usage : npx tsx scripts/seed-disponibilites-juillet-aout.ts
 *         npx tsx scripts/seed-disponibilites-juillet-aout.ts 2026
 */
import { PrismaClient, Role } from "@prisma/client";
import {
  chargerTypesJour,
  creneauxDisponiblesPour,
  formatDateKey,
} from "../src/server/jours-feries";

const prisma = new PrismaClient();

const MOIS_CIBLES = [7, 8];

function dateAt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function joursDuMois(year: number, month: number): Date[] {
  const nombreJours = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: nombreJours }, (_, index) =>
    dateAt(year, month, index + 1),
  );
}

async function main() {
  const year = process.argv[2] ? Number(process.argv[2]) : new Date().getUTCFullYear();

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Année invalide : ${process.argv[2]}`);
  }

  const iades = await prisma.utilisateur.findMany({
    where: { role: Role.IADE, actif: true },
    select: {
      id: true,
      prenom: true,
      nom: true,
      qualifications: {
        select: {
          ligneId: true,
          ligne: { select: { nom: true, actif: true } },
        },
      },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (iades.length === 0) {
    console.log("Aucun IADE actif trouvé.");
    return;
  }

  const dates = MOIS_CIBLES.flatMap((month) => joursDuMois(year, month));
  const typesJourParDate = await chargerTypesJour(dates);

  const rangeDebut = dates[0];
  const rangeFin = dates[dates.length - 1];

  const { count: supprimees } = await prisma.disponibilite.deleteMany({
    where: {
      iade: { role: Role.IADE, actif: true },
      date: { gte: rangeDebut, lte: rangeFin },
    },
  });

  const entries: Array<{
    iadeId: string;
    ligneId: string;
    date: Date;
    typeCreneau: ReturnType<typeof creneauxDisponiblesPour>[number];
  }> = [];

  for (const iade of iades) {
    const lignesQualifiees = iade.qualifications.filter(
      (qualification) => qualification.ligne.actif,
    );

    for (const qualification of lignesQualifiees) {
      for (const date of dates) {
        const typeJour = typesJourParDate.get(formatDateKey(date));
        if (!typeJour) {
          continue;
        }

        for (const typeCreneau of creneauxDisponiblesPour(typeJour)) {
          entries.push({
            iadeId: iade.id,
            ligneId: qualification.ligneId,
            date,
            typeCreneau,
          });
        }
      }
    }
  }

  const BATCH_SIZE = 500;
  let creees = 0;

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const result = await prisma.disponibilite.createMany({ data: batch });
    creees += result.count;
  }

  console.log(`Disponibilités de test — juillet & août ${year}`);
  console.log(`- ${iades.length} IADE actifs`);
  console.log(`- ${supprimees} disponibilité(s) supprimée(s) sur la période`);
  console.log(`- ${creees} disponibilité(s) créée(s)`);
  console.log(
    `- Période : ${formatDateKey(rangeDebut)} → ${formatDateKey(rangeFin)}`,
  );

  for (const iade of iades) {
    const lignes = iade.qualifications
      .filter((q) => q.ligne.actif)
      .map((q) => q.ligne.nom)
      .join(", ");
    console.log(`  • ${iade.prenom} ${iade.nom} (${lignes || "aucune ligne"})`);
  }
}

main()
  .catch((error) => {
    console.error("Erreur :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
