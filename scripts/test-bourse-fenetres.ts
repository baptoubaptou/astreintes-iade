/**
 * Vérifie la grille de délais CDC §3.5 pour la bourse aux astreintes.
 *
 * Usage : npx tsx scripts/test-bourse-fenetres.ts
 */
import {
  calculerFenetreBourse,
  MESSAGE_BOURSE_FERMEE,
  normalizeUtcDay,
} from "../src/server/bourse-fenetres";

const MS_HEURE = 60 * 60 * 1000;
const MS_JOUR = 24 * MS_HEURE;

type CasTest = {
  label: string;
  offsetJours: number;
  attenduHeures: number | null;
  attenduPalier: string;
};

const maintenant = new Date(Date.UTC(2026, 6, 12, 0, 0, 0));

const cas: CasTest[] = [
  { label: "J+10", offsetJours: 10, attenduHeures: 72, attenduPalier: ">7j" },
  { label: "J+5", offsetJours: 5, attenduHeures: 48, attenduPalier: "3-7j" },
  {
    label: "J+2.5",
    offsetJours: 2.5,
    attenduHeures: 24,
    attenduPalier: "2-3j",
  },
  {
    label: "J+1.5",
    offsetJours: 1.5,
    attenduHeures: 12,
    attenduPalier: "1-2j",
  },
  {
    label: "J+0.5",
    offsetJours: 0.5,
    attenduHeures: null,
    attenduPalier: "fermee",
  },
];

function dateAstreinteDepuisOffset(offsetJours: number): Date {
  return new Date(maintenant.getTime() + offsetJours * MS_JOUR);
}

console.log("=== Test grille bourse aux astreintes ===");
console.log(`Référence : ${maintenant.toISOString()}\n`);

let echecs = 0;

for (const test of cas) {
  const dateAstreinte = dateAstreinteDepuisOffset(test.offsetJours);
  const result = calculerFenetreBourse(maintenant, dateAstreinte);

  const heuresObtenues = result.ouverte ? result.dureeHeures : null;
  const palierObtenu = result.palier;
  const boutonActif = result.ouverte;

  const okHeures = heuresObtenues === test.attenduHeures;
  const okPalier = palierObtenu === test.attenduPalier;
  const okBouton =
    test.attenduHeures === null ? !boutonActif : boutonActif;
  const okMessage =
    test.attenduHeures === null
      ? !result.ouverte && result.message === MESSAGE_BOURSE_FERMEE
      : true;

  const ok = okHeures && okPalier && okBouton && okMessage;

  if (!ok) {
    echecs += 1;
  }

  console.log(`${test.label}`);
  console.log(`  Date astreinte : ${normalizeUtcDay(dateAstreinte).toISOString().slice(0, 10)}`);
  console.log(
    `  Fenêtre attendue : ${test.attenduHeures ?? "fermée"} (${test.attenduPalier})`,
  );
  console.log(
    `  Fenêtre obtenue  : ${heuresObtenues ?? "fermée"} (${palierObtenu})`,
  );
  console.log(
    `  Bouton actif     : ${boutonActif ? "oui" : "non"} — attendu : ${test.attenduHeures === null ? "non" : "oui"}`,
  );
  if (!result.ouverte) {
    console.log(`  Message          : ${result.message}`);
  }
  console.log(`  → ${ok ? "OK" : "ÉCHEC"}\n`);
}

if (echecs > 0) {
  console.error(`${echecs} cas en échec.`);
  process.exit(1);
}

console.log("Tous les paliers sont conformes.");
