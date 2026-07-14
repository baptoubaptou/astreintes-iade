import { StatutAstreinte, TypeCreneau } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import {
  chargerTypesJour,
  creneauxDisponiblesPour,
  formatDateKey,
} from "@/server/jours-feries";

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function eachDayInclusive(debut: Date, fin: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(debut);

  while (cursor <= fin) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function getDefaultAPourvoirPeriode(): {
  dateDebut: string;
  dateFin: string;
} {
  const debut = normalizeUtcDay(new Date());
  const fin = new Date(debut);
  fin.setUTCDate(fin.getUTCDate() + 29);

  return {
    dateDebut: formatDateKey(debut),
    dateFin: formatDateKey(fin),
  };
}

export type CreneauAPourvoir = {
  date: string;
  ligneId: string;
  ligneNom: string;
  ordrePriorite: number;
  typeCreneau: TypeCreneau;
  libelleCreneau: string;
};

export type LigneAPourvoirGroup = {
  ligneId: string;
  ligneNom: string;
  ordrePriorite: number;
  creneaux: CreneauAPourvoir[];
};

export type APourvoirResult = {
  periode: { dateDebut: string; dateFin: string };
  total: number;
  parLigne: LigneAPourvoirGroup[];
  creneaux: CreneauAPourvoir[];
};

function buildSlotKey(
  date: string,
  ligneId: string,
  typeCreneau: TypeCreneau,
): string {
  return `${date}:${ligneId}:${typeCreneau}`;
}

export async function listerCreneauxAPourvoir(
  dateDebut: Date,
  dateFin: Date,
): Promise<APourvoirResult> {
  const debut = normalizeUtcDay(dateDebut);
  const fin = normalizeUtcDay(dateFin);

  if (fin < debut) {
    throw new Error("dateFin doit être postérieure ou égale à dateDebut.");
  }

  const jours = eachDayInclusive(debut, fin);
  const [lignes, typesJourParDate, astreintesExistantes] = await Promise.all([
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true, ordrePriorite: true },
    }),
    chargerTypesJour(jours),
    prisma.astreinte.findMany({
      where: {
        date: { gte: debut, lte: fin },
        statut: { not: StatutAstreinte.ANNULEE },
      },
      select: {
        date: true,
        ligneId: true,
        typeCreneau: true,
      },
    }),
  ]);

  const slotsOccupes = new Set<string>();
  for (const astreinte of astreintesExistantes) {
    slotsOccupes.add(
      buildSlotKey(
        formatDateKey(normalizeUtcDay(astreinte.date)),
        astreinte.ligneId,
        astreinte.typeCreneau,
      ),
    );
  }

  const creneaux: CreneauAPourvoir[] = [];

  for (const jour of jours) {
    const dateKey = formatDateKey(jour);
    const typeJour = typesJourParDate.get(dateKey);
    if (!typeJour) {
      continue;
    }

    const typesCreneau = creneauxDisponiblesPour(typeJour);

    for (const ligne of lignes) {
      for (const typeCreneau of typesCreneau) {
        const slotKey = buildSlotKey(dateKey, ligne.id, typeCreneau);
        if (slotsOccupes.has(slotKey)) {
          continue;
        }

        creneaux.push({
          date: dateKey,
          ligneId: ligne.id,
          ligneNom: ligne.nom,
          ordrePriorite: ligne.ordrePriorite,
          typeCreneau,
          libelleCreneau: LIBELLES_TYPE_CRENEAU_ASTREINTE[typeCreneau],
        });
      }
    }
  }

  creneaux.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    const ligneCmp = a.ordrePriorite - b.ordrePriorite;
    if (ligneCmp !== 0) {
      return ligneCmp;
    }
    return a.typeCreneau.localeCompare(b.typeCreneau);
  });

  const parLigneMap = new Map<string, LigneAPourvoirGroup>();
  for (const ligne of lignes) {
    parLigneMap.set(ligne.id, {
      ligneId: ligne.id,
      ligneNom: ligne.nom,
      ordrePriorite: ligne.ordrePriorite,
      creneaux: [],
    });
  }

  for (const creneau of creneaux) {
    parLigneMap.get(creneau.ligneId)?.creneaux.push(creneau);
  }

  const parLigne = [...parLigneMap.values()].filter(
    (groupe) => groupe.creneaux.length > 0,
  );

  return {
    periode: {
      dateDebut: formatDateKey(debut),
      dateFin: formatDateKey(fin),
    },
    total: creneaux.length,
    parLigne,
    creneaux,
  };
}