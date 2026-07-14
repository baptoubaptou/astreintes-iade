/**
 * Vérifie le verrou 409 sur POST /api/admin/simulation (mode Par astreinte).
 * Rejoue le corps de la route (après auth) — même enchaînement que route.ts.
 *
 * Usage : npx tsx scripts/test-verrou-simulation-par-astreinte.ts
 */
import {
  PrismaClient,
  StatutLotGeneration,
} from "@prisma/client";
import { getErreurVerrouSimulationParAstreinte } from "../src/server/lot-generation";
import {
  executerSimulationPlanning,
  parsePeriodeInput,
} from "../src/server/simulation-planning";

const prisma = new PrismaClient();

/** Reproduit POST /api/admin/simulation après authentification cadre. */
async function simulerPostSimulation(body: Record<string, unknown>) {
  const periode = parsePeriodeInput(body);
  if ("error" in periode) {
    return { status: 400, payload: { error: periode.error } };
  }

  const ligneId =
    typeof body.ligneId === "string" && body.ligneId.trim()
      ? body.ligneId.trim()
      : undefined;

  const erreurVerrou = await getErreurVerrouSimulationParAstreinte(ligneId);
  if (erreurVerrou) {
    return { status: 409, payload: { error: erreurVerrou } };
  }

  const result = await executerSimulationPlanning(
    periode.dateDebut,
    periode.dateFin,
    ligneId,
  );

  return { status: 200, payload: result };
}

async function main() {
  const [greffe, obstetrique] = await Promise.all([
    prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } }),
    prisma.ligneAstreinte.findFirst({ where: { nom: "Obstétrique" } }),
  ]);

  if (!greffe || !obstetrique) {
    throw new Error("Données seed introuvables (Greffe, Obstétrique).");
  }

  const lotExistant = await prisma.lotGeneration.findFirst({
    where: { statut: StatutLotGeneration.EN_ATTENTE_PUBLICATION },
  });

  let lotIdTest: string | null = lotExistant?.id ?? null;
  let lotCree = false;

  if (!lotExistant) {
    const debut = new Date(Date.UTC(2026, 8, 1));
    const fin = new Date(Date.UTC(2026, 8, 7));
    const lot = await prisma.lotGeneration.create({
      data: {
        ligneId: greffe.id,
        periodeDebut: debut,
        periodeFin: fin,
        statut: StatutLotGeneration.EN_ATTENTE_PUBLICATION,
      },
    });
    lotIdTest = lot.id;
    lotCree = true;
    console.log(`Lot de test créé sur Greffe (${lot.id}).`);
  } else {
    console.log(`Lot EN_ATTENTE existant réutilisé (${lotExistant.id}).`);
  }

  const body = {
    dateDebut: "2026-08-01",
    dateFin: "2026-08-07",
    ligneId: obstetrique.id,
  };

  const { status, payload } = await simulerPostSimulation(body);
  const resultPayload = payload as {
    error?: string;
    propositions?: unknown[];
  };

  if (status !== 409) {
    throw new Error(
      `ÉCHEC POST /api/admin/simulation : statut ${status} au lieu de 409.`,
    );
  }

  const messageAttendu = await getErreurVerrouSimulationParAstreinte(
    obstetrique.id,
  );

  if (resultPayload.error !== messageAttendu) {
    throw new Error(
      `ÉCHEC : message d'erreur inattendu.\nAttendu : ${messageAttendu}\nReçu    : ${resultPayload.error}`,
    );
  }

  if (resultPayload.propositions !== undefined) {
    throw new Error(
      "ÉCHEC : la réponse 409 ne doit pas contenir de propositions (algorithme non exécuté).",
    );
  }

  console.log(`Erreur 409 : "${resultPayload.error}"`);
  console.log(
    "OK — POST /api/admin/simulation renvoie 409 sans résultat de simulation (ligneId ≠ lot en attente).",
  );

  const global = await simulerPostSimulation({
    dateDebut: "2026-08-01",
    dateFin: "2026-08-07",
  });

  if (global.status === 409) {
    throw new Error(
      "ÉCHEC : le mode global (sans ligneId) ne doit pas être bloqué par le verrou lot.",
    );
  }

  console.log(
    "OK — mode global (ligneId omis) : pas de 409 verrou (statut " +
      `${global.status}).`,
  );

  if (lotCree && lotIdTest) {
    await prisma.lotGeneration.delete({ where: { id: lotIdTest } });
    console.log("Lot de test supprimé.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
