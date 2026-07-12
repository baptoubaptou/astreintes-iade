import { SourceJourFerie, StatutAstreinte, TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";

export type JourFerieCalcule = {
  date: Date;
  nom: string;
};

export type JourFerieItem = {
  id: string;
  date: string;
  nom: string;
  source: SourceJourFerie;
  actif: boolean;
};

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function dateAtUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return normalizeUtcDay(result);
}

/** Algorithme de Meeus/Jones/Butcher pour la date de Pâques (dimanche). */
export function calculerPaques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return dateAtUtc(annee, month, day);
}

export function calculerJoursFeries(annee: number): JourFerieCalcule[] {
  const paques = calculerPaques(annee);

  const fixes: JourFerieCalcule[] = [
    { date: dateAtUtc(annee, 1, 1), nom: "Jour de l'an" },
    { date: dateAtUtc(annee, 5, 1), nom: "Fête du travail" },
    { date: dateAtUtc(annee, 5, 8), nom: "Victoire 1945" },
    { date: dateAtUtc(annee, 7, 14), nom: "Fête nationale" },
    { date: dateAtUtc(annee, 8, 15), nom: "Assomption" },
    { date: dateAtUtc(annee, 11, 1), nom: "Toussaint" },
    { date: dateAtUtc(annee, 11, 11), nom: "Armistice" },
    { date: dateAtUtc(annee, 12, 25), nom: "Noël" },
  ];

  const mobiles: JourFerieCalcule[] = [
    { date: addDaysUtc(paques, 1), nom: "Lundi de Pâques" },
    { date: addDaysUtc(paques, 39), nom: "Ascension" },
    { date: addDaysUtc(paques, 50), nom: "Lundi de Pentecôte" },
  ];

  return [...fixes, ...mobiles].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

function getYearUtcRange(annee: number) {
  return {
    start: dateAtUtc(annee, 1, 1),
    end: dateAtUtc(annee + 1, 1, 1),
  };
}

function mapJourFerie(record: {
  id: string;
  date: Date;
  nom: string;
  source: SourceJourFerie;
  actif: boolean;
}): JourFerieItem {
  return {
    id: record.id,
    date: normalizeUtcDay(record.date).toISOString().slice(0, 10),
    nom: record.nom,
    source: record.source,
    actif: record.actif,
  };
}

export function parseAnneeJoursFeries(value?: string | null): number {
  const now = new Date();
  const fallback = now.getUTCFullYear();

  if (!value || !/^\d{4}$/.test(value)) {
    return fallback;
  }

  const annee = Number(value);
  if (annee < 2000 || annee > 2100) {
    return fallback;
  }

  return annee;
}

export async function synchroniserJoursFeries(annee: number): Promise<{
  annee: number;
  calcules: number;
  inseres: number;
  ignores: number;
}> {
  const calcules = calculerJoursFeries(annee);
  let inseres = 0;
  let ignores = 0;

  for (const jour of calcules) {
    const date = normalizeUtcDay(jour.date);
    const existing = await prisma.jourFerie.findUnique({
      where: { date },
    });

    if (existing) {
      ignores++;
      continue;
    }

    await prisma.jourFerie.create({
      data: {
        date,
        nom: jour.nom,
        source: SourceJourFerie.AUTO,
        actif: true,
      },
    });
    inseres++;
  }

  return {
    annee,
    calcules: calcules.length,
    inseres,
    ignores,
  };
}

export async function listJoursFeries(annee: number): Promise<JourFerieItem[]> {
  const { start, end } = getYearUtcRange(annee);

  const records = await prisma.jourFerie.findMany({
    where: {
      date: { gte: start, lt: end },
    },
    orderBy: { date: "asc" },
  });

  return records.map(mapJourFerie);
}

export function validateCreateJourFerieInput(
  input: Record<string, unknown>,
): { date: Date; nom: string } | { error: string } {
  const dateStr = typeof input.date === "string" ? input.date.trim() : "";
  const nom = typeof input.nom === "string" ? input.nom.trim() : "";

  if (!dateStr || !nom) {
    return { error: "La date et le nom sont requis." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "La date est invalide." };
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = dateAtUtc(year, month, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { error: "La date est invalide." };
  }

  return { date, nom };
}

export async function createJourFerieManuel(
  input: { date: Date; nom: string },
): Promise<{ jourFerie: JourFerieItem } | { error: string }> {
  const date = normalizeUtcDay(input.date);

  try {
    const record = await prisma.jourFerie.create({
      data: {
        date,
        nom: input.nom,
        source: SourceJourFerie.MANUEL,
        actif: true,
      },
    });

    return { jourFerie: mapJourFerie(record) };
  } catch {
    return { error: "Un jour férié existe déjà à cette date." };
  }
}

export type AstreinteBloquantDesactivation = {
  date: string;
  ligneNom: string;
  iadeNom: string;
  typeCreneau: TypeCreneau;
};

export type PreviewDesactivationJourFerie = {
  disponibilites: number;
  preferencesContinuite: number;
};

export type DesactivationJourFerieResult =
  | { jourFerie: JourFerieItem }
  | {
      error: string;
      astreintesBloquantes: AstreinteBloquantDesactivation[];
    }
  | {
      requiresConfirmation: true;
      preview: PreviewDesactivationJourFerie;
    };

export type TypeJour = "SEMAINE" | "SAMEDI" | "DIMANCHE" | "FERIE";

export function formatDateKey(date: Date): string {
  return normalizeUtcDay(date).toISOString().slice(0, 10);
}

/**
 * Détermine le type de jour pour une date (priorité : férié actif > samedi > dimanche > semaine).
 */
export async function determinerTypeJour(date: Date): Promise<TypeJour> {
  const jour = normalizeUtcDay(date);

  const ferie = await prisma.jourFerie.findFirst({
    where: {
      date: jour,
      actif: true,
    },
  });

  if (ferie) {
    return "FERIE";
  }

  const dayOfWeek = jour.getUTCDay();
  if (dayOfWeek === 6) {
    return "SAMEDI";
  }
  if (dayOfWeek === 0) {
    return "DIMANCHE";
  }

  return "SEMAINE";
}

/** Créneaux déclarables / planifiables selon le type de jour. */
export function creneauxDisponiblesPour(typeJour: TypeJour): TypeCreneau[] {
  switch (typeJour) {
    case "SEMAINE":
      return [TypeCreneau.NUIT_SEMAINE];
    case "SAMEDI":
      return [TypeCreneau.JOUR_SAMEDI, TypeCreneau.NUIT_SAMEDI];
    case "DIMANCHE":
      return [TypeCreneau.JOUR_DIMANCHE, TypeCreneau.NUIT_DIMANCHE];
    case "FERIE":
      return [TypeCreneau.JOUR_FERIE, TypeCreneau.NUIT_FERIE];
  }
}

export function estJourScinde(typeJour: TypeJour): boolean {
  return typeJour !== "SEMAINE";
}

/** Charge les types de jour pour une liste de dates (une requête fériés). */
export async function chargerTypesJour(
  dates: Date[],
): Promise<Map<string, TypeJour>> {
  const map = new Map<string, TypeJour>();

  if (dates.length === 0) {
    return map;
  }

  const normalized = dates.map((date) => normalizeUtcDay(date));
  const minTime = Math.min(...normalized.map((date) => date.getTime()));
  const maxTime = Math.max(...normalized.map((date) => date.getTime()));
  const min = new Date(minTime);
  const max = new Date(maxTime);

  const feries = await prisma.jourFerie.findMany({
    where: {
      date: { gte: min, lte: max },
      actif: true,
    },
    select: { date: true },
  });

  const feriesActifs = new Set(
    feries.map((ferie) => formatDateKey(normalizeUtcDay(ferie.date))),
  );

  for (const jour of normalized) {
    const key = formatDateKey(jour);

    if (feriesActifs.has(key)) {
      map.set(key, "FERIE");
      continue;
    }

    const dayOfWeek = jour.getUTCDay();
    if (dayOfWeek === 6) {
      map.set(key, "SAMEDI");
    } else if (dayOfWeek === 0) {
      map.set(key, "DIMANCHE");
    } else {
      map.set(key, "SEMAINE");
    }
  }

  return map;
}

const TYPES_ASTREINTE_SCINDES: TypeCreneau[] = [
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

const TYPES_DISPONIBILITE_SCINDEE: TypeCreneau[] = [
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

export async function toggleJourFerieActif(
  id: string,
  actif: boolean,
  options?: { confirmer?: boolean },
): Promise<
  | { jourFerie: JourFerieItem }
  | { error: string }
  | DesactivationJourFerieResult
> {
  if (actif) {
    try {
      const record = await prisma.jourFerie.update({
        where: { id },
        data: { actif: true },
      });

      return { jourFerie: mapJourFerie(record) };
    } catch {
      return { error: "Jour férié introuvable." };
    }
  }

  return desactiverJourFerie(id, options?.confirmer === true);
}

async function desactiverJourFerie(
  id: string,
  confirmer: boolean,
): Promise<DesactivationJourFerieResult> {
  const jourFerie = await prisma.jourFerie.findUnique({ where: { id } });

  if (!jourFerie) {
    return { error: "Jour férié introuvable.", astreintesBloquantes: [] };
  }

  const date = normalizeUtcDay(jourFerie.date);

  const astreintesBloquantes = await prisma.astreinte.findMany({
    where: {
      date,
      typeCreneau: { in: TYPES_ASTREINTE_SCINDES },
      statut: { not: StatutAstreinte.ANNULEE },
    },
    include: {
      ligne: { select: { nom: true } },
      iade: { select: { nom: true, prenom: true } },
    },
    orderBy: [{ ligne: { nom: "asc" } }, { typeCreneau: "asc" }],
  });

  if (astreintesBloquantes.length > 0) {
    return {
      error:
        "Des astreintes en créneaux scindés existent encore sur cette date. Traitez-les manuellement avant de désactiver ce jour férié.",
      astreintesBloquantes: astreintesBloquantes.map((astreinte) => ({
        date: date.toISOString().slice(0, 10),
        ligneNom: astreinte.ligne.nom,
        iadeNom: `${astreinte.iade.prenom} ${astreinte.iade.nom}`,
        typeCreneau: astreinte.typeCreneau,
      })),
    };
  }

  const [disponibilites, preferencesContinuite] = await Promise.all([
    prisma.disponibilite.count({
      where: {
        date,
        typeCreneau: { in: TYPES_DISPONIBILITE_SCINDEE },
      },
    }),
    prisma.preferenceContinuite.count({
      where: { dateDebut: date },
    }),
  ]);

  const preview: PreviewDesactivationJourFerie = {
    disponibilites,
    preferencesContinuite,
  };

  if ((disponibilites > 0 || preferencesContinuite > 0) && !confirmer) {
    return {
      requiresConfirmation: true,
      preview,
    };
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      if (disponibilites > 0) {
        await tx.disponibilite.deleteMany({
          where: {
            date,
            typeCreneau: { in: TYPES_DISPONIBILITE_SCINDEE },
          },
        });
      }

      if (preferencesContinuite > 0) {
        await tx.preferenceContinuite.deleteMany({
          where: { dateDebut: date },
        });
      }

      return tx.jourFerie.update({
        where: { id },
        data: { actif: false },
      });
    });

    return { jourFerie: mapJourFerie(record) };
  } catch {
    return { error: "Jour férié introuvable.", astreintesBloquantes: [] };
  }
}
