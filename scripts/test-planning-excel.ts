/**
 * Vérifie la génération Excel du planning.
 * Usage : npx tsx scripts/test-planning-excel.ts
 */
import { genererPlanningExcel } from "../src/server/planning-excel";

async function main() {
  const now = new Date();
  const mois = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const { buffer, filename } = await genererPlanningExcel({ mois });

  if (buffer.length < 1000) {
    throw new Error(`Fichier trop petit (${buffer.length} octets).`);
  }

  const signature = buffer.subarray(0, 2).toString("hex");
  if (signature !== "504b") {
    throw new Error("Le fichier généré n'est pas un XLSX valide (ZIP).");
  }

  console.log(`OK : ${filename} (${buffer.length} octets), signature ZIP/XLSX valide.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
