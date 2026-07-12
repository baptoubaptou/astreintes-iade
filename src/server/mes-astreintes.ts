import { StatutAstreinte } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  enrichirAstreintesBourseEligibilite,
  getOffresOuvertesParAstreinte,
  traiterOffresBourseExpirees,
} from "@/server/bourse-astreintes";
import type { AstreinteAvecBourse } from "@/components/mes-astreintes/mes-astreintes-list";
import type { AstreinteListItem } from "@/server/astreintes";
import {
  calculerPointsCumules,
  getCivilYearRange,
} from "@/server/points";

export type MesAstreintesOverview = {
  annee: number;
  pointsCumules: number;
  futures: AstreinteAvecBourse[];
  passees: AstreinteListItem[];
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function mapAstreinte(astreinte: {
  id: string;
  date: Date;
  typeCreneau: import("@prisma/client").TypeCreneau;
  pointsAttribues: number;
  statut: StatutAstreinte;
  publie: boolean;
  datePublication: Date | null;
  ligne: { id: string; nom: string };
  iade: { id: string; nom: string; prenom: string };
}): AstreinteListItem {
  return {
    id: astreinte.id,
    date: astreinte.date.toISOString().slice(0, 10),
    typeCreneau: astreinte.typeCreneau,
    pointsAttribues: astreinte.pointsAttribues,
    statut: astreinte.statut,
    publie: astreinte.publie,
    datePublication: astreinte.datePublication
      ? astreinte.datePublication.toISOString()
      : null,
    ligne: astreinte.ligne,
    iade: astreinte.iade,
  };
}

const astreinteInclude = {
  ligne: { select: { id: true, nom: true } },
  iade: { select: { id: true, nom: true, prenom: true } },
} as const;

export async function getMesAstreintesOverview(
  iadeId: string,
): Promise<MesAstreintesOverview> {
  await traiterOffresBourseExpirees();

  const today = startOfTodayUtc();
  const annee = today.getUTCFullYear();
  const { start: yearStart } = getCivilYearRange(annee);

  const [futures, passees, pointsCumules] = await Promise.all([
    prisma.astreinte.findMany({
      where: {
        iadeId,
        date: { gte: today },
        statut: { not: StatutAstreinte.ANNULEE },
        publie: true,
      },
      include: astreinteInclude,
      orderBy: { date: "asc" },
    }),
    prisma.astreinte.findMany({
      where: {
        iadeId,
        date: { gte: yearStart, lt: today },
        statut: { not: StatutAstreinte.ANNULEE },
        publie: true,
      },
      include: astreinteInclude,
      orderBy: { date: "desc" },
    }),
    calculerPointsCumules(iadeId, annee),
  ]);

  const futuresMapped = futures.map(mapAstreinte);
  const offresOuvertes = await getOffresOuvertesParAstreinte(
    futuresMapped.map((astreinte) => astreinte.id),
  );
  const futuresAvecBourse = await enrichirAstreintesBourseEligibilite(
    futuresMapped,
    offresOuvertes,
  );

  return {
    annee,
    pointsCumules,
    futures: futuresAvecBourse,
    passees: passees.map(mapAstreinte),
  };
}
