/**
 * Vérifie la génération PDF des points cumulés (getPointsOverview).
 * Usage : npx tsx scripts/test-points-pdf.ts
 */
import { genererPointsPdf } from "../src/server/points-pdf";

async function main() {
  const annee = new Date().getUTCFullYear();
  const { buffer, filename } = await genererPointsPdf(annee);

  if (buffer.length < 500) {
    throw new Error(`PDF trop petit (${buffer.length} octets).`);
  }

  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new Error("Le fichier généré n'est pas un PDF valide.");
  }

  console.log(`OK : ${filename} (${buffer.length} octets), en-tête PDF valide.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
