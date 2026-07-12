/**
 * Script de test manuel pour genererPlanningAutomatique.
 *
 * Usage : npm run test:algo
 *         npm run test:algo -- 2026-08-01 2026-08-07
 *
 * Par défaut : 1er–5 juillet de l'année courante (créneaux sans astreintes seedées
 * sur les jours 1–2, disponibilités déclarées pour le mois courant dans le seed).
 */
import { PrismaClient } from "@prisma/client";
import {
  genererPlanningAutomatique,
  resumerPropositions,
} from "../src/server/algorithme-affectation";

const prisma = new PrismaClient();

function parseArgDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Date invalide : ${value} (attendu AAAA-MM-JJ)`);
  }

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

async function main() {
  const now = new Date();
  const defaultDebut = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const defaultFin = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5),
  );

  const dateDebut = process.argv[2] ? parseArgDate(process.argv[2]) : defaultDebut;
  const dateFin = process.argv[3] ? parseArgDate(process.argv[3]) : defaultFin;

  console.log("=== Test algorithme d'affectation ===");
  console.log(
    `Période : ${dateDebut.toISOString().slice(0, 10)} → ${dateFin.toISOString().slice(0, 10)}`,
  );
  console.log("(Lecture seule — aucune écriture en base)\n");

  const resultat = await genererPlanningAutomatique(dateDebut, dateFin);
  const propositions = resultat.propositions;
  const resume = resumerPropositions(propositions);

  console.log("Résumé :", resume);
  console.log("\nPropositions :");

  for (const proposition of propositions) {
    const flags = [
      proposition.nonPourvu ? "NON POURVU" : null,
      proposition.dejaPlanifie ? "DEJA PLANIFIE" : null,
      proposition.tirageAuSort ? "tirage au sort" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const iade = proposition.iadeNom ?? "—";
    const suffix = flags ? ` (${flags})` : "";

    console.log(
      `  ${proposition.date} | ${proposition.ligneNom.padEnd(12)} | ${proposition.typeCreneau.padEnd(12)} | ${iade.padEnd(20)} | ${proposition.pointsAttribues} pt${suffix}`,
    );
  }

  if (resume.nonPourvues > 0) {
    console.log(
      "\nNote : les créneaux non pourvus indiquent l'absence d'IADE qualifié ET disponible.",
    );
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
