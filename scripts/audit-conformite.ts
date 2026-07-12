/**
 * Audit de conformité — 5 points de vérification.
 * Usage : npx tsx scripts/audit-conformite.ts
 */
import {
  PrismaClient,
  Role,
  StatutAstreinte,
  TypeActionAudit,
  TypeCreneau,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { formatDateParam } from "../src/lib/calendar";
import { calculerPeriodeEnvoi } from "../src/lib/envoi-automatique-periode";
import { listAstreintesInRange } from "../src/server/astreintes";
import {
  executerEnvoiAutomatiqueSiEcheance,
} from "../src/server/envoi-automatique";
import { genererPlanningPdfPeriode } from "../src/server/planning-pdf";
import { deleteUtilisateur } from "../src/server/utilisateurs";

const prisma = new PrismaClient();

type Verdict = { point: number; conforme: boolean; detail: string };

const verdicts: Verdict[] = [];

function getMondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff),
  );
}

async function point1() {
  const lundi = new Date(Date.UTC(2026, 6, 13));
  const jeudi = new Date(Date.UTC(2026, 6, 16));
  const dimanche = new Date(Date.UTC(2026, 6, 19));

  const rLundi = calculerPeriodeEnvoi(lundi);
  const rJeudi = calculerPeriodeEnvoi(jeudi);
  const rDimanche = calculerPeriodeEnvoi(dimanche);

  const semaineCouranteLundi = getMondayUtc(lundi);
  const semaineCouranteFin = new Date(
    Date.UTC(
      semaineCouranteLundi.getUTCFullYear(),
      semaineCouranteLundi.getUTCMonth(),
      semaineCouranteLundi.getUTCDate() + 6,
    ),
  );

  const attenduDebut = "2026-07-20";
  const attenduFin = "2026-07-26";

  const tousIdentiques =
    formatDateParam(rLundi.debut) === attenduDebut &&
    formatDateParam(rLundi.fin) === attenduFin &&
    formatDateParam(rJeudi.debut) === attenduDebut &&
    formatDateParam(rJeudi.fin) === attenduFin &&
    formatDateParam(rDimanche.debut) === attenduDebut &&
    formatDateParam(rDimanche.fin) === attenduFin;

  const pasSemaineCourante =
    formatDateParam(rLundi.debut) > formatDateParam(semaineCouranteFin) &&
    formatDateParam(rJeudi.debut) > formatDateParam(semaineCouranteFin) &&
    formatDateParam(rDimanche.debut) > formatDateParam(semaineCouranteFin);

  const lundiStrict =
    formatDateParam(rLundi.debut) > formatDateParam(lundi);

  verdicts.push({
    point: 1,
    conforme: tousIdentiques && pasSemaineCourante && lundiStrict,
    detail: `lundi→${formatDateParam(rLundi.debut)}/${formatDateParam(rLundi.fin)}, jeudi→${formatDateParam(rJeudi.debut)}/${formatDateParam(rJeudi.fin)}, dimanche→${formatDateParam(rDimanche.debut)}/${formatDateParam(rDimanche.fin)} (semaine courante ${formatDateParam(semaineCouranteLundi)}–${formatDateParam(semaineCouranteFin)})`,
  });
}

async function point2() {
  const greffe = await prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } });
  const cadre = await prisma.utilisateur.findFirst({ where: { email: "cadre@test.local" } });
  const autre = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });

  if (!greffe || !cadre || !autre) {
    verdicts.push({ point: 2, conforme: false, detail: "Données seed manquantes." });
    return;
  }

  const hash = await bcrypt.hash("password123", 10);
  const iade = await prisma.utilisateur.create({
    data: {
      nom: "Audit",
      prenom: "Cascade",
      matricule: `AUDIT${Date.now()}`,
      email: `audit.cascade.${Date.now()}@test.local`,
      role: Role.IADE,
      motDePasseHash: hash,
    },
  });

  const astreinte = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2024, 5, 1)),
      ligneId: greffe.id,
      iadeId: iade.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      statut: StatutAstreinte.PLANIFIEE,
      publie: true,
    },
  });

  await prisma.disponibilite.create({
    data: {
      iadeId: iade.id,
      ligneId: greffe.id,
      date: new Date(Date.UTC(2026, 7, 1)),
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
    },
  });

  await prisma.qualification.create({
    data: { iadeId: iade.id, ligneId: greffe.id },
  });

  await prisma.journalAudit.create({
    data: {
      acteurId: iade.id,
      iadeConcerneId: iade.id,
      typeAction: TypeActionAudit.ASTREINTE_CREEE,
      resume: "Audit cascade",
    },
  });

  const offre = await prisma.offreAstreinte.create({
    data: {
      astreinteId: astreinte.id,
      proposantId: iade.id,
      dateOuverture: new Date(Date.UTC(2026, 6, 1)),
      dateFermeture: new Date(Date.UTC(2026, 6, 8)),
      statut: "OUVERTE",
    },
  });

  await prisma.candidature.create({
    data: { offreId: offre.id, iadeId: autre.id },
  });

  const result = await deleteUtilisateur(iade.id, cadre.id);
  if ("error" in result) {
    verdicts.push({ point: 2, conforme: false, detail: `Suppression échouée : ${result.error}` });
    return;
  }

  const orphelins = await Promise.all([
    prisma.astreinte.count({ where: { iadeId: iade.id } }),
    prisma.disponibilite.count({ where: { iadeId: iade.id } }),
    prisma.qualification.count({ where: { iadeId: iade.id } }),
    prisma.journalAudit.count({
      where: { OR: [{ acteurId: iade.id }, { iadeConcerneId: iade.id }] },
    }),
    prisma.candidature.count({ where: { iadeId: iade.id } }),
    prisma.offreAstreinte.count({ where: { proposantId: iade.id } }),
    prisma.utilisateur.count({ where: { id: iade.id } }),
  ]);

  const total = orphelins.reduce((a, b) => a + b, 0);
  verdicts.push({
    point: 2,
    conforme: total === 0,
    detail: total === 0 ? "0 donnée orpheline après suppression." : `Orphelins restants : ${orphelins.join(", ")}`,
  });
}

async function point3() {
  const cadres = await prisma.utilisateur.findMany({
    where: { role: Role.CADRE, actif: true },
  });

  if (cadres.length === 0) {
    verdicts.push({ point: 3, conforme: false, detail: "Aucun CADRE actif en base." });
    return;
  }

  const cadre = cadres[0]!;
  const result = await deleteUtilisateur(cadre.id, cadre.id);

  verdicts.push({
    point: 3,
    conforme: "error" in result && result.error.includes("propre compte"),
    detail:
      "error" in result
        ? result.error
        : "Suppression du propre compte autorisée (non attendu).",
  });
}

async function point4() {
  await prisma.configurationEnvoiAutomatique.deleteMany();

  const config = await prisma.configurationEnvoiAutomatique.create({
    data: {
      emailDestinataire: "secretariat@test.local",
      jourEnvoi: "JEUDI",
      actif: true,
      dateDernierEnvoi: new Date(Date.UTC(2026, 6, 16, 9, 0, 0)),
    },
  });

  const jeudi = new Date(Date.UTC(2026, 6, 16, 14, 0, 0));
  const second = await executerEnvoiAutomatiqueSiEcheance(jeudi);

  await prisma.configurationEnvoiAutomatique.delete({ where: { id: config.id } });

  verdicts.push({
    point: 4,
    conforme:
      second.statut === "ignore" &&
      second.raison === "Un envoi a déjà été effectué aujourd'hui.",
    detail:
      second.statut === "ignore"
        ? second.raison
        : `Second appel : statut=${second.statut}`,
  });
}

async function point5() {
  const greffe = await prisma.ligneAstreinte.findFirst({ where: { nom: "Greffe" } });
  const marie = await prisma.utilisateur.findFirst({
    where: { email: "marie.dupont@test.local" },
  });

  if (!greffe || !marie) {
    verdicts.push({ point: 5, conforme: false, detail: "Données seed manquantes." });
    return;
  }

  const debut = new Date(Date.UTC(2026, 6, 20));
  const fin = new Date(Date.UTC(2026, 6, 26));
  const finExclusive = new Date(Date.UTC(2026, 6, 27));

  const avant = await prisma.astreinte.count({
    where: {
      ligneId: greffe.id,
      iadeId: marie.id,
      date: { gte: debut, lt: finExclusive },
    },
  });

  await prisma.astreinte.deleteMany({
    where: {
      ligneId: greffe.id,
      iadeId: marie.id,
      date: { gte: debut, lt: finExclusive },
    },
  });

  const ids: string[] = [];

  const dansPublie = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2026, 6, 22)),
      ligneId: greffe.id,
      iadeId: marie.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      publie: true,
    },
  });
  ids.push(dansPublie.id);

  const dansBrouillon = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2026, 6, 23)),
      ligneId: greffe.id,
      iadeId: marie.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      publie: false,
    },
  });
  ids.push(dansBrouillon.id);

  const horsPeriode = await prisma.astreinte.create({
    data: {
      date: new Date(Date.UTC(2026, 6, 28)),
      ligneId: greffe.id,
      iadeId: marie.id,
      typeCreneau: TypeCreneau.NUIT_SEMAINE,
      pointsAttribues: 2,
      publie: true,
    },
  });
  ids.push(horsPeriode.id);

  const astreintesPdf = await listAstreintesInRange(debut, finExclusive, {
    visibilite: "publiees_seulement",
  });

  const idsPdf = new Set(astreintesPdf.map((a) => a.id));
  const contientPublie = idsPdf.has(dansPublie.id);
  const contientBrouillon = idsPdf.has(dansBrouillon.id);
  const contientHorsPeriode = idsPdf.has(horsPeriode.id);

  const { buffer } = await genererPlanningPdfPeriode({
    periodeDebut: debut,
    periodeFin: fin,
  });

  const pdfText = buffer.toString("latin1");
  const datePublie = "22/07/2026";
  const dateBrouillon = "23/07/2026";
  const dateHors = "28/07/2026";

  await prisma.astreinte.deleteMany({ where: { id: { in: ids } } });

  const filtreOk =
    contientPublie && !contientBrouillon && !contientHorsPeriode;
  const pdfOk =
    pdfText.includes(datePublie) &&
    !pdfText.includes(dateBrouillon) &&
    !pdfText.includes(dateHors);

  verdicts.push({
    point: 5,
    conforme: filtreOk && pdfOk,
    detail: `requête: publie=${contientPublie}, brouillon=${contientBrouillon}, hors=${contientHorsPeriode} | PDF: publie=${pdfText.includes(datePublie)}, brouillon=${pdfText.includes(dateBrouillon)}, hors=${pdfText.includes(dateHors)} (astreintes préexistantes période supprimées: ${avant})`,
  });
}

async function main() {
  await point1();
  await point2();
  await point3();
  await point4();
  await point5();

  for (const v of verdicts) {
    console.log(
      `Point ${v.point} : ${v.conforme ? "CONFORME" : "NON CONFORME"} — ${v.detail}`,
    );
  }

  if (verdicts.some((v) => !v.conforme)) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
