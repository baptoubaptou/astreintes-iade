import {
  Prisma,
  Role,
  StatutAstreinte,
  StatutDemandeEchange,
  StatutOffreAstreinte,
  TypeActionAudit,
  TypeCreneau,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  creneauxSeChevauchent,
} from "@/server/astreinte-creneaux";
import { calculerPointsAttribues } from "@/server/points";
import {
  type AstreintePointsInput,
} from "@/server/bonus-continuite";
import { journaliser } from "@/server/audit";
import {
  resumeAstreinteAnnulee,
  resumeAstreinteCreee,
  resumeAstreinteModifiee,
} from "@/server/audit-resumes";
import {
  notifierChangementAstreinteCampagneConfirmee,
  trouverCampagneConfirmeePourAstreinte,
} from "@/server/astreinte-campagne-changement";
import {
  creneauxDisponiblesPour,
  determinerTypeJour,
} from "@/server/jours-feries";

export type AstreinteListItem = {
  id: string;
  date: string;
  typeCreneau: TypeCreneau;
  pointsAttribues: number;
  statut: StatutAstreinte;
  publie: boolean;
  datePublication: string | null;
  ligne: { id: string; nom: string };
  iade: { id: string; nom: string; prenom: string };
};

export type AstreinteVisibilite = "toutes" | "publiees_seulement";

export type LigneOption = {
  id: string;
  nom: string;
};

export type IadeOption = {
  id: string;
  nom: string;
  prenom: string;
};

export type CreateAstreinteInput = {
  date: string;
  ligneId: string;
  iadeId?: string;
  iadeIdJour?: string;
  iadeIdNuit?: string;
};

export type UpdateAstreinteInput = {
  date?: string;
  ligneId?: string;
  iadeId?: string;
};

export type AstreinteErrorCode =
  | "DOUBLE_AFFECTATION"
  | "DISPONIBILITE_MANQUANTE"
  | "QUALIFICATION_MANQUANTE"
  | "LIGNE_SLOT_OCCUPE"
  | "INVALID_INPUT"
  | "ASTREINTE_NOT_FOUND"
  | "ECHANGE_EN_COURS"
  | "ASTREINTE_DEJA_ANNULEE";

export type AstreinteField =
  | "date"
  | "ligneId"
  | "iadeId"
  | "iadeIdJour"
  | "iadeIdNuit";

export type AstreinteServiceError = {
  success: false;
  error: {
    code: AstreinteErrorCode;
    message: string;
    field?: AstreinteField;
  };
};

export type AstreinteValidationError = {
  error: string;
  field?: AstreinteField;
};

const astreinteInclude = {
  ligne: { select: { id: true, nom: true } },
  iade: { select: { id: true, nom: true, prenom: true } },
} as const;

function serviceError(
  code: AstreinteErrorCode,
  message: string,
  field?: AstreinteField,
): AstreinteServiceError {
  return { success: false, error: { code, message, field } };
}

export function formatMois(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMoisParam(mois?: string | null): {
  year: number;
  month: number;
  value: string;
} {
  const now = new Date();
  const fallback = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };

  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
    return { ...fallback, value: formatMois(fallback.year, fallback.month) };
  }

  const [year, month] = mois.split("-").map(Number);
  if (!year || month < 1 || month > 12) {
    return { ...fallback, value: formatMois(fallback.year, fallback.month) };
  }

  return { year, month, value: formatMois(year, month) };
}

export function shiftMois(
  mois: string,
  delta: number,
): { value: string; label: string } {
  const { year, month } = parseMoisParam(mois);
  const date = new Date(year, month - 1 + delta, 1);
  const value = formatMois(date.getFullYear(), date.getMonth() + 1);
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export function getMonthUtcRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateFr(date: Date | string): string {
  const value = typeof date === "string" ? parseDateInput(date) : date;
  if (!value) {
    return String(date);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function mapAstreinte(astreinte: {
  id: string;
  date: Date;
  typeCreneau: TypeCreneau;
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

function filtreVisibiliteAstreintes(visibilite?: AstreinteVisibilite) {
  return visibilite === "publiees_seulement" ? { publie: true } : {};
}

export function validateCreateAstreinteInput(
  input: Record<string, unknown>,
): CreateAstreinteInput | AstreinteValidationError {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const ligneId = typeof input.ligneId === "string" ? input.ligneId.trim() : "";
  const iadeId = typeof input.iadeId === "string" ? input.iadeId.trim() : "";
  const iadeIdJour =
    typeof input.iadeIdJour === "string" ? input.iadeIdJour.trim() : "";
  const iadeIdNuit =
    typeof input.iadeIdNuit === "string" ? input.iadeIdNuit.trim() : "";

  if (!date || !parseDateInput(date)) {
    return { error: "La date est invalide.", field: "date" };
  }

  if (!ligneId) {
    return { error: "La ligne est requise.", field: "ligneId" };
  }

  if (iadeIdJour || iadeIdNuit) {
    if (!iadeIdJour && !iadeIdNuit) {
      return {
        error: "Sélectionnez au moins un IADE pour un créneau.",
        field: "iadeIdJour",
      };
    }

    return {
      date,
      ligneId,
      iadeIdJour: iadeIdJour || undefined,
      iadeIdNuit: iadeIdNuit || undefined,
    };
  }

  if (!iadeId) {
    return { error: "L'IADE est requis.", field: "iadeId" };
  }

  return {
    date,
    ligneId,
    iadeId,
  };
}

export function validateUpdateAstreinteInput(
  input: Record<string, unknown>,
): UpdateAstreinteInput | AstreinteValidationError {
  const data: UpdateAstreinteInput = {};

  if (input.date !== undefined) {
    const date = typeof input.date === "string" ? input.date.trim() : "";
    if (!date || !parseDateInput(date)) {
      return { error: "La date est invalide.", field: "date" };
    }
    data.date = date;
  }

  if (input.ligneId !== undefined) {
    const ligneId = typeof input.ligneId === "string" ? input.ligneId.trim() : "";
    if (!ligneId) {
      return { error: "La ligne est requise.", field: "ligneId" };
    }
    data.ligneId = ligneId;
  }

  if (input.iadeId !== undefined) {
    const iadeId = typeof input.iadeId === "string" ? input.iadeId.trim() : "";
    if (!iadeId) {
      return { error: "L'IADE est requis.", field: "iadeId" };
    }
    data.iadeId = iadeId;
  }

  if (!data.date && !data.ligneId && !data.iadeId) {
    return { error: "Aucun champ à modifier." };
  }

  return data;
}

async function assertQualification(
  iadeId: string,
  ligneId: string,
  ligneNom: string,
): Promise<AstreinteServiceError | null> {
  const qualification = await prisma.qualification.findUnique({
    where: { iadeId_ligneId: { iadeId, ligneId } },
    include: { iade: { select: { actif: true, role: true } } },
  });

  if (
    !qualification ||
    !qualification.iade.actif ||
    qualification.iade.role !== Role.IADE
  ) {
    return serviceError(
      "QUALIFICATION_MANQUANTE",
      `Cet IADE n'est pas qualifié pour la ligne ${ligneNom}.`,
      "iadeId",
    );
  }

  return null;
}


async function findLigneConflict(
  ligneId: string,
  date: Date,
  excludeAstreinteId?: string,
) {
  return prisma.astreinte.findMany({
    where: {
      ligneId,
      date,
      statut: { not: StatutAstreinte.ANNULEE },
      ...(excludeAstreinteId ? { id: { not: excludeAstreinteId } } : {}),
    },
  });
}

async function validateAstreinteCoherence(options: {
  date: Date;
  ligneId: string;
  iadeId: string;
  typeCreneau: TypeCreneau;
  excludeAstreinteId?: string;
  strictDisponibilite?: boolean;
}): Promise<AstreinteServiceError | null> {
  const ligne = await prisma.ligneAstreinte.findFirst({
    where: { id: options.ligneId, actif: true },
    select: { id: true, nom: true },
  });

  if (!ligne) {
    return serviceError(
      "INVALID_INPUT",
      "Ligne introuvable ou inactive.",
      "ligneId",
    );
  }

  const qualifError = await assertQualification(
    options.iadeId,
    options.ligneId,
    ligne.nom,
  );
  if (qualifError) {
    return qualifError;
  }

  const affectationsIade = await prisma.astreinte.findMany({
    where: {
      iadeId: options.iadeId,
      date: options.date,
      statut: { not: StatutAstreinte.ANNULEE },
      ...(options.excludeAstreinteId
        ? { id: { not: options.excludeAstreinteId } }
        : {}),
    },
    include: { ligne: { select: { nom: true } } },
  });

  for (const affectation of affectationsIade) {
    if (creneauxSeChevauchent(affectation.typeCreneau, options.typeCreneau)) {
      return serviceError(
        "DOUBLE_AFFECTATION",
        `Cet IADE est déjà affecté le ${formatDateFr(options.date)} (${affectation.typeCreneau}) sur la ligne ${affectation.ligne.nom}.`,
        "iadeId",
      );
    }
  }

  const astreintesLigne = await findLigneConflict(
    options.ligneId,
    options.date,
    options.excludeAstreinteId,
  );

  for (const astreinte of astreintesLigne) {
    if (creneauxSeChevauchent(astreinte.typeCreneau, options.typeCreneau)) {
      return serviceError(
        "LIGNE_SLOT_OCCUPE",
        `Une astreinte ${astreinte.typeCreneau} existe déjà pour la ligne ${ligne.nom} le ${formatDateFr(options.date)}.`,
        "ligneId",
      );
    }
  }

  if (options.strictDisponibilite) {
    const { isIadeEligiblePourCreneau } = await import(
      "@/server/astreinte-creneaux"
    );
    const eligible = await isIadeEligiblePourCreneau(
      options.iadeId,
      options.ligneId,
      options.date,
      options.typeCreneau,
    );
    if (!eligible) {
      return serviceError(
        "DISPONIBILITE_MANQUANTE",
        `Cet IADE n'a pas déclaré le créneau ${options.typeCreneau} disponible pour cette ligne le ${formatDateFr(options.date)}.`,
        "iadeId",
      );
    }
  }

  return null;
}

export async function validateAstreinteCoherenceStrict(options: {
  date: Date;
  ligneId: string;
  iadeId: string;
  typeCreneau?: TypeCreneau;
  excludeAstreinteId?: string;
}): Promise<AstreinteServiceError | null> {
  return validateAstreinteCoherence({
    ...options,
    typeCreneau: options.typeCreneau ?? TypeCreneau.NUIT_SEMAINE,
    strictDisponibilite: true,
  });
}

async function collectDisponibiliteWarnings(
  assignments: Array<{
    iadeId: string;
    ligneId: string;
    date: Date;
    typeCreneau: TypeCreneau;
  }>,
): Promise<string | undefined> {
  const { getDisponibiliteWarningForDate } = await import(
    "@/server/disponibilites"
  );
  const warnings: string[] = [];

  for (const assignment of assignments) {
    const warning = await getDisponibiliteWarningForDate(
      assignment.iadeId,
      assignment.date,
      assignment.ligneId,
      assignment.typeCreneau,
    );
    if (warning && !warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  return warnings.length > 0 ? warnings.join(" ") : undefined;
}

type AstreinteCreateSpec = {
  date: Date;
  ligneId: string;
  iadeId: string;
  typeCreneau: TypeCreneau;
};

async function createAstreinteRecord(
  spec: AstreintePointsInput,
): Promise<AstreinteListItem> {
  const astreinte = await prisma.astreinte.create({
    data: {
      date: spec.date,
      ligneId: spec.ligneId,
      iadeId: spec.iadeId,
      typeCreneau: spec.typeCreneau,
      pointsAttribues: spec.pointsAttribues,
      statut: StatutAstreinte.PLANIFIEE,
      publie: false,
    },
    include: astreinteInclude,
  });

  return mapAstreinte(astreinte);
}

async function preparerCreations(
  specs: AstreinteCreateSpec[],
): Promise<AstreintePointsInput[]> {
  return Promise.all(
    specs.map(async (spec) => ({
      date: spec.date,
      ligneId: spec.ligneId,
      iadeId: spec.iadeId,
      typeCreneau: spec.typeCreneau,
      pointsAttribues: await calculerPointsAttribues(
        spec.ligneId,
        spec.typeCreneau,
      ),
    })),
  );
}

export async function listAstreintes(options: {
  mois: string;
  ligneId?: string;
  iadeId?: string;
  visibilite?: AstreinteVisibilite;
}): Promise<AstreinteListItem[]> {
  const { year, month } = parseMoisParam(options.mois);
  const { start, end } = getMonthUtcRange(year, month);

  const astreintes = await prisma.astreinte.findMany({
    where: {
      date: { gte: start, lt: end },
      statut: { not: StatutAstreinte.ANNULEE },
      ...filtreVisibiliteAstreintes(options.visibilite),
      ...(options.ligneId ? { ligneId: options.ligneId } : {}),
      ...(options.iadeId ? { iadeId: options.iadeId } : {}),
    },
    include: astreinteInclude,
    orderBy: [{ date: "asc" }, { ligneId: "asc" }, { typeCreneau: "asc" }],
  });

  return astreintes.map(mapAstreinte);
}

export async function listAstreintesInRange(
  start: Date,
  end: Date,
  options?: { visibilite?: AstreinteVisibilite },
): Promise<AstreinteListItem[]> {
  const astreintes = await prisma.astreinte.findMany({
    where: {
      date: { gte: start, lt: end },
      statut: { not: StatutAstreinte.ANNULEE },
      ...filtreVisibiliteAstreintes(options?.visibilite),
    },
    include: astreinteInclude,
    orderBy: [{ date: "asc" }, { ligneId: "asc" }, { typeCreneau: "asc" }],
  });

  return astreintes.map(mapAstreinte);
}

export async function getAstreinteById(
  id: string,
): Promise<AstreinteListItem | null> {
  const astreinte = await prisma.astreinte.findUnique({
    where: { id },
    include: astreinteInclude,
  });

  return astreinte ? mapAstreinte(astreinte) : null;
}

export async function getActiveLignesOptions(): Promise<LigneOption[]> {
  return prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true },
  });
}

export async function getActiveIadesOptions(): Promise<IadeOption[]> {
  return prisma.utilisateur.findMany({
    where: { role: Role.IADE, actif: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    select: { id: true, nom: true, prenom: true },
  });
}

export async function getQualifiedIadesByLigne(): Promise<
  Record<string, IadeOption[]>
> {
  const qualifications = await prisma.qualification.findMany({
    where: {
      ligne: { actif: true },
      iade: { role: Role.IADE, actif: true },
    },
    include: {
      iade: { select: { id: true, nom: true, prenom: true } },
      ligne: { select: { id: true } },
    },
    orderBy: [{ iade: { nom: "asc" } }, { iade: { prenom: "asc" } }],
  });

  const map: Record<string, IadeOption[]> = {};

  for (const qualification of qualifications) {
    if (!map[qualification.ligneId]) {
      map[qualification.ligneId] = [];
    }
    map[qualification.ligneId].push(qualification.iade);
  }

  return map;
}

export async function createAstreinte(
  input: CreateAstreinteInput,
  acteurId: string,
): Promise<
  | { astreintes: AstreinteListItem[]; warning?: string }
  | AstreinteServiceError
> {
  const date = parseDateInput(input.date);
  if (!date) {
    return serviceError("INVALID_INPUT", "La date est invalide.", "date");
  }

  const typeJour = await determinerTypeJour(date);
  const creneauxAutorises = creneauxDisponiblesPour(typeJour);
  const specs: AstreinteCreateSpec[] = [];

  if (creneauxAutorises.length === 1) {
    if (!input.iadeId) {
      return serviceError(
        "INVALID_INPUT",
        "L'IADE est requis pour ce créneau.",
        "iadeId",
      );
    }

    specs.push({
      date,
      ligneId: input.ligneId,
      iadeId: input.iadeId,
      typeCreneau: creneauxAutorises[0],
    });
  } else {
    const [creneauJour, creneauNuit] = creneauxAutorises;

    if (input.iadeIdJour) {
      specs.push({
        date,
        ligneId: input.ligneId,
        iadeId: input.iadeIdJour,
        typeCreneau: creneauJour,
      });
    }

    if (input.iadeIdNuit) {
      specs.push({
        date,
        ligneId: input.ligneId,
        iadeId: input.iadeIdNuit,
        typeCreneau: creneauNuit,
      });
    }

    if (specs.length === 0) {
      return serviceError(
        "INVALID_INPUT",
        "Sélectionnez au moins un IADE pour un créneau.",
        "iadeIdJour",
      );
    }
  }

  for (const spec of specs) {
    const coherenceError = await validateAstreinteCoherence({
      date: spec.date,
      ligneId: spec.ligneId,
      iadeId: spec.iadeId,
      typeCreneau: spec.typeCreneau,
    });
    if (coherenceError) {
      return coherenceError;
    }
  }

  try {
    const creations = await preparerCreations(specs);

    const created = await prisma.$transaction(async () => {
      const results: AstreinteListItem[] = [];
      for (const creation of creations) {
        results.push(await createAstreinteRecord(creation));
      }
      return results;
    });

    for (const astreinte of created) {
      await journaliser({
        acteurId,
        typeAction: TypeActionAudit.ASTREINTE_CREEE,
        iadeConcerneId: astreinte.iade.id,
        resume: resumeAstreinteCreee({
          iadePrenom: astreinte.iade.prenom,
          iadeNom: astreinte.iade.nom,
          ligneNom: astreinte.ligne.nom,
          date: astreinte.date,
          typeCreneau: astreinte.typeCreneau,
        }),
        detail: {
          astreinteId: astreinte.id,
          ligneId: astreinte.ligne.id,
          date: astreinte.date,
          typeCreneau: astreinte.typeCreneau,
        },
      });
    }

    const warning = await collectDisponibiliteWarnings(
      specs.map((spec) => ({
        iadeId: spec.iadeId,
        ligneId: spec.ligneId,
        date: spec.date,
        typeCreneau: spec.typeCreneau,
      })),
    );

    return { astreintes: created, warning };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return serviceError(
        "LIGNE_SLOT_OCCUPE",
        "Une astreinte existe déjà pour cette ligne et ce créneau à la date sélectionnée.",
        "ligneId",
      );
    }

    throw error;
  }
}

export async function updateAstreinte(
  id: string,
  input: UpdateAstreinteInput,
  acteurId: string,
): Promise<
  { astreinte: AstreinteListItem; warning?: string } | AstreinteServiceError
> {
  const existing = await prisma.astreinte.findUnique({
    where: { id },
    include: astreinteInclude,
  });

  if (!existing) {
    return serviceError("ASTREINTE_NOT_FOUND", "Astreinte introuvable.");
  }

  if (existing.statut === StatutAstreinte.ANNULEE) {
    return serviceError(
      "ASTREINTE_DEJA_ANNULEE",
      "Cette astreinte est déjà annulée et ne peut plus être modifiée.",
    );
  }

  const mergedDate = input.date ?? existing.date.toISOString().slice(0, 10);
  const mergedLigneId = input.ligneId ?? existing.ligneId;
  const mergedIadeId = input.iadeId ?? existing.iadeId;
  const date = parseDateInput(mergedDate);

  if (!date) {
    return serviceError("INVALID_INPUT", "La date est invalide.", "date");
  }

  const typeJour = await determinerTypeJour(date);
  const creneauxAutorises = creneauxDisponiblesPour(typeJour);
  if (!creneauxAutorises.includes(existing.typeCreneau)) {
    return serviceError(
      "INVALID_INPUT",
      `Le créneau ${existing.typeCreneau} n'est pas valide pour un jour de type ${typeJour}.`,
      "date",
    );
  }

  const coherenceError = await validateAstreinteCoherence({
    date,
    ligneId: mergedLigneId,
    iadeId: mergedIadeId,
    typeCreneau: existing.typeCreneau,
    excludeAstreinteId: id,
  });

  if (coherenceError) {
    return coherenceError;
  }

  const ligneChanged = mergedLigneId !== existing.ligneId;
  const dateChanged =
    date.toISOString().slice(0, 10) !==
    existing.date.toISOString().slice(0, 10);
  const pointsAttribues =
    ligneChanged || dateChanged
      ? await calculerPointsAttribues(mergedLigneId, existing.typeCreneau)
      : existing.pointsAttribues;

  const campagneConfirmee = await trouverCampagneConfirmeePourAstreinte(
    existing.ligneId,
    existing.date,
  );

  try {
    const updated = await prisma.astreinte.update({
      where: { id },
      data: {
        date,
        ligneId: mergedLigneId,
        iadeId: mergedIadeId,
        pointsAttribues,
      },
      include: astreinteInclude,
    });

    const astreinte = mapAstreinte(updated);

    await journaliser({
      acteurId,
      typeAction: TypeActionAudit.ASTREINTE_MODIFIEE,
      iadeConcerneId: astreinte.iade.id,
      resume: resumeAstreinteModifiee({
        iadePrenom: astreinte.iade.prenom,
        iadeNom: astreinte.iade.nom,
        ligneNom: astreinte.ligne.nom,
        date: astreinte.date,
        typeCreneau: astreinte.typeCreneau,
        campagneConfirmee: campagneConfirmee !== null,
      }),
      detail: {
        astreinteId: astreinte.id,
        ligneId: astreinte.ligne.id,
        date: astreinte.date,
        typeCreneau: astreinte.typeCreneau,
        ...(campagneConfirmee
          ? { fenetreId: campagneConfirmee.id, campagneConfirmee: true }
          : {}),
      },
    });

    if (campagneConfirmee) {
      await notifierChangementAstreinteCampagneConfirmee({
        type: "modification",
        avant: existing,
        apres: astreinte,
        acteurId,
        campagne: campagneConfirmee,
      });
    }

    const warning = await collectDisponibiliteWarnings([
      {
        iadeId: mergedIadeId,
        ligneId: mergedLigneId,
        date,
        typeCreneau: existing.typeCreneau,
      },
    ]);

    return { astreinte, warning };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return serviceError(
        "LIGNE_SLOT_OCCUPE",
        "Une astreinte existe déjà pour cette ligne et ce créneau à la date sélectionnée.",
        "ligneId",
      );
    }

    throw error;
  }
}

export async function cancelAstreinte(
  id: string,
  acteurId: string,
): Promise<{ astreinte: AstreinteListItem } | AstreinteServiceError> {
  const existing = await prisma.astreinte.findUnique({
    where: { id },
    include: astreinteInclude,
  });

  if (!existing) {
    return serviceError("ASTREINTE_NOT_FOUND", "Astreinte introuvable.");
  }

  if (existing.statut === StatutAstreinte.ANNULEE) {
    return serviceError(
      "ASTREINTE_DEJA_ANNULEE",
      "Cette astreinte est déjà annulée.",
    );
  }

  const [demandeEnCours, offreOuverte] = await Promise.all([
    prisma.demandeEchange.findFirst({
      where: {
        astreinteId: id,
        statut: StatutDemandeEchange.EN_ATTENTE,
      },
    }),
    prisma.offreAstreinte.findFirst({
      where: {
        astreinteId: id,
        statut: StatutOffreAstreinte.OUVERTE,
      },
    }),
  ]);

  if (demandeEnCours || offreOuverte) {
    return serviceError(
      "ECHANGE_EN_COURS",
      "Impossible : une demande d'échange / offre est en cours sur cette astreinte, traitez-la d'abord.",
    );
  }

  const campagneConfirmee = await trouverCampagneConfirmeePourAstreinte(
    existing.ligneId,
    existing.date,
  );

  const updated = await prisma.astreinte.update({
    where: { id },
    data: { statut: StatutAstreinte.ANNULEE },
    include: astreinteInclude,
  });

  const astreinte = mapAstreinte(updated);

  await journaliser({
    acteurId,
    typeAction: TypeActionAudit.ASTREINTE_ANNULEE,
    iadeConcerneId: astreinte.iade.id,
    resume: resumeAstreinteAnnulee({
      iadePrenom: astreinte.iade.prenom,
      iadeNom: astreinte.iade.nom,
      ligneNom: astreinte.ligne.nom,
      date: astreinte.date,
      typeCreneau: astreinte.typeCreneau,
      campagneConfirmee: campagneConfirmee !== null,
    }),
    detail: {
      astreinteId: astreinte.id,
      ligneId: astreinte.ligne.id,
      date: astreinte.date,
      typeCreneau: astreinte.typeCreneau,
      ...(campagneConfirmee
        ? { fenetreId: campagneConfirmee.id, campagneConfirmee: true }
        : {}),
    },
  });

  if (campagneConfirmee) {
    await notifierChangementAstreinteCampagneConfirmee({
      type: "annulation",
      avant: existing,
      acteurId,
      campagne: campagneConfirmee,
    });
  }

  return { astreinte };
}
