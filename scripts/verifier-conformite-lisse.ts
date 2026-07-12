/**
 * Vérification de conformité du mode lissé (lecture + mesures, sans correction produit).
 * Usage : npx tsx scripts/verifier-conformite-lisse.ts
 */
import {
  ModeAttribution,
  Role,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "../src/lib/db";
import { genererPlanningAutomatique } from "../src/server/algorithme-affectation";
import {
  calculerVariance,
  calculerPointsFinaux,
  calculerPointsFinauxSync,
  chargerContexteReoptimisation,
  detecterBlocsContinuite,
  EPSILON_VARIANCE_PASSE2,
  reoptimiserParEchangesSync,
  type Bloc,
} from "../src/server/algorithme-lisse";
import {
  calculerPointsCumulesTousIades,
  projecterPointsApresPropositions,
} from "../src/server/points";
import { CLE_MODE_ATTRIBUTION } from "../src/server/parametre-algorithme";
import {
  creerScenarioPasse2AccepteSynth,
  evaluerSelectionPasse2Scenario,
} from "./scenario-passe2-variance-synth";

type Verdict = "CONFORME" | "NON CONFORME" | "AMBIGU";

function slotKey(date: string, ligneId: string, type: TypeCreneau): string {
  return `${date}:${ligneId}:${type}`;
}

function varianceTotale(
  propositions: Awaited<ReturnType<typeof genererPlanningAutomatique>>["propositions"],
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

function calculerEcartLigne(
  points: Map<string, number>,
  qualifies: Set<string>,
): number {
  const values = [...qualifies].map((id) => points.get(id) ?? 0);
  return Math.max(...values) - Math.min(...values);
}

function cleBloc(bloc: Bloc): string {
  const slots = bloc.creneaux
    .map((c) => slotKey(c.date, c.ligneId, c.typeCreneau))
    .sort()
    .join("|");
  return `${bloc.ligneId}:${bloc.type ?? "UNIT"}:${slots}`;
}

async function setMode(mode: ModeAttribution): Promise<void> {
  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_MODE_ATTRIBUTION },
    create: { cle: CLE_MODE_ATTRIBUTION, valeur: mode },
    update: { valeur: mode },
  });
}

async function preparerScenarioDesequilibre(): Promise<{
  dateDebut: Date;
  dateFin: Date;
  nettoyage: () => Promise<void>;
}> {
  const annee = 2026;
  const dateDebut = new Date(Date.UTC(annee, 7, 1));
  const dateFin = new Date(Date.UTC(annee, 7, 14));

  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    select: { id: true },
  });
  const iades = await prisma.utilisateur.findMany({
    where: { role: Role.IADE, actif: true },
    select: { id: true },
  });
  const qualifications = await prisma.qualification.findMany({
    select: { iadeId: true, ligneId: true },
  });
  const qualSet = new Set(
    qualifications.map((q) => `${q.iadeId}:${q.ligneId}`),
  );

  const existing = await prisma.disponibilite.findMany({
    where: {
      date: { gte: dateDebut, lte: dateFin },
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
    },
    select: { iadeId: true, ligneId: true, date: true, typeCreneau: true },
  });
  const existingKeys = new Set(
    existing.map(
      (d) =>
        `${d.iadeId}:${d.ligneId}:${d.date.toISOString().slice(0, 10)}:${d.typeCreneau}`,
    ),
  );

  const dispos: Array<{
    iadeId: string;
    ligneId: string;
    date: Date;
    typeCreneau: TypeCreneau;
  }> = [];

  const cursor = new Date(dateDebut);
  while (cursor <= dateFin) {
    const dateKey = cursor.toISOString().slice(0, 10);
    for (const ligne of lignes) {
      for (const iade of iades) {
        if (!qualSet.has(`${iade.id}:${ligne.id}`)) {
          continue;
        }
        const key = `${iade.id}:${ligne.id}:${dateKey}:${TypeCreneau.NUIT_SEMAINE}`;
        if (existingKeys.has(key)) {
          continue;
        }
        dispos.push({
          iadeId: iade.id,
          ligneId: ligne.id,
          date: new Date(cursor),
          typeCreneau: TypeCreneau.NUIT_SEMAINE,
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const insertedIds: string[] = [];
  if (dispos.length > 0) {
    await prisma.disponibilite.createMany({ data: dispos });
  }

  return {
    dateDebut,
    dateFin,
    nettoyage: async () => {
      if (dispos.length > 0) {
        await prisma.disponibilite.deleteMany({
          where: {
            OR: dispos.map((d) => ({
              iadeId: d.iadeId,
              ligneId: d.ligneId,
              date: d.date,
              typeCreneau: d.typeCreneau,
            })),
          },
        });
      }
      void insertedIds;
    },
  };
}

function verifierContraintesApresEchanges(
  propositions: Awaited<ReturnType<typeof genererPlanningAutomatique>>["propositions"],
  contexte: Awaited<ReturnType<typeof chargerContexteReoptimisation>>,
): string | null {
  const affectationsParIadeJour = new Map<string, number>();

  for (const proposition of propositions) {
    if (
      !proposition.iadeId ||
      proposition.nonPourvu ||
      proposition.dejaPlanifie
    ) {
      continue;
    }

    const qualifies = contexte.qualificationsParLigne.get(proposition.ligneId);
    if (!qualifies?.has(proposition.iadeId)) {
      return `IADE ${proposition.iadeId} non qualifié sur ${proposition.ligneId}`;
    }

    const dispos = contexte.disponibilitesParIade.get(proposition.iadeId);
    const slot = `${proposition.date}:${proposition.ligneId}:${proposition.typeCreneau}`;
    if (!dispos?.has(slot)) {
      return `IADE ${proposition.iadeId} indisponible sur ${slot}`;
    }

    const jourKey = `${proposition.iadeId}:${proposition.date}`;
    const count = (affectationsParIadeJour.get(jourKey) ?? 0) + 1;
    affectationsParIadeJour.set(jourKey, count);
    if (count > 1) {
      return `Double affectation ${jourKey}`;
    }
  }

  return null;
}

type VerdictPasse2Variance = {
  verdict: Verdict;
  detail: string;
};

function verifierPasse2DoubleConditionVariance(): VerdictPasse2Variance {
  const accepte = creerScenarioPasse2AccepteSynth();

  if (accepte.ecartAvantPasse2 <= accepte.seuil) {
    return {
      verdict: "NON CONFORME",
      detail: `Scénario accepte : écart ${accepte.ecartAvantPasse2} ≤ seuil`,
    };
  }

  if (accepte.candidats.length === 0) {
    return {
      verdict: "NON CONFORME",
      detail: "Scénario accepte : aucun candidat réduisant l'écart",
    };
  }

  if (!accepte.meilleurVarianceValide) {
    return {
      verdict: "NON CONFORME",
      detail: "Scénario accepte : aucun candidat valide (écart + variance)",
    };
  }

  const selectionNormale = evaluerSelectionPasse2Scenario(
    accepte,
    accepte.variancePasse1,
  );

  if (!selectionNormale?.echange) {
    return {
      verdict: "NON CONFORME",
      detail:
        "Sélection Passe 2 (variance réf. Passe 1) : aucun échange retenu",
    };
  }

  if (selectionNormale.ecartApres >= selectionNormale.ecartActuel) {
    return {
      verdict: "NON CONFORME",
      detail: "Sélection Passe 2 : l'échange retenu ne réduit pas l'écart",
    };
  }

  if (
    selectionNormale.varianceApres >
    accepte.variancePasse1 + EPSILON_VARIANCE_PASSE2
  ) {
    return {
      verdict: "NON CONFORME",
      detail: "Sélection Passe 2 : variance dégradée malgré la double condition",
    };
  }

  if (
    selectionNormale.varianceApres >
    accepte.meilleurVarianceValide.varianceApres + EPSILON_VARIANCE_PASSE2
  ) {
    return {
      verdict: "NON CONFORME",
      detail:
        "Sélection Passe 2 : variance supérieure au meilleur candidat valide (min variance)",
    };
  }

  const meilleurEcart = accepte.meilleurEcartCandidat!;

  // Référence artificiellement stricte (sous la variance des candidats écart↓) :
  // le meilleur en réduction d'écart est exclu → aucun échange retenu.
  const varianceReferenceStricte =
    accepte.meilleurVarianceValide.varianceApres - 0.01;

  if (
    meilleurEcart.varianceApres <=
    varianceReferenceStricte + EPSILON_VARIANCE_PASSE2
  ) {
    return {
      verdict: "NON CONFORME",
      detail:
        "Scénario accepte : le meilleur candidat écart↓ passe encore la barrière variance stricte",
    };
  }

  const selectionStricte = evaluerSelectionPasse2Scenario(
    accepte,
    varianceReferenceStricte,
  );

  if (selectionStricte?.echange) {
    return {
      verdict: "NON CONFORME",
      detail:
        "Rejet variance : un échange a été retenu alors que la référence stricte devrait tout rejeter",
    };
  }

  const resultatAccepte = reoptimiserParEchangesSync(
    accepte.propositions,
    accepte.pointsDepart,
    { contexte: accepte.contexte, maxIterations: 0 },
  );

  const echangesP2Accepte = resultatAccepte.journal.echanges.filter(
    (e) => e.passe === 2,
  );
  const varianceApresAccepte = varianceTotale(
    resultatAccepte.propositions,
    accepte.pointsDepart,
    accepte.contexte,
  );

  if (echangesP2Accepte.length === 0) {
    return {
      verdict: "NON CONFORME",
      detail: "Intégration accepte : aucun échange Passe 2 appliqué",
    };
  }

  if (
    varianceApresAccepte >
    accepte.variancePasse1 + EPSILON_VARIANCE_PASSE2
  ) {
    return {
      verdict: "NON CONFORME",
      detail: `Intégration accepte : variance dégradée (${varianceApresAccepte} > ${accepte.variancePasse1})`,
    };
  }

  const detailRejet = `rejet (meilleur écart↓ variance↑ exclu si réf. < ${varianceReferenceStricte.toFixed(4)}, 0 échange)`;
  const detailAccepte = `accepte (${echangesP2Accepte.length} échange P2, variance ${accepte.variancePasse1.toFixed(2)} → ${varianceApresAccepte.toFixed(2)}, min-variance respectée)`;

  return {
    verdict: "CONFORME",
    detail: `${detailRejet} ; ${detailAccepte}`,
  };
}

async function main() {
  const modeInitial = await prisma.parametreAlgorithme.findUnique({
    where: { cle: CLE_MODE_ATTRIBUTION },
    select: { valeur: true },
  });

  const scenario = await preparerScenarioDesequilibre();
  const { dateDebut, dateFin } = scenario;

  try {
    const pointsDepart = await calculerPointsCumulesTousIades(
      dateDebut.getUTCFullYear(),
    );

    await setMode(ModeAttribution.GLOUTON);
    const gloutonResult = await genererPlanningAutomatique(dateDebut, dateFin);
    const propositionsGlouton = gloutonResult.propositions;

    const contexte = await chargerContexteReoptimisation(propositionsGlouton);
    const reoptMemeBase = reoptimiserParEchangesSync(
      propositionsGlouton,
      pointsDepart,
      { contexte, maxIterations: 300 },
    );
    const propositionsLisse = reoptMemeBase.propositions;

    const varianceGlouton = varianceTotale(
      propositionsGlouton,
      pointsDepart,
      contexte,
    );
    const varianceLisse = varianceTotale(
      propositionsLisse,
      pointsDepart,
      contexte,
    );

    const creneauxComptes = propositionsGlouton.filter(
      (p) => p.iadeId && !p.nonPourvu && !p.dejaPlanifie,
    ).length;

    console.log("=== Contexte mesuré ===");
    console.log(
      `Période : ${dateDebut.toISOString().slice(0, 10)} → ${dateFin.toISOString().slice(0, 10)}`,
    );
    console.log(`Créneaux affectés simulés : ${creneauxComptes}`);
    console.log(`IADE actifs : ${contexte.iadesParId.size}`);
    console.log(
      `Variance glouton : ${varianceGlouton.toFixed(4)} | Variance lissé : ${varianceLisse.toFixed(4)}`,
    );
    console.log(
      `Échanges journal (même base glouton) : ${reoptMemeBase.journal.echanges.length} échange(s)`,
    );

    const reopt = reoptMemeBase;
    const journal = reopt.journal;

    console.log(
      `Journal : ${journal.echanges.length} échange(s), ${journal.blocsCasses.length} bloc(s) cassé(s)`,
    );

    // --- Point 1 ---
    const point1 =
      varianceLisse <= varianceGlouton + 0.0001 ? "CONFORME" : "NON CONFORME";

    // --- Point 2 ---
    const blocsInitiaux = detecterBlocsContinuite(
      propositionsGlouton,
      contexte.preferenceIndex,
    );
    const blocsParCle = new Map(
      blocsInitiaux.map((b) => [cleBloc(b), b]),
    );

    let point2: Verdict = "CONFORME";
    let point2Detail = "";

    const echangesPasse1 = journal.echanges.filter((e) => e.passe === 1);
    const echangesPasse2 = journal.echanges.filter((e) => e.passe === 2);

    for (const echange of echangesPasse1) {
      const slotsA = echange.creneauxA
        .map((c) => slotKey(c.date, echange.ligneId, c.typeCreneau))
        .sort()
        .join("|");
      const blocA: Bloc = {
        creneaux: [],
        iadeId: echange.iadeAId,
        ligneId: echange.ligneId,
        type:
          echange.creneauxA.length === 2
            ? TypePreferenceContinuite.JOUR_NUIT
            : echange.creneauxA.length === 4
              ? TypePreferenceContinuite.WEEKEND_48H
              : undefined,
      };
      const keyA = cleBloc({
        ...blocA,
        creneaux: echange.creneauxA.map((c) => ({
          date: c.date,
          ligneId: echange.ligneId,
          ligneNom: echange.ligneNom,
          typeCreneau: c.typeCreneau,
          iadeId: echange.iadeAId,
          iadeNom: echange.iadeANom,
          pointsAttribues: 0,
        })),
      });

      const matchInitial = [...blocsParCle.keys()].some((k) => {
        const bloc = blocsParCle.get(k)!;
        const slots = bloc.creneaux
          .map((c) => slotKey(c.date, c.ligneId, c.typeCreneau))
          .sort()
          .join("|");
        return slots === slotsA || slotsA.includes(slots);
      });

      if (!matchInitial && echange.creneauxA.length > 1) {
        point2 = "NON CONFORME";
        point2Detail = `Passe 1 : échange multi-créneaux non aligné sur bloc initial (${slotsA})`;
        break;
      }
    }

    if (journal.blocsCasses.some((b) => echangesPasse1.length > 0)) {
      point2 = "NON CONFORME";
      point2Detail = "blocsCasses présents alors que seule la Passe 2 devrait en créer";
    }

    if (journal.blocsCasses.length > 0 && echangesPasse2.length === 0) {
      point2 = "NON CONFORME";
      point2Detail = "blocs cassés sans échange Passe 2";
    }

    if (journal.blocsCasses.length === 0 && echangesPasse2.length === 0) {
      point2Detail =
        "Aucune Passe 2 déclenchée sur ce jeu de données (écart ≤ seuil ou pas d'amélioration) — règle Passe 1 non cassure vérifiée par code + absence de blocsCasses";
    } else if (point2 === "CONFORME" && journal.blocsCasses.length > 0) {
      point2Detail = `${journal.blocsCasses.length} bloc(s) cassé(s) via Passe 2 uniquement`;
    }

    // --- Point 3 ---
    const reoptCourt = reoptimiserParEchangesSync(
      propositionsGlouton,
      pointsDepart,
      { contexte, maxIterations: 5 },
    );
    const echangesMax5 = reoptCourt.journal.echanges.filter((e) => e.passe === 1);
    const point3 =
      echangesMax5.length <= 5 ? "CONFORME" : "NON CONFORME";

    // --- Point 4 ---
    const erreurContraintes = verifierContraintesApresEchanges(
      propositionsLisse,
      contexte,
    );
    const point4 = erreurContraintes ? "NON CONFORME" : "CONFORME";

    // --- Point 5 ---
    const annee = dateDebut.getUTCFullYear();
    const finauxAsync = await calculerPointsFinaux(
      propositionsLisse,
      pointsDepart,
    );
    const finauxSync = calculerPointsFinauxSync(
      propositionsLisse,
      pointsDepart,
      contexte.astreintesExistantesParIade,
      contexte.bonusParLigne,
    );
    const projete = await projecterPointsApresPropositions(
      annee,
      propositionsLisse.map((p) => ({
        date: p.date,
        ligneId: p.ligneId,
        typeCreneau: p.typeCreneau,
        iadeId: p.iadeId,
        pointsAttribues: p.pointsAttribues,
        nonPourvu: p.nonPourvu,
        dejaPlanifie: p.dejaPlanifie,
      })),
    );

    let point5: Verdict = "CONFORME";
    let point5Detail = "";
    for (const row of projete) {
      const algo = finauxSync.get(row.iadeId);
      const algoAsync = finauxAsync.get(row.iadeId);
      if (algo !== row.pointsApres) {
        point5 = "NON CONFORME";
        point5Detail = `${row.prenom} ${row.nom} : algo sync ${algo} ≠ page /points ${row.pointsApres}`;
        break;
      }
      if (algoAsync !== row.pointsApres) {
        point5 = "NON CONFORME";
        point5Detail = `${row.prenom} ${row.nom} : algo async ${algoAsync} ≠ page /points ${row.pointsApres}`;
        break;
      }
    }

    if (point5 === "CONFORME") {
      point5Detail = `${projete.length} IADE comparés — calculerTotalPointsDepuisAstreintes + bonus identiques`;
    }

    // --- Point 6 ---
    const t0 = performance.now();
    await genererPlanningAutomatique(dateDebut, dateFin);
    const t1 = performance.now();
    const dureeMs = Math.round(t1 - t0);

    const point6 = dureeMs < 30_000 ? "CONFORME" : "NON CONFORME";

    const point7 = verifierPasse2DoubleConditionVariance();

    console.log("\n=== Résultats de vérification ===\n");

    console.log(
      `1. Variance lissé ≤ glouton : ${point1}` +
        (varianceLisse < varianceGlouton - 0.0001
          ? ` (amélioration ${(varianceGlouton - varianceLisse).toFixed(4)})`
          : varianceLisse === varianceGlouton
            ? " (égalité — pas d'échange améliorant trouvé)"
            : ""),
    );

    console.log(`2. Cassure continuité Passe 2 seulement : ${point2}`);
    if (point2Detail) {
      console.log(`   → ${point2Detail}`);
    }

    console.log(
      `3. Plafond d'itérations / terminaison : ${point3} (Passe 1 ≤ 5 itérations avec maxIterations=5, boucles bornées par code)`,
    );

    console.log(
      `4. Contraintes qualification/dispo/double affectation : ${point4}` +
        (erreurContraintes ? ` — ${erreurContraintes}` : ""),
    );

    console.log(`5. Cohérence bonus avec /points : ${point5}`);
    if (point5Detail) {
      console.log(`   → ${point5Detail}`);
    }

    console.log(
      `6. Temps d'exécution représentatif : ${point6} — ${dureeMs} ms (${creneauxComptes} créneaux, ${contexte.iadesParId.size} IADE)`,
    );

    console.log(
      `7. Passe 2 double condition (écart + variance) : ${point7.verdict}`,
    );
    console.log(`   → ${point7.detail}`);

    // Détail Passe 2 si déclenchée
    if (journal.blocsCasses.length > 0) {
      const qualifies = contexte.qualificationsParLigne.get(
        journal.blocsCasses[0]!.ligneId,
      );
      if (qualifies) {
        const pointsAvantP2 = calculerPointsFinauxSync(
          reopt.propositions,
          pointsDepart,
          contexte.astreintesExistantesParIade,
          contexte.bonusParLigne,
        );
        const ecart = calculerEcartLigne(pointsAvantP2, qualifies);
        const seuil =
          contexte.seuilsEcartAberrantParLigne.get(
            journal.blocsCasses[0]!.ligneId,
          ) ?? 0;
        console.log(
          `\n   Passe 2 détail : écart ligne ${ecart}, seuil ${seuil} (cassure autorisée si écart > seuil avant Passe 2)`,
        );
      }
    }
  } finally {
    await scenario.nettoyage();
    if (modeInitial?.valeur) {
      await setMode(modeInitial.valeur as ModeAttribution);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
