/**
 * Vérifie le calcul de période, la configuration et l'anti-doublon d'envoi.
 *
 * Usage : npx tsx scripts/test-envoi-automatique.ts
 */
import { JourSemaine, PrismaClient } from "@prisma/client";
import { formatDateParam } from "../src/lib/calendar";
import {
  calculerPeriodeEnvoi,
  calculerProchainEnvoiEtPeriode,
  estDateDansPeriodeDejaEnvoyee,
} from "../src/lib/envoi-automatique-periode";
import {
  executerEnvoiAutomatiqueSiEcheance,
  getOuCreerConfiguration,
  updateConfigurationEnvoiAutomatique,
  verifierCalculPeriodeEnvoiJeudiStrict,
} from "../src/server/envoi-automatique";

const prisma = new PrismaClient();

async function main() {
  const jeudi = new Date(Date.UTC(2026, 6, 16));
  const { debut, fin } = calculerPeriodeEnvoi(jeudi);

  if (
    formatDateParam(debut) !== "2026-07-20" ||
    formatDateParam(fin) !== "2026-07-26"
  ) {
    throw new Error("ÉCHEC : calculerPeriodeEnvoi (jeudi → lundi suivant + 6 jours).");
  }

  const lundi = new Date(Date.UTC(2026, 6, 20));
  const apresLundi = calculerPeriodeEnvoi(lundi);
  if (formatDateParam(apresLundi.debut) !== "2026-07-27") {
    throw new Error("ÉCHEC : un envoi le lundi doit cibler le lundi suivant (+7 jours).");
  }

  if (!verifierCalculPeriodeEnvoiJeudiStrict()) {
    throw new Error("ÉCHEC : vérification jeudi strict.");
  }

  console.log("OK — calculerPeriodeEnvoi (lundi strictement après la date d'envoi).");

  const dernierEnvoi = new Date(Date.UTC(2026, 6, 16));
  if (
    !estDateDansPeriodeDejaEnvoyee(
      new Date(Date.UTC(2026, 6, 22)),
      dernierEnvoi,
      JourSemaine.JEUDI,
    )
  ) {
    throw new Error("ÉCHEC : le 22/07 devrait être dans la période du dernier envoi.");
  }

  if (
    !estDateDansPeriodeDejaEnvoyee(
      new Date(Date.UTC(2026, 6, 15)),
      dernierEnvoi,
      JourSemaine.JEUDI,
    )
  ) {
    throw new Error("ÉCHEC : le 15/07 devrait être dans la période de l'envoi précédent.");
  }

  if (
    estDateDansPeriodeDejaEnvoyee(
      new Date(Date.UTC(2026, 6, 27)),
      dernierEnvoi,
      JourSemaine.JEUDI,
    )
  ) {
    throw new Error("ÉCHEC : le 27/07 ne devrait pas être couvert par les deux derniers envois.");
  }

  console.log("OK — détection période déjà envoyée (semaine en cours + suivante).");

  const jeudiRef = new Date(Date.UTC(2026, 6, 16));
  const apercu = calculerProchainEnvoiEtPeriode(JourSemaine.JEUDI, jeudiRef);
  console.log(
    `Aperçu : envoi ${formatDateParam(apercu.dateEnvoi)}, période ${formatDateParam(apercu.periodeDebut)} → ${formatDateParam(apercu.periodeFin)}`,
  );

  await prisma.configurationEnvoiAutomatique.deleteMany();

  const config1 = await getOuCreerConfiguration();
  const config2 = await getOuCreerConfiguration();

  if (config1.id !== config2.id) {
    throw new Error("ÉCHEC : getOuCreerConfiguration a créé plusieurs lignes.");
  }

  console.log("OK — getOuCreerConfiguration (singleton + défauts).");

  await updateConfigurationEnvoiAutomatique({
    emailDestinataire: "secretariat@test.local",
    jourEnvoi: JourSemaine.JEUDI,
    actif: true,
  });

  const mardi = new Date(Date.UTC(2026, 6, 14, 8, 0, 0));
  const ignoreJour = await executerEnvoiAutomatiqueSiEcheance(mardi);
  if (ignoreJour.statut !== "ignore") {
    throw new Error("ÉCHEC : l'envoi ne devrait pas partir un mardi.");
  }

  const jeudiMatin = new Date(Date.UTC(2026, 6, 16, 8, 0, 0));
  await prisma.configurationEnvoiAutomatique.updateMany({
    data: { dateDernierEnvoi: jeudiMatin },
  });

  const ignoreDoublon = await executerEnvoiAutomatiqueSiEcheance(jeudiMatin);
  if (
    ignoreDoublon.statut !== "ignore" ||
    ignoreDoublon.raison !== "Un envoi a déjà été effectué aujourd'hui."
  ) {
    throw new Error("ÉCHEC : anti-doublon journalier.");
  }

  console.log("OK — garde-fous jour d'envoi et anti-doublon.");

  await prisma.configurationEnvoiAutomatique.deleteMany();
  console.log("\nTous les tests envoi automatique ont réussi.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
