import {
  TypeBonusContinuite,
  TypeCreneau,
  TypePreferenceContinuite,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  estCreneauJour,
  estCreneauNuit,
} from "@/server/astreinte-creneaux";
import { formatDateKey } from "@/server/jours-feries";

export const LIBELLES_BONUS_CONTINUITE: Record<TypeBonusContinuite, string> = {
  [TypeBonusContinuite.JOUR_NUIT]: "Bonus 24h (jour + nuit)",
  [TypeBonusContinuite.WEEKEND_48H]: "Bonus week-end complet (48h)",
};

export const TYPES_BONUS_CONTINUITE: TypeBonusContinuite[] = [
  TypeBonusContinuite.JOUR_NUIT,
  TypeBonusContinuite.WEEKEND_48H,
];

export type AstreintePointsInput = {
  date: Date;
  ligneId: string;
  iadeId: string;
  typeCreneau: TypeCreneau;
  pointsAttribues: number;
};

/** Données minimales pour détecter les bonus de continuité à la lecture. */
export type AstreintePourBonusContinuite = {
  date: Date;
  ligneId: string;
  typeCreneau: TypeCreneau;
};

export type BonusContinuiteLigne = {
  ligneId: string;
  ligneNom: string;
  bonus: Record<
    TypeBonusContinuite,
    { id: string | null; valeur: number }
  >;
};

export async function getBonusContinuite(
  ligneId: string,
  type: TypeBonusContinuite,
): Promise<number> {
  const record = await prisma.bonusContinuite.findUnique({
    where: {
      ligneId_type: { ligneId, type },
    },
    select: { bonus: true },
  });

  return record?.bonus ?? 0;
}

export async function getBonusContinuiteMatrix(): Promise<BonusContinuiteLigne[]> {
  const lignes = await prisma.ligneAstreinte.findMany({
    where: { actif: true },
    orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true },
  });

  const records = await prisma.bonusContinuite.findMany({
    select: { id: true, ligneId: true, type: true, bonus: true },
  });

  return lignes.map((ligne) => {
    const bonus = {
      [TypeBonusContinuite.JOUR_NUIT]: { id: null as string | null, valeur: 0 },
      [TypeBonusContinuite.WEEKEND_48H]: { id: null as string | null, valeur: 0 },
    };

    for (const type of TYPES_BONUS_CONTINUITE) {
      const record = records.find(
        (entry) => entry.ligneId === ligne.id && entry.type === type,
      );
      if (record) {
        bonus[type] = { id: record.id, valeur: record.bonus };
      }
    }

    return {
      ligneId: ligne.id,
      ligneNom: ligne.nom,
      bonus,
    };
  });
}

export function paireJourNuit(types: TypeCreneau[]): boolean {
  return (
    types.some((type) => estCreneauJour(type)) &&
    types.some((type) => estCreneauNuit(type) && type !== TypeCreneau.NUIT_SEMAINE)
  );
}

export function typesWeekend48h(): TypeCreneau[] {
  return [
    TypeCreneau.JOUR_SAMEDI,
    TypeCreneau.NUIT_SAMEDI,
    TypeCreneau.JOUR_DIMANCHE,
    TypeCreneau.NUIT_DIMANCHE,
  ];
}

export function aWeekend48hComplet(types: TypeCreneau[]): boolean {
  const attendus = typesWeekend48h();
  return attendus.every((type) => types.includes(type));
}

function samediDuWeekend(date: Date): Date {
  if (date.getUTCDay() === 6) {
    return date;
  }

  const samedi = new Date(date);
  samedi.setUTCDate(samedi.getUTCDate() - 1);
  return samedi;
}

function bonusParDefaut(): Record<TypeBonusContinuite, number> {
  return {
    [TypeBonusContinuite.JOUR_NUIT]: 0,
    [TypeBonusContinuite.WEEKEND_48H]: 0,
  };
}

export async function chargerBonusContinuiteParLigne(): Promise<
  Map<string, Record<TypeBonusContinuite, number>>
> {
  const records = await prisma.bonusContinuite.findMany({
    select: { ligneId: true, type: true, bonus: true },
  });

  const map = new Map<string, Record<TypeBonusContinuite, number>>();

  for (const record of records) {
    if (!map.has(record.ligneId)) {
      map.set(record.ligneId, bonusParDefaut());
    }

    map.get(record.ligneId)![record.type] = record.bonus;
  }

  return map;
}

/**
 * Calcule le bonus de continuité pour une ligne à partir des astreintes
 * (non annulées) d'un même IADE. Le bonus 48h remplace les deux bonus 24h.
 */
export function calculerBonusContinuitePourLigne(
  astreintes: AstreintePourBonusContinuite[],
  ligneId: string,
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>,
): number {
  const bonuses = bonusParLigne.get(ligneId) ?? bonusParDefaut();
  const ligneAstreintes = astreintes.filter(
    (astreinte) => astreinte.ligneId === ligneId,
  );

  if (ligneAstreintes.length === 0) {
    return 0;
  }

  let totalBonus = 0;
  const datesAvecBonus48h = new Set<string>();
  const groupesWeekend = new Map<string, AstreintePourBonusContinuite[]>();

  for (const astreinte of ligneAstreintes) {
    const day = astreinte.date.getUTCDay();
    if (day !== 6 && day !== 0) {
      continue;
    }

    const groupKey = formatDateKey(samediDuWeekend(astreinte.date));
    const groupe = groupesWeekend.get(groupKey) ?? [];
    groupe.push(astreinte);
    groupesWeekend.set(groupKey, groupe);
  }

  for (const groupe of groupesWeekend.values()) {
    const types = groupe.map((astreinte) => astreinte.typeCreneau);
    if (!aWeekend48hComplet(types)) {
      continue;
    }

    const bonus48h = bonuses[TypeBonusContinuite.WEEKEND_48H];
    if (bonus48h <= 0) {
      continue;
    }

    totalBonus += bonus48h;
    for (const astreinte of groupe) {
      datesAvecBonus48h.add(formatDateKey(astreinte.date));
    }
  }

  const groupesJour = new Map<string, AstreintePourBonusContinuite[]>();
  for (const astreinte of ligneAstreintes) {
    const dateKey = formatDateKey(astreinte.date);
    if (datesAvecBonus48h.has(dateKey)) {
      continue;
    }

    const groupe = groupesJour.get(dateKey) ?? [];
    groupe.push(astreinte);
    groupesJour.set(dateKey, groupe);
  }

  for (const groupe of groupesJour.values()) {
    if (groupe.length < 2) {
      continue;
    }

    const types = groupe.map((astreinte) => astreinte.typeCreneau);
    if (!paireJourNuit(types)) {
      continue;
    }

    const bonus24h = bonuses[TypeBonusContinuite.JOUR_NUIT];
    if (bonus24h <= 0) {
      continue;
    }

    totalBonus += bonus24h;
  }

  return totalBonus;
}

export function calculerBonusContinuitePourIade(
  astreintes: AstreintePourBonusContinuite[],
  bonusParLigne: Map<string, Record<TypeBonusContinuite, number>>,
): number {
  const ligneIds = new Set(astreintes.map((astreinte) => astreinte.ligneId));
  let total = 0;

  for (const ligneId of ligneIds) {
    total += calculerBonusContinuitePourLigne(
      astreintes,
      ligneId,
      bonusParLigne,
    );
  }

  return total;
}

export function mapPreferenceVersBonus(
  type: TypePreferenceContinuite,
): TypeBonusContinuite {
  return type === TypePreferenceContinuite.WEEKEND_48H
    ? TypeBonusContinuite.WEEKEND_48H
    : TypeBonusContinuite.JOUR_NUIT;
}

export type UpsertBonusContinuiteInput = {
  ligneId: string;
  type: TypeBonusContinuite;
  bonus: number;
};

export async function upsertBonusContinuite(
  input: UpsertBonusContinuiteInput,
): Promise<
  | {
      bonusContinuite: {
        id: string;
        ligneId: string;
        type: TypeBonusContinuite;
        bonus: number;
      };
    }
  | { error: string; field?: string }
> {
  const ligne = await prisma.ligneAstreinte.findUnique({
    where: { id: input.ligneId },
    select: { id: true },
  });

  if (!ligne) {
    return { error: "Ligne introuvable.", field: "ligneId" };
  }

  if (!Number.isInteger(input.bonus) || input.bonus < 0) {
    return { error: "Le bonus doit être un entier positif ou nul.", field: "bonus" };
  }

  const bonusContinuite = await prisma.bonusContinuite.upsert({
    where: {
      ligneId_type: {
        ligneId: input.ligneId,
        type: input.type,
      },
    },
    create: {
      ligneId: input.ligneId,
      type: input.type,
      bonus: input.bonus,
    },
    update: {
      bonus: input.bonus,
    },
    select: {
      id: true,
      ligneId: true,
      type: true,
      bonus: true,
    },
  });

  return { bonusContinuite };
}
