/**
 * Tests unitaires — briques algorithme lissé.
 *
 * Usage : npx tsx scripts/test-algorithme-lisse.ts
 */
import {
  PrismaClient,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import type { PropositionAffectation } from "../src/server/algorithme-affectation";
import { genererPlanningAutomatique } from "../src/server/algorithme-affectation";
import {
  buildPreferenceContinuiteIndex,
  calculerPointsFinaux,
  calculerPointsFinauxSync,
  calculerVariance,
  chargerContexteReoptimisation,
  detecterBlocsContinuite,
  reoptimiserParEchangesSync,
} from "../src/server/algorithme-lisse";
import { chargerBonusContinuiteParLigne } from "../src/server/bonus-continuite";
import {
  calculerPointsCumulesTousIades,
  chargerAstreintesPointsParIade,
} from "../src/server/points";

const prisma = new PrismaClient();

function proposition(
  partial: Partial<PropositionAffectation> & Pick<
    PropositionAffectation,
    "date" | "ligneId" | "ligneNom" | "typeCreneau" | "iadeId" | "pointsAttribues"
  >,
): PropositionAffectation {
  return {
    iadeNom: "Test IADE",
    ...partial,
  };
}

async function testDetecterBlocsContinuite() {
  const greffe = await prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } });
  const marie = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });

  if (!greffe || !marie) {
    throw new Error("Seed introuvable (Greffe / Marie).");
  }

  const samedi = "2026-08-01";
  const dimanche = "2026-08-02";
  const ferie = "2026-08-15";

  const preferenceIndex = buildPreferenceContinuiteIndex([
    {
      iadeId: marie.id,
      ligneId: greffe.id,
      dateDebut: new Date(`${samedi}T00:00:00.000Z`),
      type: TypePreferenceContinuite.WEEKEND_48H,
    },
    {
      iadeId: marie.id,
      ligneId: greffe.id,
      dateDebut: new Date(`${ferie}T00:00:00.000Z`),
      type: TypePreferenceContinuite.JOUR_NUIT,
    },
  ]);

  const propositions: PropositionAffectation[] = [
    proposition({
      date: samedi,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.JOUR_SAMEDI,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: samedi,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_SAMEDI,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: dimanche,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.JOUR_DIMANCHE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: dimanche,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_DIMANCHE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: ferie,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.JOUR_FERIE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: ferie,
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_FERIE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: "2026-08-10",
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: "2026-08-11",
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      iadeId: null,
      iadeNom: null,
      pointsAttribues: 2,
      nonPourvu: true,
    }),
  ];

  const blocs = detecterBlocsContinuite(propositions, preferenceIndex);

  const bloc48h = blocs.find((bloc) => bloc.type === "WEEKEND_48H");
  const bloc24h = blocs.find((bloc) => bloc.type === "JOUR_NUIT");
  const unitaires = blocs.filter((bloc) => !bloc.type);

  if (!bloc48h || bloc48h.creneaux.length !== 4) {
    throw new Error("ÉCHEC detecterBlocsContinuite : bloc WEEKEND_48H attendu (4 créneaux).");
  }

  if (!bloc24h || bloc24h.creneaux.length !== 2) {
    throw new Error("ÉCHEC detecterBlocsContinuite : bloc JOUR_NUIT attendu (2 créneaux).");
  }

  if (unitaires.length !== 1 || unitaires[0].creneaux.length !== 1) {
    throw new Error("ÉCHEC detecterBlocsContinuite : 1 bloc unitaire attendu.");
  }

  const totalCreneaux = blocs.reduce(
    (total, bloc) => total + bloc.creneaux.length,
    0,
  );

  if (totalCreneaux !== 7) {
    throw new Error(`ÉCHEC detecterBlocsContinuite : 7 créneaux comptés, reçu ${totalCreneaux}.`);
  }

  console.log("OK — detecterBlocsContinuite (48h, 24h, unitaire, non-pourvu ignoré).");
}

function testCalculerVariance() {
  const points = new Map<string, number>([
    ["a", 10],
    ["b", 12],
    ["c", 14],
    ["z", 999],
  ]);

  const variance = calculerVariance(points, ["a", "b", "c"]);
  const attendu = 8 / 3;

  if (Math.abs(variance - attendu) > 0.001) {
    throw new Error(`ÉCHEC calculerVariance : attendu ${attendu}, reçu ${variance}.`);
  }

  if (calculerVariance(points, []) !== 0) {
    throw new Error("ÉCHEC calculerVariance : tableau vide doit retourner 0.");
  }

  console.log("OK — calculerVariance (IADE qualifiés uniquement).");
}

async function testCalculerPointsFinaux() {
  const greffe = await prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } });
  const marie = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });
  const thomas = await prisma.utilisateur.findFirst({
    where: { email: "thomas.bernard@test.local" },
  });

  if (!greffe || !marie || !thomas) {
    throw new Error("Seed introuvable.");
  }

  const annee = 2026;
  const pointsDepart = await calculerPointsCumulesTousIades(annee);
  const bonusParLigne = await chargerBonusContinuiteParLigne();
  const astreintesParIade = await chargerAstreintesPointsParIade(annee, [
    ...pointsDepart.keys(),
  ]);

  const propositions: PropositionAffectation[] = [
    proposition({
      date: "2026-08-15",
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.JOUR_FERIE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
    proposition({
      date: "2026-08-15",
      ligneId: greffe.id,
      ligneNom: greffe.nom,
      typeCreneau: TypeCreneau.NUIT_FERIE,
      iadeId: marie.id,
      pointsAttribues: 2,
    }),
  ];

  const sync = calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    astreintesParIade,
    bonusParLigne,
  );

  const asyncResult = await calculerPointsFinaux(propositions, pointsDepart);

  const avantMarie = pointsDepart.get(marie.id) ?? 0;
  const apresMarie = sync.get(marie.id) ?? 0;

  if (apresMarie <= avantMarie) {
    throw new Error("ÉCHEC calculerPointsFinaux : les points de Marie doivent augmenter.");
  }

  if (sync.get(marie.id) !== asyncResult.get(marie.id)) {
    throw new Error("ÉCHEC calculerPointsFinaux : sync et async divergent.");
  }

  const propositionsGlouton = (
    await genererPlanningAutomatique(
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 7)),
    )
  ).propositions;

  const finauxGlouton = await calculerPointsFinaux(propositionsGlouton, pointsDepart);

  if (finauxGlouton.size === 0) {
    throw new Error("ÉCHEC calculerPointsFinaux : résultat vide sur simulation glouton.");
  }

  console.log(
    `OK — calculerPointsFinaux (Marie ${avantMarie} → ${apresMarie}, glouton ${propositionsGlouton.length} propositions).`,
  );
}

function varianceTotaleLignes(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: Awaited<ReturnType<typeof chargerContexteReoptimisation>>,
): number {
  const ligneIds = new Set(propositions.map((p) => p.ligneId));
  const points = calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    contexte.astreintesExistantesParIade,
    contexte.bonusParLigne,
  );

  let total = 0;
  for (const ligneId of ligneIds) {
    const qualifies = contexte.qualificationsParLigne.get(ligneId);
    if (qualifies && qualifies.size > 0) {
      total += calculerVariance(points, qualifies);
    }
  }

  return total;
}

async function testReoptimiserParEchanges() {
  const annee = 2026;
  const dateDebut = new Date(Date.UTC(annee, 7, 1));
  const dateFin = new Date(Date.UTC(annee, 7, 14));

  const glouton = (
    await genererPlanningAutomatique(dateDebut, dateFin)
  ).propositions;
  const pointsDepart = await calculerPointsCumulesTousIades(annee);
  const contexte = await chargerContexteReoptimisation(glouton);

  const varianceAvant = varianceTotaleLignes(glouton, pointsDepart, contexte);
  const resultat = reoptimiserParEchangesSync(glouton, pointsDepart, {
    contexte,
    maxIterations: 50,
  });
  const reoptimise = resultat.propositions;
  const varianceApres = varianceTotaleLignes(reoptimise, pointsDepart, contexte);

  if (varianceApres > varianceAvant + 0.0001) {
    throw new Error(
      `ÉCHEC reoptimiserParEchanges : variance augmentée (${varianceAvant} → ${varianceApres}).`,
    );
  }

  const compteesAvant = glouton.filter((p) => p.iadeId && !p.nonPourvu && !p.dejaPlanifie).length;
  const compteesApres = reoptimise.filter((p) => p.iadeId && !p.nonPourvu && !p.dejaPlanifie).length;

  if (compteesAvant !== compteesApres) {
    throw new Error("ÉCHEC reoptimiserParEchanges : nombre de créneaux affectés modifié.");
  }

  for (const proposition of reoptimise) {
    if (!proposition.iadeId || proposition.nonPourvu || proposition.dejaPlanifie) {
      continue;
    }

    const qualifies = contexte.qualificationsParLigne.get(proposition.ligneId);
    if (!qualifies?.has(proposition.iadeId)) {
      throw new Error("ÉCHEC reoptimiserParEchanges : IADE non qualifié après échange.");
    }
  }

  if (!Array.isArray(resultat.journal.echanges)) {
    throw new Error("ÉCHEC reoptimiserParEchanges : journal.echanges invalide.");
  }

  if (!Array.isArray(resultat.journal.blocsCasses)) {
    throw new Error("ÉCHEC reoptimiserParEchanges : journal.blocsCasses invalide.");
  }

  console.log(
    `OK — reoptimiserParEchanges (variance ${varianceAvant.toFixed(2)} → ${varianceApres.toFixed(2)}, ${compteesApres} créneaux, ${resultat.journal.echanges.length} échange(s), ${resultat.journal.blocsCasses.length} bloc(s) cassé(s)).`,
  );
}

async function testSeuilsEcartAberrant() {
  const { listSeuilsEcartAberrantParLigne } = await import(
    "../src/server/parametre-algorithme"
  );

  const seuils = await listSeuilsEcartAberrantParLigne();

  if (seuils.length === 0) {
    throw new Error("ÉCHEC seuils : aucune ligne active.");
  }

  for (const ligne of seuils) {
    if (ligne.seuilDefaut < 1) {
      throw new Error(`ÉCHEC seuils : défaut invalide pour ${ligne.nom}.`);
    }

    if (ligne.seuilEffectif < ligne.seuilDefaut && ligne.seuilPersonnalise == null) {
      throw new Error(
        `ÉCHEC seuils : effectif < défaut sans personnalisation (${ligne.nom}).`,
      );
    }

    if (ligne.nom === "Greffe" && ligne.seuilDefaut !== 4) {
      throw new Error(
        `ÉCHEC seuils : Greffe devrait avoir défaut 4 (2× poids 2), reçu ${ligne.seuilDefaut}.`,
      );
    }
  }

  console.log(
    `OK — seuils écart aberrant (${seuils.length} lignes, ex. Greffe défaut ${seuils.find((l) => l.nom === "Greffe")?.seuilDefaut}).`,
  );
}

async function main() {
  await testDetecterBlocsContinuite();
  testCalculerVariance();
  await testCalculerPointsFinaux();
  await testSeuilsEcartAberrant();
  await testReoptimiserParEchanges();
  console.log("\nTous les tests algorithme lissé ont réussi.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
