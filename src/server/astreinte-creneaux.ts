import { Role, TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isIadeDisponibleSurCreneau } from "@/server/disponibilites";
import {
  creneauxDisponiblesPour,
  determinerTypeJour,
  type TypeJour,
} from "@/server/jours-feries";
import type { IadeOption } from "@/server/astreintes";

export const TYPES_CRENEAU_ASTREINTE: TypeCreneau[] = [
  TypeCreneau.NUIT_SEMAINE,
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

export const LIBELLES_TYPE_CRENEAU_ASTREINTE: Record<TypeCreneau, string> = {
  [TypeCreneau.NUIT_SEMAINE]: "Nuit de semaine",
  [TypeCreneau.JOUR_SAMEDI]: "Samedi jour",
  [TypeCreneau.NUIT_SAMEDI]: "Samedi nuit",
  [TypeCreneau.JOUR_DIMANCHE]: "Dimanche jour",
  [TypeCreneau.NUIT_DIMANCHE]: "Dimanche nuit",
  [TypeCreneau.JOUR_FERIE]: "Férié jour",
  [TypeCreneau.NUIT_FERIE]: "Férié nuit",
};

const CRENEAU_JOUR_POUR_NUIT: Partial<Record<TypeCreneau, TypeCreneau>> = {
  [TypeCreneau.NUIT_SAMEDI]: TypeCreneau.JOUR_SAMEDI,
  [TypeCreneau.NUIT_DIMANCHE]: TypeCreneau.JOUR_DIMANCHE,
  [TypeCreneau.NUIT_FERIE]: TypeCreneau.JOUR_FERIE,
};

const CRENEAU_NUIT_POUR_JOUR: Partial<Record<TypeCreneau, TypeCreneau>> = {
  [TypeCreneau.JOUR_SAMEDI]: TypeCreneau.NUIT_SAMEDI,
  [TypeCreneau.JOUR_DIMANCHE]: TypeCreneau.NUIT_DIMANCHE,
  [TypeCreneau.JOUR_FERIE]: TypeCreneau.NUIT_FERIE,
};

/** Libellé affiché pour un type de créneau (points, simulation, planning). */
export function libelleTypeCreneau(typeCreneau: TypeCreneau): string {
  return LIBELLES_TYPE_CRENEAU_ASTREINTE[typeCreneau];
}

/** Créneau jour associé à un créneau nuit scindé (ex. NUIT_SAMEDI → JOUR_SAMEDI). */
export function creneauJourAssocie(typeNuit: TypeCreneau): TypeCreneau | null {
  return CRENEAU_JOUR_POUR_NUIT[typeNuit] ?? null;
}

/** Créneau nuit associé à un créneau jour scindé (ex. JOUR_FERIE → NUIT_FERIE). */
export function creneauNuitAssocie(typeJour: TypeCreneau): TypeCreneau | null {
  return CRENEAU_NUIT_POUR_JOUR[typeJour] ?? null;
}

export function libelleCourtCreneau(typeCreneau: TypeCreneau): string {
  if (typeCreneau === TypeCreneau.NUIT_SEMAINE) {
    return "Nuit";
  }
  if (typeCreneau.startsWith("JOUR_")) {
    return "Jour";
  }
  return "Nuit";
}

export function estCreneauJour(typeCreneau: TypeCreneau): boolean {
  return typeCreneau.startsWith("JOUR_");
}

export function estCreneauNuit(typeCreneau: TypeCreneau): boolean {
  return (
    typeCreneau === TypeCreneau.NUIT_SEMAINE || typeCreneau.startsWith("NUIT_")
  );
}

export function estJourScindeAstreinte(typeCreneau: TypeCreneau): boolean {
  return typeCreneau !== TypeCreneau.NUIT_SEMAINE;
}

/** Conflit = même typeCreneau exact (jour et nuit sont indépendants). */
export function creneauxSeChevauchent(
  a: TypeCreneau,
  b: TypeCreneau,
): boolean {
  return a === b;
}

export function disponibilitesRequises(
  typeCreneau: TypeCreneau,
): TypeCreneau[] {
  return [typeCreneau];
}

export async function getPoidsCreneau(
  ligneId: string,
  typeCreneau: TypeCreneau,
): Promise<number> {
  const record = await prisma.poidsCreneau.findUnique({
    where: {
      ligneId_typeCreneau: { ligneId, typeCreneau },
    },
    select: { poids: true },
  });

  return record?.poids ?? 0;
}

export async function getPoidsParCreneau(
  ligneId: string,
): Promise<Record<TypeCreneau, number>> {
  const records = await prisma.poidsCreneau.findMany({
    where: { ligneId },
    select: { typeCreneau: true, poids: true },
  });

  const result = {
    [TypeCreneau.NUIT_SEMAINE]: 0,
    [TypeCreneau.JOUR_SAMEDI]: 0,
    [TypeCreneau.NUIT_SAMEDI]: 0,
    [TypeCreneau.JOUR_DIMANCHE]: 0,
    [TypeCreneau.NUIT_DIMANCHE]: 0,
    [TypeCreneau.JOUR_FERIE]: 0,
    [TypeCreneau.NUIT_FERIE]: 0,
  } satisfies Record<TypeCreneau, number>;

  for (const record of records) {
    result[record.typeCreneau] = record.poids;
  }

  return result;
}

async function listQualifiedIades(ligneId: string): Promise<IadeOption[]> {
  const qualifications = await prisma.qualification.findMany({
    where: {
      ligneId,
      ligne: { actif: true },
      iade: { role: Role.IADE, actif: true },
    },
    include: {
      iade: { select: { id: true, nom: true, prenom: true } },
    },
    orderBy: [{ iade: { nom: "asc" } }, { iade: { prenom: "asc" } }],
  });

  return qualifications.map((qualification) => qualification.iade);
}

export async function isIadeEligiblePourCreneau(
  iadeId: string,
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
): Promise<boolean> {
  const disponible = await isIadeDisponibleSurCreneau(
    iadeId,
    ligneId,
    date,
    typeCreneau,
  );

  return disponible;
}

export async function getEligibleIadesPourCreneau(
  ligneId: string,
  date: Date,
  typeCreneau: TypeCreneau,
): Promise<IadeOption[]> {
  const qualified = await listQualifiedIades(ligneId);
  const eligible: IadeOption[] = [];

  for (const iade of qualified) {
    if (await isIadeEligiblePourCreneau(iade.id, ligneId, date, typeCreneau)) {
      eligible.push(iade);
    }
  }

  return eligible;
}

export type AstreinteFormCreneauSlot = {
  typeCreneau: TypeCreneau;
  libelle: string;
  poids: number;
  iadesEligibles: IadeOption[];
};

export type AstreinteFormContext = {
  typeJour: TypeJour;
  creneaux: AstreinteFormCreneauSlot[];
};

export async function getAstreinteFormContext(
  dateValue: string,
  ligneId: string,
): Promise<AstreinteFormContext | { error: string }> {
  const { parseDateInput } = await import("@/server/astreintes");
  const date = parseDateInput(dateValue);

  if (!date) {
    return { error: "Date invalide." };
  }

  const ligne = await prisma.ligneAstreinte.findFirst({
    where: { id: ligneId, actif: true },
    select: { id: true },
  });

  if (!ligne) {
    return { error: "Ligne introuvable ou inactive." };
  }

  const typeJour = await determinerTypeJour(date);
  const typesCreneau = creneauxDisponiblesPour(typeJour);
  const poidsParCreneau = await getPoidsParCreneau(ligneId);

  const creneaux = await Promise.all(
    typesCreneau.map(async (typeCreneau) => ({
      typeCreneau,
      libelle: libelleCourtCreneau(typeCreneau),
      poids: poidsParCreneau[typeCreneau],
      iadesEligibles: await getEligibleIadesPourCreneau(
        ligneId,
        date,
        typeCreneau,
      ),
    })),
  );

  return {
    typeJour,
    creneaux,
  };
}

export function getDimancheFromSamedi(samedi: Date): Date {
  const dimanche = new Date(samedi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 1);
  return dimanche;
}
