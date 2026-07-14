/**
 * Attribue des disponibilités de test sur octobre, novembre et décembre à tous
 * les IADE actifs. Certaines dates (ou créneaux) sont volontairement laissées
 * vides pour simuler des indisponibilités.
 *
 * Usage : npm run seed:dispos-oct-nov-dec
 *         npx tsx scripts/seed-disponibilites-octobre-novembre-decembre.ts 2026
 */
import { PrismaClient, Role, TypeCreneau } from "@prisma/client";
import {
  chargerTypesJour,
  creneauxDisponiblesPour,
  formatDateKey,
} from "../src/server/jours-feries";

const prisma = new PrismaClient();

const MOIS_CIBLES = [10, 11, 12];

type RegleIndispo = {
  /** Jours du mois (1–31) entièrement indisponibles. */
  joursDuMois?: number[];
  /** Semaine du mois (1 = j. 1–7, 2 = j. 8–14, …) entièrement indisponible. */
  semainesDuMois?: number[];
  /** Jour de semaine JS (0 = dimanche … 6 = samedi) entièrement indisponible. */
  joursSemaine?: number[];
  /** Créneaux exclus même si le jour reste disponible (ex. nuits de week-end). */
  creneauxExclus?: TypeCreneau[];
  /** Indispo si (jourDuMois + mois + décalage) % n === 0. */
  modulo?: { n: number; offset: number };
};

/** Une règle par IADE (ordre nom/prénom), motifs variés et reproductibles. */
const REGLES_INDISPO: RegleIndispo[] = [
  {
    joursDuMois: [1, 2, 15],
    modulo: { n: 9, offset: 0 },
  },
  {
    semainesDuMois: [1],
    joursDuMois: [25, 26],
  },
  {
    joursSemaine: [0],
    joursDuMois: [11],
  },
  {
    creneauxExclus: [TypeCreneau.NUIT_SAMEDI, TypeCreneau.NUIT_DIMANCHE],
    modulo: { n: 7, offset: 3 },
  },
  {
    semainesDuMois: [3],
    joursDuMois: [24, 25, 26, 27, 28, 29, 30, 31],
  },
  {
    joursDuMois: [8, 9, 10],
    joursSemaine: [3],
  },
];

function dateAt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function joursDuMois(year: number, month: number): Date[] {
  const nombreJours = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: nombreJours }, (_, index) =>
    dateAt(year, month, index + 1),
  );
}

function semaineDuMois(day: number): number {
  return Math.ceil(day / 7);
}

function estJourIndispo(regle: RegleIndispo, date: Date): boolean {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay();

  if (regle.joursDuMois?.includes(day)) {
    return true;
  }

  if (regle.semainesDuMois?.includes(semaineDuMois(day))) {
    return true;
  }

  if (regle.joursSemaine?.includes(dow)) {
    return true;
  }

  if (regle.modulo) {
    const { n, offset } = regle.modulo;
    if ((day + month + offset) % n === 0) {
      return true;
    }
  }

  return false;
}

function estCreneauIndispo(
  regle: RegleIndispo,
  typeCreneau: TypeCreneau,
): boolean {
  return regle.creneauxExclus?.includes(typeCreneau) ?? false;
}

async function main() {
  const year = process.argv[2]
    ? Number(process.argv[2])
    : new Date().getUTCFullYear();

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Année invalide : ${process.argv[2]}`);
  }

  const iades = await prisma.utilisateur.findMany({
    where: { role: Role.IADE, actif: true },
    select: {
      id: true,
      prenom: true,
      nom: true,
      qualifications: {
        select: {
          ligneId: true,
          ligne: { select: { nom: true, actif: true } },
        },
      },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (iades.length === 0) {
    console.log("Aucun IADE actif trouvé.");
    return;
  }

  const dates = MOIS_CIBLES.flatMap((month) => joursDuMois(year, month));
  const typesJourParDate = await chargerTypesJour(dates);

  const rangeDebut = dates[0];
  const rangeFin = dates[dates.length - 1];

  const { count: supprimees } = await prisma.disponibilite.deleteMany({
    where: {
      iade: { role: Role.IADE, actif: true },
      date: { gte: rangeDebut, lte: rangeFin },
    },
  });

  const entries: Array<{
    iadeId: string;
    ligneId: string;
    date: Date;
    typeCreneau: TypeCreneau;
  }> = [];

  const statsParIade = new Map<
    string,
    { label: string; creees: number; joursSansAucuneDispo: Set<string> }
  >();

  for (let iadeIndex = 0; iadeIndex < iades.length; iadeIndex++) {
    const iade = iades[iadeIndex]!;
    const regle = REGLES_INDISPO[iadeIndex % REGLES_INDISPO.length]!;
    const label = `${iade.prenom} ${iade.nom}`;
    const joursCouverts = new Set<string>();

    statsParIade.set(iade.id, {
      label,
      creees: 0,
      joursSansAucuneDispo: new Set(),
    });

    const lignesQualifiees = iade.qualifications.filter(
      (qualification) => qualification.ligne.actif,
    );

    for (const qualification of lignesQualifiees) {
      for (const date of dates) {
        if (estJourIndispo(regle, date)) {
          continue;
        }

        const typeJour = typesJourParDate.get(formatDateKey(date));
        if (!typeJour) {
          continue;
        }

        for (const typeCreneau of creneauxDisponiblesPour(typeJour)) {
          if (estCreneauIndispo(regle, typeCreneau)) {
            continue;
          }

          entries.push({
            iadeId: iade.id,
            ligneId: qualification.ligneId,
            date,
            typeCreneau,
          });
          joursCouverts.add(formatDateKey(date));
        }
      }
    }

    const stat = statsParIade.get(iade.id)!;
    stat.creees = entries.filter((entry) => entry.iadeId === iade.id).length;

    for (const date of dates) {
      const key = formatDateKey(date);
      if (!joursCouverts.has(key)) {
        stat.joursSansAucuneDispo.add(key);
      }
    }
  }

  const BATCH_SIZE = 500;
  let creees = 0;

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const result = await prisma.disponibilite.createMany({ data: batch });
    creees += result.count;
  }

  console.log(
    `Disponibilités de test — octobre, novembre & décembre ${year}`,
  );
  console.log(`- ${iades.length} IADE actifs`);
  console.log(`- ${supprimees} disponibilité(s) supprimée(s) sur la période`);
  console.log(`- ${creees} disponibilité(s) créée(s)`);
  console.log(
    `- Période : ${formatDateKey(rangeDebut)} → ${formatDateKey(rangeFin)}`,
  );
  console.log(
    "- Certaines dates ou créneaux sont volontairement absents (indispo).",
  );

  for (const iade of iades) {
    const stat = statsParIade.get(iade.id);
    const lignes = iade.qualifications
      .filter((q) => q.ligne.actif)
      .map((q) => q.ligne.nom)
      .join(", ");
    const joursIndispo = stat?.joursSansAucuneDispo.size ?? 0;
    console.log(
      `  • ${stat?.label ?? iade.prenom} — ${stat?.creees ?? 0} dispo(s), ${joursIndispo} jour(s) sans aucune case cochée (${lignes || "aucune ligne"})`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Erreur :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
