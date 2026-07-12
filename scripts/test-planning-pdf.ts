/**
 * Vérifie la génération PDF du planning (astreintes publiées uniquement).
 * Usage : npx tsx scripts/test-planning-pdf.ts
 */
import { genererPlanningPdf } from "../src/server/planning-pdf";

async function main() {
  const now = new Date();
  const mois = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const { buffer, filename } = await genererPlanningPdf({ mois });

  if (buffer.length < 500) {
    throw new Error(`PDF trop petit (${buffer.length} octets).`);
  }

  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new Error("Le fichier généré n'est pas un PDF valide.");
  }

  console.log(`OK : ${filename} (${buffer.length} octets), en-tête PDF valide.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
