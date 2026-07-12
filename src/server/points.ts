import { Role, StatutAstreinte, TypeBonusContinuite, TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AstreinteVisibilite } from "@/server/astreintes";
import { getPoidsCreneau } from "@/server/astreinte-creneaux";
import {
  calculerBonusContinuitePourIade,
  calculerBonusContinuitePourLigne,
  chargerBonusContinuiteParLigne,
  type AstreintePourBonusContinuite,
} from "@/server/bonus-continuite";

export const ORDRE_TYPES_CRENEAU_POINTS: TypeCreneau[] = [
  TypeCreneau.NUIT_SEMAINE,
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

export type LignePointsColumn = {
  id: string;
  nom: string;
};

export type PointsParCreneau = {
  typeCreneau: TypeCreneau;
  astreintes: number;
  points: number;
};

export type PointsParLigne = {
  ligneId: string;
  astreintes: number;
  points: number;
  parCreneau: PointsParCreneau[];
};

export type PointsIadeRow = {
  iadeId: string;
  nom: string;
  prenom: string;
  pointsTotal: number;
  parLigne: PointsParLigne[];
};

export type PointsOverview = {
  annee: number;
  lignes: LignePointsColumn[];
  iades: PointsIadeRow[];
};

export function getCurrentCivilYear(): number {
  return new Date().getUTCFullYear();
}

export function parseAnneeParam(value?: string | null): number {
  const fallback = getCurrentCivilYear();
  if (!value || !/^\d{4}$/.test(value)) {
    return fallback;
  }

  const annee = Number(value);
  if (annee < 2000 || annee > 2100) {
    return fallback;
  }

  return annee;
}

export type PropositionPointsInput = {
  date: string;
  iadeId: string | null;
  ligneId: string;
  typeCreneau: TypeCreneau;
  pointsAttribues: number;
  nonPourvu?: boolean;
  dejaPlanifie?: boolean;
};

export type PointsProjectesIade = {
  iadeId: string;
  nom: string;
  prenom: string;
  annee: number;
  pointsAvant: number;
  pointsApres: number;
  delta: number;
};

function anneeFromDateString(date: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  return match ? Number(match[1]) : null;
}

function isPropositionComptabilisee(proposition: PropositionPointsInput): boolean {
  return (
    !!proposition.iadeId &&
    !proposition.nonPourvu &&
    !proposition.dejaPlanifie
  );
}

export type AstreintePointsRow = AstreintePourBonusContinuite & {
  iadeId: string;
  pointsAttribues: number;
};

const astreinteSelectPourPoints = {
  iadeId: true,
  ligneId: true,
  date: true,
  typeCreneau: true,
  pointsAttribues: true,
} as const;

function sommerPointsAttribues(
  astreintes: Pick<AstreintePointsRow, "pointsAttribues">[],
): number {
  return astreintes.reduce((total, astreinte) => total + astreinte.pointsAttribues, 0);
}

export function calculerTotalPointsDepuisAstreintes(
  astreintes: AstreintePointsRow[],
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>,
): number {
  return (
    sommerPointsAttribues(astreintes) +
    calculerBonusContinuitePourIade(astreintes, bonusParLigne)
  );
}

export function propositionsVersAstreintesVirtuelles(
  propositions: PropositionPointsInput[],
  annee: number,
  iadeId?: string,
): AstreintePointsRow[] {
  const virtuelles: AstreintePointsRow[] = [];

  for (const proposition of propositions) {
    if (!isPropositionComptabilisee(proposition)) {
      continue;
    }

    if (anneeFromDateString(proposition.date) !== annee) {
      continue;
    }

    if (iadeId && proposition.iadeId !== iadeId) {
      continue;
    }

    virtuelles.push({
      iadeId: proposition.iadeId!,
      ligneId: proposition.ligneId,
      date: new Date(`${proposition.date}T00:00:00.000Z`),
      typeCreneau: proposition.typeCreneau,
      pointsAttribues: proposition.pointsAttribues,
    });
  }

  return virtuelles;
}

export type PointsOverviewOptions = {
  visibilite?: AstreinteVisibilite;
};

function filtreVisibilitePoints(visibilite: AstreinteVisibilite = "toutes") {
  return visibilite === "publiees_seulement" ? { publie: true } : {};
}

function filtreAstreintesActivesIades(
  annee: number,
  visibilite: AstreinteVisibilite = "toutes",
) {
  const { start, end } = getCivilYearRange(annee);

  return {
    date: { gte: start, lt: end },
    statut: { not: StatutAstreinte.ANNULEE },
    iade: { role: Role.IADE, actif: true },
    ...filtreVisibilitePoints(visibilite),
  } as const;
}

export async function projecterPointsApresPropositions(
  annee: number,
  propositions: PropositionPointsInput[],
): Promise<PointsProjectesIade[]> {
  const where = filtreAstreintesActivesIades(annee);

  const [astreintesExistantes, iades, bonusParLigne] = await Promise.all([
    prisma.astreinte.findMany({
      where,
      select: astreinteSelectPourPoints,
    }),
    prisma.utilisateur.findMany({
      where: { role: Role.IADE, actif: true },
      select: { id: true, nom: true, prenom: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    chargerBonusContinuiteParLigne(),
  ]);

  const virtuelles = propositionsVersAstreintesVirtuelles(propositions, annee);
  const astreintesParIade = new Map<string, AstreintePointsRow[]>();

  for (const astreinte of astreintesExistantes) {
    const liste = astreintesParIade.get(astreinte.iadeId) ?? [];
    liste.push(astreinte);
    astreintesParIade.set(astreinte.iadeId, liste);
  }

  const virtuellesParIade = new Map<string, AstreintePointsRow[]>();
  for (const astreinte of virtuelles) {
    const liste = virtuellesParIade.get(astreinte.iadeId) ?? [];
    liste.push(astreinte);
    virtuellesParIade.set(astreinte.iadeId, liste);
  }

  return iades
    .map((iade) => {
      const existantes = astreintesParIade.get(iade.id) ?? [];
      const nouvelles = virtuellesParIade.get(iade.id) ?? [];
      const pointsAvant = calculerTotalPointsDepuisAstreintes(
        existantes,
        bonusParLigne,
      );
      const pointsApres = calculerTotalPointsDepuisAstreintes(
        [...existantes, ...nouvelles],
        bonusParLigne,
      );

      return {
        iadeId: iade.id,
        nom: iade.nom,
        prenom: iade.prenom,
        annee,
        pointsAvant,
        pointsApres,
        delta: pointsApres - pointsAvant,
      };
    })
    .sort((a, b) => {
      if (a.pointsApres !== b.pointsApres) {
        return a.pointsApres - b.pointsApres;
      }

      return (
        a.nom.localeCompare(b.nom, "fr") ||
        a.prenom.localeCompare(b.prenom, "fr")
      );
    });
}

export function propositionComptabilisee(
  proposition: PropositionPointsInput,
): boolean {
  return isPropositionComptabilisee(proposition);
}

export function calculerPointsFinauxDepuisContexte(
  propositions: PropositionPointsInput[],
  pointsDepart: Map<string, number>,
  astreintesExistantesParIade: Map<string, AstreintePointsRow[]>,
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>,
): Map<string, number> {
  const annees = new Set<number>();
  for (const proposition of propositions) {
    const annee = anneeFromDateString(proposition.date);
    if (annee) {
      annees.add(annee);
    }
  }

  const virtuellesParIade = new Map<string, AstreintePointsRow[]>();
  for (const annee of annees) {
    for (const astreinte of propositionsVersAstreintesVirtuelles(propositions, annee)) {
      const liste = virtuellesParIade.get(astreinte.iadeId) ?? [];
      liste.push(astreinte);
      virtuellesParIade.set(astreinte.iadeId, liste);
    }
  }

  const iadeIds = new Set<string>([
    ...pointsDepart.keys(),
    ...virtuellesParIade.keys(),
  ]);

  const resultat = new Map<string, number>();

  for (const iadeId of iadeIds) {
    const existantes = astreintesExistantesParIade.get(iadeId) ?? [];
    const nouvelles = virtuellesParIade.get(iadeId) ?? [];
    resultat.set(
      iadeId,
      calculerTotalPointsDepuisAstreintes(
        [...existantes, ...nouvelles],
        bonusParLigne,
      ),
    );
  }

  return resultat;
}

export async function chargerAstreintesPointsParIade(
  annee: number,
  iadeIds: Iterable<string>,
): Promise<Map<string, AstreintePointsRow[]>> {
  const ids = [...iadeIds];
  const astreintes = await prisma.astreinte.findMany({
    where: {
      iadeId: { in: ids },
      ...filtreAstreintesActivesIades(annee),
    },
    select: astreinteSelectPourPoints,
  });

  const map = new Map<string, AstreintePointsRow[]>();
  for (const astreinte of astreintes) {
    const liste = map.get(astreinte.iadeId) ?? [];
    liste.push(astreinte);
    map.set(astreinte.iadeId, liste);
  }

  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, []);
    }
  }

  return map;
}

/** Recalcule les points cumulés d'un IADE en incluant des propositions simulées. */
export async function calculerPointsCumulesAvecPropositions(
  iadeId: string,
  annee: number,
  propositions: PropositionPointsInput[],
): Promise<number> {
  const [astreintes, bonusParLigne] = await Promise.all([
    prisma.astreinte.findMany({
      where: {
        iadeId,
        ...filtreAstreintesActivesIades(annee),
      },
      select: astreinteSelectPourPoints,
    }),
    chargerBonusContinuiteParLigne(),
  ]);

  const virtuelles = propositionsVersAstreintesVirtuelles(
    propositions,
    annee,
    iadeId,
  );

  return calculerTotalPointsDepuisAstreintes(
    [...astreintes, ...virtuelles],
    bonusParLigne,
  );
}

export function getCivilYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

/** Points d'une astreinte = PoidsCreneau(ligneId, typeCreneau). */
export async function calculerPointsAttribues(
  ligneId: string,
  typeCreneau: TypeCreneau,
): Promise<number> {
  return getPoidsCreneau(ligneId, typeCreneau);
}

/** Somme poids + bonus de continuité (calculé à la lecture) pour l'année. */
export async function calculerPointsCumules(
  iadeId: string,
  annee: number,
): Promise<number> {
  const [astreintes, bonusParLigne] = await Promise.all([
    prisma.astreinte.findMany({
      where: {
        iadeId,
        ...filtreAstreintesActivesIades(annee),
      },
      select: astreinteSelectPourPoints,
    }),
    chargerBonusContinuiteParLigne(),
  ]);

  return calculerTotalPointsDepuisAstreintes(astreintes, bonusParLigne);
}

/** Somme poids + bonus de continuité pour tous les IADE actifs. */
export async function calculerPointsCumulesTousIades(
  annee: number,
  visibilite: AstreinteVisibilite = "toutes",
): Promise<Map<string, number>> {
  const where = filtreAstreintesActivesIades(annee, visibilite);

  const [activeIades, astreintes, bonusParLigne] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: Role.IADE, actif: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.astreinte.findMany({
      where,
      select: astreinteSelectPourPoints,
    }),
    chargerBonusContinuiteParLigne(),
  ]);

  const astreintesParIade = new Map<string, AstreintePointsRow[]>();
  for (const astreinte of astreintes) {
    const liste = astreintesParIade.get(astreinte.iadeId) ?? [];
    liste.push(astreinte);
    astreintesParIade.set(astreinte.iadeId, liste);
  }

  const points = new Map<string, number>();

  for (const iade of activeIades) {
    const rows = astreintesParIade.get(iade.id) ?? [];
    points.set(iade.id, calculerTotalPointsDepuisAstreintes(rows, bonusParLigne));
  }

  return points;
}

export async function getPointsOverview(
  annee: number,
  options: PointsOverviewOptions = {},
): Promise<PointsOverview> {
  const visibilite = options.visibilite ?? "toutes";
  const { start, end } = getCivilYearRange(annee);
  const whereAstreinte = {
    date: { gte: start, lt: end },
    statut: { not: StatutAstreinte.ANNULEE },
    iade: { role: Role.IADE, actif: true },
    ligne: { actif: true },
    ...filtreVisibilitePoints(visibilite),
  } as const;

  const [lignes, iades, totals, grouped, groupedCreneau, astreintes, bonusParLigne] =
    await Promise.all([
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true },
    }),
    prisma.utilisateur.findMany({
      where: { role: Role.IADE, actif: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: { id: true, nom: true, prenom: true },
    }),
    calculerPointsCumulesTousIades(annee, visibilite),
    prisma.astreinte.groupBy({
      by: ["iadeId", "ligneId"],
      where: whereAstreinte,
      _count: { id: true },
      _sum: { pointsAttribues: true },
    }),
    prisma.astreinte.groupBy({
      by: ["iadeId", "ligneId", "typeCreneau"],
      where: whereAstreinte,
      _count: { id: true },
      _sum: { pointsAttribues: true },
    }),
    prisma.astreinte.findMany({
      where: whereAstreinte,
      select: astreinteSelectPourPoints,
    }),
    chargerBonusContinuiteParLigne(),
  ]);

  const astreintesParIadeLigne = new Map<string, AstreintePointsRow[]>();
  for (const astreinte of astreintes) {
    const key = `${astreinte.iadeId}:${astreinte.ligneId}`;
    const liste = astreintesParIadeLigne.get(key) ?? [];
    liste.push(astreinte);
    astreintesParIadeLigne.set(key, liste);
  }

  const parLigneMap = new Map<
    string,
    Map<string, { astreintes: number; points: number }>
  >();
  const parCreneauMap = new Map<
    string,
    Map<string, Map<TypeCreneau, { astreintes: number; points: number }>>
  >();

  for (const row of grouped) {
    if (!parLigneMap.has(row.iadeId)) {
      parLigneMap.set(row.iadeId, new Map());
    }

    parLigneMap.get(row.iadeId)!.set(row.ligneId, {
      astreintes: row._count.id,
      points: row._sum.pointsAttribues ?? 0,
    });
  }

  for (const row of groupedCreneau) {
    if (!parCreneauMap.has(row.iadeId)) {
      parCreneauMap.set(row.iadeId, new Map());
    }

    const ligneMap = parCreneauMap.get(row.iadeId)!;
    if (!ligneMap.has(row.ligneId)) {
      ligneMap.set(row.ligneId, new Map());
    }

    ligneMap.get(row.ligneId)!.set(row.typeCreneau, {
      astreintes: row._count.id,
      points: row._sum.pointsAttribues ?? 0,
    });
  }

  const iadeRows: PointsIadeRow[] = iades.map((iade) => {
    const ligneStats = parLigneMap.get(iade.id);
    const creneauStats = parCreneauMap.get(iade.id);

    return {
      iadeId: iade.id,
      nom: iade.nom,
      prenom: iade.prenom,
      pointsTotal: totals.get(iade.id) ?? 0,
      parLigne: lignes.map((ligne) => {
        const stats = ligneStats?.get(ligne.id);
        const creneaux = creneauStats?.get(ligne.id);
        const astreintesLigne =
          astreintesParIadeLigne.get(`${iade.id}:${ligne.id}`) ?? [];
        const bonusLigne = calculerBonusContinuitePourLigne(
          astreintesLigne,
          ligne.id,
          bonusParLigne,
        );

        const parCreneau = ORDRE_TYPES_CRENEAU_POINTS.map((typeCreneau) => ({
          typeCreneau,
          astreintes: creneaux?.get(typeCreneau)?.astreintes ?? 0,
          points: creneaux?.get(typeCreneau)?.points ?? 0,
        })).filter((entry) => entry.astreintes > 0);

        return {
          ligneId: ligne.id,
          astreintes: stats?.astreintes ?? 0,
          points: (stats?.points ?? 0) + bonusLigne,
          parCreneau,
        };
      }),
    };
  });

  iadeRows.sort((a, b) => {
    if (a.pointsTotal !== b.pointsTotal) {
      return b.pointsTotal - a.pointsTotal;
    }

    return a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr");
  });

  return {
    annee,
    lignes,
    iades: iadeRows,
  };
}
