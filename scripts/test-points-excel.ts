/**
 * Vérifie la génération Excel des points cumulés (getPointsOverview).
 * Usage : npx tsx scripts/test-points-excel.ts
 */
import { genererPointsExcel } from "../src/server/points-excel";

async function main() {
  const annee = new Date().getUTCFullYear();
  const { buffer, filename } = await genererPointsExcel(annee);

  if (buffer.length < 200) {
    throw new Error(`Fichier Excel trop petit (${buffer.length} octets).`);
  }

  const header = buffer.subarray(0, 2).toString("hex");
  if (header !== "504b") {
    throw new Error("Le fichier généré n'est pas un XLSX valide (ZIP).");
  }

  console.log(`OK : ${filename} (${buffer.length} octets), en-tête XLSX valide.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
