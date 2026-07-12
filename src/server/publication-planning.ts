import {
  TypeActionAudit,
  TypeCreneau,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { journaliser } from "@/server/audit";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { getMonthUtcRange, parseMoisParam } from "@/server/astreintes";
import { creerNotification } from "@/server/notifications";

export type PublicationResult = {
  publiees: number;
  astreinteIds: string[];
};

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function notifierNouvelleAffectationPlanning(astreinte: {
  date: Date;
  typeCreneau: TypeCreneau;
  ligne: { nom: string };
  iade: { id: string; email: string; prenom: string; nom: string };
}): Promise<void> {
  const dateLabel = formatDateFr(normalizeUtcDay(astreinte.date));
  const creneauLabel = LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau];
  const resume = `${astreinte.ligne.nom} — ${dateLabel} (${creneauLabel})`;

  await creerNotification(
    astreinte.iade.id,
    "NOUVELLE_AFFECTATION",
    `Nouvelle affectation : ${resume}.`,
    {
      to: astreinte.iade.email,
      subject: "Nouvelle affectation",
      body: `Bonjour ${astreinte.iade.prenom},\n\nVous avez été affecté(e) à l'astreinte suivante : ${resume}.\n\nCordialement,\nAstreintes IADE`,
    },
  );
}

export async function publierAstreintes(
  filter: {
    ligneId?: string;
    periodeDebut?: Date;
    periodeFin?: Date;
    mois?: string;
  },
  cadreId: string,
  resumeContexte: string,
): Promise<PublicationResult | { error: string }> {
  const where = {
    statut: { not: "ANNULEE" as const },
    publie: false as const,
    ...(filter.ligneId ? { ligneId: filter.ligneId } : {}),
    ...(filter.mois
      ? (() => {
          const { year, month } = parseMoisParam(filter.mois);
          const { start, end } = getMonthUtcRange(year, month);
          return { date: { gte: start, lt: end } };
        })()
      : filter.periodeDebut && filter.periodeFin
        ? {
            date: { gte: filter.periodeDebut, lte: filter.periodeFin },
          }
        : {}),
  };

  const aPublier = await prisma.astreinte.findMany({
    where,
    include: {
      ligne: { select: { nom: true } },
      iade: {
        select: { id: true, email: true, prenom: true, nom: true },
      },
    },
    orderBy: [{ date: "asc" }, { ligneId: "asc" }],
  });

  if (aPublier.length === 0) {
    return { error: "Aucune astreinte non publiée à publier pour cette sélection." };
  }

  const now = new Date();
  const astreinteIds = aPublier.map((astreinte) => astreinte.id);

  await prisma.astreinte.updateMany({
    where: { id: { in: astreinteIds } },
    data: {
      publie: true,
      datePublication: now,
    },
  });

  for (const astreinte of aPublier) {
    await notifierNouvelleAffectationPlanning(astreinte);
  }

  await journaliser({
    acteurId: cadreId,
    typeAction: TypeActionAudit.PLANNING_PUBLIE,
    resume: `Planning publié : ${aPublier.length} astreinte(s) — ${resumeContexte}.`,
    detail: {
      astreinteIds,
      contexte: resumeContexte,
    },
  });

  return {
    publiees: aPublier.length,
    astreinteIds,
  };
}

export async function publierCampagne(
  fenetreId: string,
  cadreId: string,
): Promise<PublicationResult | { error: string }> {
  const fenetre = await prisma.fenetreGeneration.findUnique({
    where: { id: fenetreId },
    include: { ligne: { select: { nom: true } } },
  });

  if (!fenetre) {
    return { error: "Campagne introuvable." };
  }

  return publierAstreintes(
    {
      ligneId: fenetre.ligneId,
      periodeDebut: fenetre.periodeDebut,
      periodeFin: fenetre.periodeFin,
    },
    cadreId,
    `campagne ${fenetre.ligne.nom} (${formatDateFr(fenetre.periodeDebut)} — ${formatDateFr(fenetre.periodeFin)})`,
  );
}

export async function publierMoisPlanning(
  mois: string,
  cadreId: string,
): Promise<PublicationResult | { error: string }> {
  const parsed = parseMoisParam(mois);
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));

  return publierAstreintes(
    { mois: parsed.value },
    cadreId,
    `mois de ${label}`,
  );
}

export async function compterAstreintesNonPubliees(options: {
  mois?: string;
  ligneId?: string;
  periodeDebut?: Date;
  periodeFin?: Date;
}): Promise<number> {
  const where = {
    statut: { not: "ANNULEE" as const },
    publie: false as const,
    ...(options.ligneId ? { ligneId: options.ligneId } : {}),
    ...(options.mois
      ? (() => {
          const { year, month } = parseMoisParam(options.mois);
          const { start, end } = getMonthUtcRange(year, month);
          return { date: { gte: start, lt: end } };
        })()
      : options.periodeDebut && options.periodeFin
        ? {
            date: { gte: options.periodeDebut, lte: options.periodeFin },
          }
        : {}),
  };

  return prisma.astreinte.count({ where });
}
