/**
 * Scénarios synthétiques pour tester la double condition Passe 2
 * (écart + variance). Utilisé par verifier-conformite-lisse.ts.
 */
import {
  TypeBonusContinuite,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import type { PropositionAffectation } from "../src/server/algorithme-affectation";
import {
  buildPreferenceContinuiteIndex,
  calculerPointsFinauxSync,
  calculerVariance,
  detecterBlocsContinuite,
  EPSILON_VARIANCE_PASSE2,
  evaluerMeilleurEchangePasse2PourConformite,
  type Bloc,
  type ContexteReoptimisation,
} from "../src/server/algorithme-lisse";
import type { AstreintePointsRow } from "../src/server/points";

const LIGNE_ID = "ligne-synth";
const LIGNE_NOM = "Ligne synthétique";
const IADE_HAUT = "iade-haut";
const IADE_MILIEU = "iade-milieu";
const IADE_BAS = "iade-bas";

export type CandidatPasse2Synth = {
  label: string;
  ecartApres: number;
  varianceApres: number;
  decomposeContinuite: boolean;
  degradeVariance: boolean;
};

export type ScenarioPasse2Synth = {
  nom: string;
  propositions: PropositionAffectation[];
  contexte: ContexteReoptimisation;
  pointsDepart: Map<string, number>;
  variancePasse1: number;
  ecartAvantPasse2: number;
  seuil: number;
  candidats: CandidatPasse2Synth[];
  meilleurEcartCandidat: CandidatPasse2Synth | null;
  meilleurVarianceValide: CandidatPasse2Synth | null;
};

function proposition(
  date: string,
  typeCreneau: TypeCreneau,
  iadeId: string,
  iadeNom: string,
  points = 1,
): PropositionAffectation {
  return {
    date,
    ligneId: LIGNE_ID,
    ligneNom: LIGNE_NOM,
    typeCreneau,
    iadeId,
    iadeNom,
    pointsAttribues: points,
  };
}

function slotKey(date: string, typeCreneau: TypeCreneau): string {
  return `${date}:${LIGNE_ID}:${typeCreneau}`;
}

function row(
  iadeId: string,
  date: string,
  type: TypeCreneau,
  points: number,
): AstreintePointsRow {
  return {
    iadeId,
    ligneId: LIGNE_ID,
    date: new Date(`${date}T00:00:00.000Z`),
    typeCreneau: type,
    pointsAttribues: points,
  };
}

function buildDispos(
  propositions: PropositionAffectation[],
  iadeIds: string[],
): Map<string, Set<string>> {
  const allSlots = new Set(
    propositions.map((p) => slotKey(p.date, p.typeCreneau)),
  );

  const map = new Map<string, Set<string>>();
  for (const iadeId of iadeIds) {
    map.set(iadeId, new Set(allSlots));
  }

  return map;
}

function calculerEcartLigne(
  points: Map<string, number>,
  qualifies: Set<string>,
): number {
  const values = [...qualifies].map((id) => points.get(id) ?? 0);
  return Math.max(...values) - Math.min(...values);
}

function varianceLigne(
  propositions: PropositionAffectation[],
  pointsDepart: Map<string, number>,
  contexte: ContexteReoptimisation,
): number {
  const points = calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    contexte.astreintesExistantesParIade,
    contexte.bonusParLigne,
  );
  const qualifies = contexte.qualificationsParLigne.get(LIGNE_ID)!;
  return calculerVariance(points, qualifies);
}

function getIadeIdBloc(bloc: Bloc): string {
  return bloc.creneaux[0]!.iadeId!;
}

function simulerEchange(
  propositions: PropositionAffectation[],
  blocA: Bloc,
  blocB: Bloc,
): PropositionAffectation[] | null {
  const copie = propositions.map((p) => ({ ...p }));
  const iadeA = getIadeIdBloc(blocA);
  const iadeB = getIadeIdBloc(blocB);

  const affectations = new Map<string, number>();

  for (const p of copie) {
    if (!p.iadeId || p.nonPourvu || p.dejaPlanifie) {
      continue;
    }
    const key = `${p.iadeId}:${p.date}`;
    affectations.set(key, (affectations.get(key) ?? 0) + 1);
  }

  function appliquer(bloc: Bloc, nouvelIade: string): boolean {
    for (const creneau of bloc.creneaux) {
      const key = slotKey(creneau.date, creneau.typeCreneau);
      const p = copie.find(
        (entry) => slotKey(entry.date, entry.typeCreneau) === key,
      );
      if (!p?.iadeId) {
        return false;
      }

      const jourKey = `${nouvelIade}:${p.date}`;
      const ancienKey = `${p.iadeId}:${p.date}`;
      affectations.set(ancienKey, (affectations.get(ancienKey) ?? 1) - 1);
      if ((affectations.get(ancienKey) ?? 0) <= 0) {
        affectations.delete(ancienKey);
      }
      const count = (affectations.get(jourKey) ?? 0) + 1;
      if (count > 1) {
        return false;
      }
      affectations.set(jourKey, count);
      p.iadeId = nouvelIade;
    }
    return true;
  }

  if (!appliquer(blocA, iadeB) || !appliquer(blocB, iadeA)) {
    return null;
  }

  return copie;
}

function construireBlocsRecherchePasse2(
  blocs: Bloc[],
  iadeHaut: string,
  iadeBas: string,
): {
  blocsRecherche: Bloc[];
  creneauxCibles: Set<string>;
} {
  const blocsRecherche: Bloc[] = [];
  const creneauxCibles = new Set<string>();

  for (const bloc of blocs) {
    const iadeBloc = getIadeIdBloc(bloc);
    if (
      bloc.type !== undefined &&
      (iadeBloc === iadeHaut || iadeBloc === iadeBas)
    ) {
      for (const creneau of bloc.creneaux) {
        creneauxCibles.add(slotKey(creneau.date, creneau.typeCreneau));
        blocsRecherche.push({
          creneaux: [creneau],
          iadeId: creneau.iadeId!,
          ligneId: bloc.ligneId,
        });
      }
      continue;
    }
    blocsRecherche.push(bloc);
  }

  return { blocsRecherche, creneauxCibles };
}

function enumererCandidatsPasse2(
  propositions: PropositionAffectation[],
  contexte: ContexteReoptimisation,
  pointsDepart: Map<string, number>,
  variancePasse1: number,
  ecartActuel: number,
  iadeHaut: string,
  iadeBas: string,
): CandidatPasse2Synth[] {
  const qualifies = contexte.qualificationsParLigne.get(LIGNE_ID)!;
  const blocs = detecterBlocsContinuite(
    propositions,
    contexte.preferenceIndex,
  );
  const { blocsRecherche, creneauxCibles } = construireBlocsRecherchePasse2(
    blocs,
    iadeHaut,
    iadeBas,
  );

  const candidats: CandidatPasse2Synth[] = [];

  for (let indexA = 0; indexA < blocsRecherche.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < blocsRecherche.length; indexB += 1) {
      const blocA = blocsRecherche[indexA]!;
      const blocB = blocsRecherche[indexB]!;

      if (getIadeIdBloc(blocA) === getIadeIdBloc(blocB)) {
        continue;
      }

      const impliqueCible =
        blocA.creneaux.some((c) =>
          creneauxCibles.has(slotKey(c.date, c.typeCreneau)),
        ) ||
        blocB.creneaux.some((c) =>
          creneauxCibles.has(slotKey(c.date, c.typeCreneau)),
        );

      if (!impliqueCible) {
        continue;
      }

      const simule = simulerEchange(propositions, blocA, blocB);
      if (!simule) {
        continue;
      }

      const points = calculerPointsFinauxSync(
        simule,
        pointsDepart,
        contexte.astreintesExistantesParIade,
        contexte.bonusParLigne,
      );
      const ecartApres = calculerEcartLigne(points, qualifies);
      const varianceApres = varianceLigne(simule, pointsDepart, contexte);

      if (ecartApres >= ecartActuel) {
        continue;
      }

      const decompose =
        (blocA.creneaux.length === 1 &&
          creneauxCibles.has(
            slotKey(blocA.creneaux[0]!.date, blocA.creneaux[0]!.typeCreneau),
          )) ||
        (blocB.creneaux.length === 1 &&
          creneauxCibles.has(
            slotKey(blocB.creneaux[0]!.date, blocB.creneaux[0]!.typeCreneau),
          ));

      candidats.push({
        label: `${getIadeIdBloc(blocA)} ↔ ${getIadeIdBloc(blocB)}`,
        ecartApres,
        varianceApres,
        decomposeContinuite: decompose,
        degradeVariance:
          varianceApres > variancePasse1 + EPSILON_VARIANCE_PASSE2,
      });
    }
  }

  candidats.sort((a, b) => a.ecartApres - b.ecartApres);
  return candidats;
}

function creerScenarioInterne(params: {
  nom: string;
  astreintes: {
    haut: number;
    milieu: number;
    bas: number;
  };
  bonusJourNuit: number;
  /** IADE portant le bloc JOUR+NUIT (doit être un extrême points après Passe 1 pour Passe 2). */
  iadeBlocContinuite?: string;
}): ScenarioPasse2Synth {
  const iadeBloc = params.iadeBlocContinuite ?? IADE_HAUT;
  const qualifies = new Set([IADE_HAUT, IADE_MILIEU, IADE_BAS]);
  const qualificationsParLigne = new Map([[LIGNE_ID, qualifies]]);

  const bonusParLigne = new Map<string, Record<TypeBonusContinuite, number>>([
    [LIGNE_ID, { JOUR_NUIT: params.bonusJourNuit, WEEKEND_48H: 0 }],
  ]);

  const astreintesExistantesParIade = new Map<string, AstreintePointsRow[]>([
    [
      IADE_HAUT,
      [
        row(
          IADE_HAUT,
          "2026-01-01",
          TypeCreneau.NUIT_SEMAINE,
          params.astreintes.haut,
        ),
      ],
    ],
    [
      IADE_MILIEU,
      [
        row(
          IADE_MILIEU,
          "2026-01-02",
          TypeCreneau.NUIT_SEMAINE,
          params.astreintes.milieu,
        ),
      ],
    ],
    [
      IADE_BAS,
      [
        row(
          IADE_BAS,
          "2026-01-03",
          TypeCreneau.NUIT_SEMAINE,
          params.astreintes.bas,
        ),
      ],
    ],
  ]);

  const nomBloc =
    iadeBloc === IADE_HAUT
      ? "Haut A"
      : iadeBloc === IADE_MILIEU
        ? "Milieu B"
        : "Bas C";

  const propositions: PropositionAffectation[] = [
    proposition(
      "2026-08-16",
      TypeCreneau.JOUR_FERIE,
      iadeBloc,
      nomBloc,
      2,
    ),
    proposition(
      "2026-08-16",
      TypeCreneau.NUIT_FERIE,
      iadeBloc,
      nomBloc,
      2,
    ),
    proposition(
      "2026-08-17",
      TypeCreneau.NUIT_SEMAINE,
      IADE_MILIEU,
      "Milieu B",
      1,
    ),
    proposition(
      "2026-08-18",
      TypeCreneau.NUIT_SEMAINE,
      IADE_BAS,
      "Bas C",
      1,
    ),
  ];

  const preferenceIndex = buildPreferenceContinuiteIndex([
    {
      iadeId: iadeBloc,
      ligneId: LIGNE_ID,
      dateDebut: new Date("2026-08-16T00:00:00.000Z"),
      type: TypePreferenceContinuite.JOUR_NUIT,
    },
  ]);

  const iadeIds = [IADE_HAUT, IADE_MILIEU, IADE_BAS];
  const contexte: ContexteReoptimisation = {
    preferenceIndex,
    qualificationsParLigne,
    disponibilitesParIade: buildDispos(propositions, iadeIds),
    iadesParId: new Map(
      iadeIds.map((id) => [id, { nom: id, prenom: "Synth" }]),
    ),
    lignesParId: new Map([[LIGNE_ID, { nom: LIGNE_NOM }]]),
    astreintesExistantesParIade,
    bonusParLigne,
    seuilsEcartAberrantParLigne: new Map([[LIGNE_ID, 2]]),
  };

  const pointsDepart = new Map<string, number>([
    [IADE_HAUT, 0],
    [IADE_MILIEU, 0],
    [IADE_BAS, 0],
  ]);

  const points = calculerPointsFinauxSync(
    propositions,
    pointsDepart,
    astreintesExistantesParIade,
    bonusParLigne,
  );
  const ecartAvantPasse2 = calculerEcartLigne(points, qualifies);
  const variancePasse1 = varianceLigne(propositions, pointsDepart, contexte);

  const extremes = [...qualifies].sort(
    (a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0),
  );
  const iadeHaut = extremes[0]!;
  const iadeBas = extremes[extremes.length - 1]!;

  const candidats = enumererCandidatsPasse2(
    propositions,
    contexte,
    pointsDepart,
    variancePasse1,
    ecartAvantPasse2,
    iadeHaut,
    iadeBas,
  );

  const meilleurEcartCandidat = candidats[0] ?? null;
  const meilleurVarianceValide =
    candidats
      .filter((c) => !c.degradeVariance)
      .sort((a, b) => a.varianceApres - b.varianceApres)[0] ?? null;

  return {
    nom: params.nom,
    propositions,
    contexte,
    pointsDepart,
    variancePasse1,
    ecartAvantPasse2,
    seuil: 2,
    candidats,
    meilleurEcartCandidat,
    meilleurVarianceValide,
  };
}

/** Passe 2 déclenchée : au moins un échange valide (écart + variance). */
export function creerScenarioPasse2AccepteSynth(): ScenarioPasse2Synth {
  return creerScenarioInterne({
    nom: "accepte-variance",
    astreintes: { haut: 6, milieu: 4, bas: 4 },
    bonusJourNuit: 8,
  });
}

/**
 * Passe 2 déclenchée (écart > seuil) mais aucun échange valide avec la variance
 * réelle fin Passe 1 : la cassure de bloc est refusée (résultat Passe 1 conservé).
 * Note : sur 3 IADE / 1 ligne, tout échange écart↓ dégrade aussi la variance ;
 * le test de rejet de la contrainte variance utilise {@link evaluerSelectionPasse2Scenario}
 * avec une référence artificiellement stricte (voir verifier-conformite-lisse).
 */
export function creerScenarioPasse2RejetVarianceSynth(): ScenarioPasse2Synth {
  return creerScenarioInterne({
    nom: "rejet-variance",
    astreintes: { haut: 12, milieu: 3, bas: 1 },
    bonusJourNuit: 2,
    iadeBlocContinuite: IADE_BAS,
  });
}

/** Évalue la sélection Passe 2 (double condition) sur un scénario synthétique. */
export function evaluerSelectionPasse2Scenario(
  scenario: ScenarioPasse2Synth,
  varianceReferencePasse1: number,
) {
  return evaluerMeilleurEchangePasse2PourConformite(
    scenario.propositions,
    scenario.pointsDepart,
    scenario.contexte,
    {
      ligneId: LIGNE_ID,
      varianceReferencePasse1,
      lignesCiblesVariance: new Set([LIGNE_ID]),
    },
  );
}

/** @deprecated Utiliser creerScenarioPasse2AccepteSynth */
export function creerScenarioPasse2VarianceSynth(): ScenarioPasse2Synth {
  return creerScenarioPasse2AccepteSynth();
}
