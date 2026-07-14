import { StatutAstreinte } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateIso } from "@/server/campagnes";

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export type BorneCalendrierPublie = {
  dateDernierePublication: string | null;
  dateDebutMin: string | null;
};

function buildBorne(dateMax: Date | null): BorneCalendrierPublie {
  if (!dateMax) {
    return { dateDernierePublication: null, dateDebutMin: null };
  }

  const dateDernierePublication = formatDateIso(normalizeUtcDay(dateMax));
  const dateDebutMinDate = new Date(normalizeUtcDay(dateMax));
  dateDebutMinDate.setUTCDate(dateDebutMinDate.getUTCDate() + 1);

  return {
    dateDernierePublication,
    dateDebutMin: formatDateIso(dateDebutMinDate),
  };
}

export async function getBorneCalendrierPublie(
  ligneId?: string,
): Promise<BorneCalendrierPublie> {
  const last = await prisma.astreinte.findFirst({
    where: {
      publie: true,
      statut: { not: StatutAstreinte.ANNULEE },
      ...(ligneId ? { ligneId } : {}),
    },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  return buildBorne(last?.date ?? null);
}

export async function getBornesCalendrierPublieParLigne(): Promise<
  Record<string, BorneCalendrierPublie>
> {
  const rows = await prisma.astreinte.groupBy({
    by: ["ligneId"],
    where: {
      publie: true,
      statut: { not: StatutAstreinte.ANNULEE },
    },
    _max: { date: true },
  });

  const bornes: Record<string, BorneCalendrierPublie> = {};
  for (const row of rows) {
    bornes[row.ligneId] = buildBorne(row._max.date);
  }

  return bornes;
}

export function formatErreurDateDebutCalendrierPublie(
  borne: BorneCalendrierPublie,
  options?: { ligneNom?: string },
): string {
  const scope = options?.ligneNom ? ` pour ${options.ligneNom}` : "";
  return `La date de début ne peut pas être antérieure au calendrier déjà publié${scope} (publié jusqu'au ${borne.dateDernierePublication}, début minimum le ${borne.dateDebutMin}).`;
}

export function estDateDebutApresCalendrierPublie(
  dateDebut: Date,
  borne: BorneCalendrierPublie,
): boolean {
  if (!borne.dateDebutMin) {
    return true;
  }

  return formatDateIso(normalizeUtcDay(dateDebut)) >= borne.dateDebutMin;
}

export async function getErreurDateDebutCalendrierPublie(
  dateDebut: Date,
  ligneId?: string,
): Promise<string | null> {
  const borne = await getBorneCalendrierPublie(ligneId);

  if (estDateDebutApresCalendrierPublie(dateDebut, borne)) {
    return null;
  }

  let ligneNom: string | undefined;
  if (ligneId) {
    const ligne = await prisma.ligneAstreinte.findUnique({
      where: { id: ligneId },
      select: { nom: true },
    });
    ligneNom = ligne?.nom;
  }

  return formatErreurDateDebutCalendrierPublie(borne, { ligneNom });
}

export function ajusterPeriodeApresCalendrierPublie(
  dateDebut: string,
  dateFin: string,
  dateDebutMin: string | null,
): { dateDebut: string; dateFin: string } {
  if (!dateDebutMin || dateDebut >= dateDebutMin) {
    return { dateDebut, dateFin };
  }

  const [sy, sm, sd] = dateDebut.split("-").map(Number);
  const [ey, em, ed] = dateFin.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const dureeJours = Math.max(0, Math.round((end - start) / 86_400_000));

  const [my, mm, md] = dateDebutMin.split("-").map(Number);
  const newStart = new Date(Date.UTC(my, mm - 1, md));
  const newEnd = new Date(newStart);
  newEnd.setUTCDate(newEnd.getUTCDate() + dureeJours);

  return {
    dateDebut: dateDebutMin,
    dateFin: formatDateIso(newEnd),
  };
}
