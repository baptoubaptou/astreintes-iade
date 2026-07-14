import { prisma } from "@/lib/db";
import { parseDateInput, parseMoisParam } from "@/server/astreintes";
import { formatDateIso, startOfTodayUtc } from "@/server/campagnes";

export type FenetreCampagneSaisie = {
  id: string;
  ligneId: string;
  ligneNom: string;
  periodeDebut: string;
  periodeFin: string;
  dateLimiteSaisieDispos: string;
};

export type CampagneIadeParLigne = {
  ligneId: string;
  ligneNom: string;
  campagne: {
    periodeDebut: string;
    periodeFin: string;
    dateLimiteSaisieDispos: string;
    dateGenerationPrevue: string;
  } | null;
};

export type VerrouillageSaisieDispo = {
  ligneNom: string;
  dateLimiteSaisieDispos: string;
};

function getMonthUtcRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  return { start, end };
}

function mapFenetreCampagneSaisie(fenetre: {
  id: string;
  ligneId: string;
  periodeDebut: Date;
  periodeFin: Date;
  dateLimiteSaisieDispos: Date;
  ligne: { nom: string };
}): FenetreCampagneSaisie {
  return {
    id: fenetre.id,
    ligneId: fenetre.ligneId,
    ligneNom: fenetre.ligne.nom,
    periodeDebut: formatDateIso(fenetre.periodeDebut),
    periodeFin: formatDateIso(fenetre.periodeFin),
    dateLimiteSaisieDispos: formatDateIso(fenetre.dateLimiteSaisieDispos),
  };
}

export function estSaisieDisposVerrouillee(
  date: string,
  ligneId: string,
  fenetres: FenetreCampagneSaisie[],
  todayIso: string = formatDateIso(startOfTodayUtc()),
): VerrouillageSaisieDispo | null {
  for (const fenetre of fenetres) {
    if (fenetre.ligneId !== ligneId) {
      continue;
    }

    if (date < fenetre.periodeDebut || date > fenetre.periodeFin) {
      continue;
    }

    if (fenetre.dateLimiteSaisieDispos >= todayIso) {
      continue;
    }

    return {
      ligneNom: fenetre.ligneNom,
      dateLimiteSaisieDispos: fenetre.dateLimiteSaisieDispos,
    };
  }

  return null;
}

export async function getLigneIdsQualifiees(iadeId: string): Promise<string[]> {
  const qualifications = await prisma.qualification.findMany({
    where: { iadeId },
    select: { ligneId: true },
  });

  return qualifications.map((qualification) => qualification.ligneId);
}

export async function getCampagnesIadeParLigneQualifiee(
  iadeId: string,
): Promise<CampagneIadeParLigne[]> {
  const today = startOfTodayUtc();

  const qualifications = await prisma.qualification.findMany({
    where: { iadeId },
    include: {
      ligne: {
        select: { id: true, nom: true, ordrePriorite: true, actif: true },
      },
    },
    orderBy: { ligne: { ordrePriorite: "asc" } },
  });

  const lignes = qualifications
    .map((qualification) => qualification.ligne)
    .filter((ligne) => ligne.actif);

  const result: CampagneIadeParLigne[] = [];

  for (const ligne of lignes) {
    const fenetre = await prisma.fenetreGeneration.findFirst({
      where: {
        ligneId: ligne.id,
        archivee: false,
        periodeFin: { gte: today },
      },
      orderBy: [
        { dateGenerationPrevue: "asc" },
        { periodeDebut: "asc" },
      ],
    });

    result.push({
      ligneId: ligne.id,
      ligneNom: ligne.nom,
      campagne: fenetre
        ? {
            periodeDebut: formatDateIso(fenetre.periodeDebut),
            periodeFin: formatDateIso(fenetre.periodeFin),
            dateLimiteSaisieDispos: formatDateIso(fenetre.dateLimiteSaisieDispos),
            dateGenerationPrevue: formatDateIso(fenetre.dateGenerationPrevue),
          }
        : null,
    });
  }

  return result;
}

export async function getFenetresCampagnesPourMois(
  iadeId: string,
  mois: string,
): Promise<FenetreCampagneSaisie[]> {
  const ligneIds = await getLigneIdsQualifiees(iadeId);
  if (ligneIds.length === 0) {
    return [];
  }

  const { year, month } = parseMoisParam(mois);
  const { start, end } = getMonthUtcRange(year, month);

  const fenetres = await prisma.fenetreGeneration.findMany({
    where: {
      archivee: false,
      ligneId: { in: ligneIds },
      periodeDebut: { lte: end },
      periodeFin: { gte: start },
    },
    include: {
      ligne: { select: { nom: true } },
    },
    orderBy: [{ periodeDebut: "asc" }, { ligneId: "asc" }],
  });

  return fenetres.map(mapFenetreCampagneSaisie);
}

export async function assertSaisieDisposOuverte(
  ligneId: string,
  date: Date,
): Promise<{ error: string } | null> {
  const today = startOfTodayUtc();
  const dateNormalisee = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

  const fenetre = await prisma.fenetreGeneration.findFirst({
    where: {
      ligneId,
      archivee: false,
      periodeDebut: { lte: dateNormalisee },
      periodeFin: { gte: dateNormalisee },
      dateLimiteSaisieDispos: { lt: today },
    },
    include: {
      ligne: { select: { nom: true } },
    },
  });

  if (!fenetre) {
    return null;
  }

  return {
    error: `Saisie clôturée pour ${fenetre.ligne.nom} depuis le ${formatDateFrLong(fenetre.dateLimiteSaisieDispos)}.`,
  };
}

function formatDateFrLong(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateFrIso(dateIso: string): string {
  const parsed = parseDateInput(dateIso);
  if (!parsed) {
    return dateIso;
  }

  return formatDateFrLong(parsed);
}

export function listerMessagesVerrouillageMois(
  fenetres: FenetreCampagneSaisie[],
  mois: string,
  todayIso: string = formatDateIso(startOfTodayUtc()),
): Array<{ ligneId: string; message: string }> {
  const { year, month: monthNumber } = parseMoisParam(mois);
  const { start, end } = getMonthUtcRange(year, monthNumber);
  const messages = new Map<string, string>();

  for (const fenetre of fenetres) {
    if (fenetre.dateLimiteSaisieDispos >= todayIso) {
      continue;
    }

    const chevauchement =
      fenetre.periodeDebut <= formatDateIso(end) &&
      fenetre.periodeFin >= formatDateIso(start);

    if (!chevauchement) {
      continue;
    }

    messages.set(
      fenetre.ligneId,
      `Saisie clôturée pour ${fenetre.ligneNom} depuis le ${formatDateFrIso(fenetre.dateLimiteSaisieDispos)}.`,
    );
  }

  return [...messages.entries()].map(([ligneId, message]) => ({
    ligneId,
    message,
  }));
}
