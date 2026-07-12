import { Prisma, TypeActionAudit } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ACTEUR_SYSTEME_VALUE,
  LIBELLES_TYPE_ACTION_AUDIT,
  TYPES_ACTION_AUDIT,
} from "@/lib/journal-audit-constants";
import type { IadeOption } from "@/server/astreintes";

export {
  ACTEUR_SYSTEME_VALUE,
  LIBELLES_TYPE_ACTION_AUDIT,
  TYPES_ACTION_AUDIT,
};

export type UtilisateurOption = {
  id: string;
  nom: string;
  prenom: string;
  role: string;
};

export type JournalAuditListItem = {
  id: string;
  dateAction: string;
  acteur: { id: string; prenom: string; nom: string } | null;
  typeAction: TypeActionAudit;
  typeActionLabel: string;
  iadeConcerne: { id: string; prenom: string; nom: string } | null;
  resume: string;
  detail: unknown | null;
};

export type JournalAuditListResult = {
  items: JournalAuditListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type JournalAuditFilters = {
  page?: number;
  pageSize?: number;
  iadeConcerneId?: string;
  typeAction?: TypeActionAudit;
  dateDebut?: string;
  dateFin?: string;
  acteurId?: string;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseDateInput(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max?: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (max !== undefined) {
    return Math.min(parsed, max);
  }

  return parsed;
}

function isTypeActionAudit(value: string): value is TypeActionAudit {
  return (TYPES_ACTION_AUDIT as string[]).includes(value);
}

function mapJournalEntry(record: {
  id: string;
  dateAction: Date;
  typeAction: TypeActionAudit;
  resume: string;
  detail: Prisma.JsonValue | null;
  acteur: { id: string; prenom: string; nom: string } | null;
  iadeConcerne: { id: string; prenom: string; nom: string } | null;
}): JournalAuditListItem {
  return {
    id: record.id,
    dateAction: record.dateAction.toISOString(),
    acteur: record.acteur,
    typeAction: record.typeAction,
    typeActionLabel: LIBELLES_TYPE_ACTION_AUDIT[record.typeAction],
    iadeConcerne: record.iadeConcerne,
    resume: record.resume,
    detail: record.detail,
  };
}

export function parseJournalAuditFilters(
  searchParams: URLSearchParams,
): JournalAuditFilters {
  const typeActionRaw = searchParams.get("typeAction") ?? undefined;
  const typeAction =
    typeActionRaw && isTypeActionAudit(typeActionRaw)
      ? typeActionRaw
      : undefined;

  return {
    page: parsePositiveInt(searchParams.get("page") ?? undefined, 1),
    pageSize: parsePositiveInt(
      searchParams.get("pageSize") ?? undefined,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
    iadeConcerneId: searchParams.get("iadeConcerneId") ?? undefined,
    typeAction,
    dateDebut: searchParams.get("dateDebut") ?? undefined,
    dateFin: searchParams.get("dateFin") ?? undefined,
    acteurId: searchParams.get("acteurId") ?? undefined,
  };
}

export async function listJournalAudit(
  filters: JournalAuditFilters,
): Promise<JournalAuditListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const where: Prisma.JournalAuditWhereInput = {};

  if (filters.iadeConcerneId) {
    where.iadeConcerneId = filters.iadeConcerneId;
  }

  if (filters.typeAction) {
    where.typeAction = filters.typeAction;
  }

  if (filters.acteurId) {
    if (filters.acteurId === ACTEUR_SYSTEME_VALUE) {
      where.acteurId = null;
    } else {
      where.acteurId = filters.acteurId;
    }
  }

  const dateDebut = parseDateInput(filters.dateDebut);
  const dateFin = parseDateInput(filters.dateFin);

  if (dateDebut || dateFin) {
    where.dateAction = {
      ...(dateDebut ? { gte: dateDebut } : {}),
      ...(dateFin
        ? {
            lt: new Date(
              Date.UTC(
                dateFin.getUTCFullYear(),
                dateFin.getUTCMonth(),
                dateFin.getUTCDate() + 1,
              ),
            ),
          }
        : {}),
    };
  }

  const [total, records] = await Promise.all([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({
      where,
      include: {
        acteur: { select: { id: true, prenom: true, nom: true } },
        iadeConcerne: { select: { id: true, prenom: true, nom: true } },
      },
      orderBy: { dateAction: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items: records.map(mapJournalEntry),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function listActeursOptions(): Promise<UtilisateurOption[]> {
  return prisma.utilisateur.findMany({
    where: { actif: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    select: { id: true, nom: true, prenom: true, role: true },
  });
}

export async function getJournalFilterOptions(): Promise<{
  iades: IadeOption[];
  utilisateurs: UtilisateurOption[];
}> {
  const { getActiveIadesOptions } = await import("@/server/astreintes");
  const [iades, utilisateurs] = await Promise.all([
    getActiveIadesOptions(),
    listActeursOptions(),
  ]);

  return { iades, utilisateurs };
}
