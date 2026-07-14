/**
 * Importe les IADE et astreintes depuis le classeur Excel (format Feuil1).
 *
 * Usage :
 *   npx tsx scripts/import-classeur-astreintes.ts /chemin/vers/Classeur1.xlsx
 *   npm run import:classeur -- /chemin/vers/Classeur1.xlsx
 *
 * Prérequis : migrations appliquées (`npm run db:migrate`).
 * Le script prépare la structure de base (lignes, poids, jours fériés 2026),
 * remplace les IADE / astreintes existants, puis importe le classeur.
 */
import ExcelJS from "exceljs";
import {
  ModeAttribution,
  PrismaClient,
  Role,
  SourceJourFerie,
  StatutAstreinte,
  TypeBonusContinuite,
  TypeCreneau,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { calculerJoursFeries } from "../src/server/jours-feries";
import {
  CLE_LISSE_SEUIL_ECART_ABERRANT,
  CLE_MODE_ATTRIBUTION,
  VALEUR_META_LISSE_SEUIL_ECART_ABERRANT,
} from "../src/server/parametre-algorithme";
import {
  chargerTypesJour,
  formatDateKey,
  type TypeJour,
} from "../src/server/jours-feries";

const prisma = new PrismaClient();

const TEST_PASSWORD = "password123";
const BCRYPT_ROUNDS = 10;
const IMPORT_YEAR = 2026;

const TYPES_CRENEAU: TypeCreneau[] = [
  TypeCreneau.NUIT_SEMAINE,
  TypeCreneau.JOUR_SAMEDI,
  TypeCreneau.NUIT_SAMEDI,
  TypeCreneau.JOUR_DIMANCHE,
  TypeCreneau.NUIT_DIMANCHE,
  TypeCreneau.JOUR_FERIE,
  TypeCreneau.NUIT_FERIE,
];

type ExcelRow = {
  date: Date;
  tour: string;
  tourNum: number;
  horaires: string | null;
  agent: string;
  points: number;
};

function dateAtUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function normalizeUtcDay(date: Date): Date {
  return dateAtUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function parseAgentName(raw: string): { nom: string; prenom: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { nom: trimmed, prenom: "—" };
  }

  return {
    nom: trimmed.slice(0, spaceIndex),
    prenom: trimmed.slice(spaceIndex + 1),
  };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function readCellDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) {
    return normalizeUtcDay(value);
  }

  if (value && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (result instanceof Date) {
      return normalizeUtcDay(result);
    }
  }

  return null;
}

function readCellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (typeof result === "number" && Number.isFinite(result)) {
      return result;
    }
  }

  return null;
}

function readCellText(value: ExcelJS.CellValue): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function mapLigneExcel(tour: string): "Greffe" | "Obstétrique" | "Urgences" {
  switch (tour) {
    case "Greffe foie":
      return "Greffe";
    case "Obstétrique":
      return "Obstétrique";
    case "Urgence":
      return "Urgences";
    default:
      throw new Error(`Ligne Excel inconnue : ${tour}`);
  }
}

function creneauJourPour(typeJour: TypeJour): TypeCreneau | null {
  switch (typeJour) {
    case "SAMEDI":
      return TypeCreneau.JOUR_SAMEDI;
    case "DIMANCHE":
      return TypeCreneau.JOUR_DIMANCHE;
    case "FERIE":
      return TypeCreneau.JOUR_FERIE;
    default:
      return null;
  }
}

function creneauNuitPour(typeJour: TypeJour): TypeCreneau {
  switch (typeJour) {
    case "SAMEDI":
      return TypeCreneau.NUIT_SAMEDI;
    case "DIMANCHE":
      return TypeCreneau.NUIT_DIMANCHE;
    case "FERIE":
      return TypeCreneau.NUIT_FERIE;
    default:
      return TypeCreneau.NUIT_SEMAINE;
  }
}

function resolveTypeCreneau(
  ligneApp: "Greffe" | "Obstétrique" | "Urgences",
  horaires: string | null,
  typeJour: TypeJour,
): TypeCreneau | null {
  const horaire = (horaires ?? "").trim();

  if (ligneApp === "Obstétrique") {
    if (horaire === "7h00-19h00" || horaire === "7h-7h") {
      return creneauJourPour(typeJour);
    }

    if (horaire === "19h00-7h00") {
      return creneauNuitPour(typeJour);
    }

    return null;
  }

  if (typeJour === "SEMAINE") {
    return TypeCreneau.NUIT_SEMAINE;
  }

  return creneauNuitPour(typeJour);
}

async function ensureBaseStructure(): Promise<Record<string, string>> {
  const motDePasseHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  let lignes = await prisma.ligneAstreinte.findMany({
    orderBy: { ordrePriorite: "asc" },
  });

  if (lignes.length === 0) {
    lignes = await Promise.all([
      prisma.ligneAstreinte.create({
        data: { nom: "Greffe", ordrePriorite: 1 },
      }),
      prisma.ligneAstreinte.create({
        data: { nom: "Obstétrique", ordrePriorite: 2 },
      }),
      prisma.ligneAstreinte.create({
        data: { nom: "Urgences", ordrePriorite: 3 },
      }),
    ]);
  }

  for (const ligne of lignes) {
    const poids = ligne.nom === "Greffe" ? 2 : 1;
    for (const typeCreneau of TYPES_CRENEAU) {
      await prisma.poidsCreneau.upsert({
        where: {
          ligneId_typeCreneau: { ligneId: ligne.id, typeCreneau },
        },
        create: { ligneId: ligne.id, typeCreneau, poids },
        update: { poids },
      });
    }

    for (const type of Object.values(TypeBonusContinuite)) {
      await prisma.bonusContinuite.upsert({
        where: {
          ligneId_type: { ligneId: ligne.id, type },
        },
        create: {
          ligneId: ligne.id,
          type,
          bonus: type === TypeBonusContinuite.WEEKEND_48H ? 2 : 1,
        },
        update: {},
      });
    }
  }

  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_MODE_ATTRIBUTION },
    create: { cle: CLE_MODE_ATTRIBUTION, valeur: ModeAttribution.GLOUTON },
    update: {},
  });

  await prisma.parametreAlgorithme.upsert({
    where: { cle: CLE_LISSE_SEUIL_ECART_ABERRANT },
    create: {
      cle: CLE_LISSE_SEUIL_ECART_ABERRANT,
      valeur: VALEUR_META_LISSE_SEUIL_ECART_ABERRANT,
    },
    update: {},
  });

  const cadre = await prisma.utilisateur.findFirst({
    where: { role: Role.CADRE },
  });

  if (!cadre) {
    await prisma.utilisateur.create({
      data: {
        nom: "Leroy",
        prenom: "Nathalie",
        matricule: "CADRE001",
        email: "cadre@test.local",
        motDePasseHash,
        role: Role.CADRE,
      },
    });
  }

  const feries = calculerJoursFeries(IMPORT_YEAR);
  for (const ferie of feries) {
    await prisma.jourFerie.upsert({
      where: { date: ferie.date },
      create: {
        date: ferie.date,
        nom: ferie.nom,
        source: SourceJourFerie.AUTO,
        actif: true,
      },
      update: {
        nom: ferie.nom,
        source: SourceJourFerie.AUTO,
        actif: true,
      },
    });
  }

  return Object.fromEntries(lignes.map((ligne) => [ligne.nom, ligne.id]));
}

async function clearImportedPlanningData(): Promise<void> {
  await prisma.journalAudit.deleteMany();
  await prisma.candidature.deleteMany();
  await prisma.offreAstreinte.deleteMany();
  await prisma.demandeEchange.deleteMany();
  await prisma.astreinte.deleteMany();
  await prisma.disponibilite.deleteMany();
  await prisma.preferenceContinuite.deleteMany();
  await prisma.qualification.deleteMany();
  await prisma.utilisateur.deleteMany({ where: { role: Role.IADE } });
}

async function readExcelRows(filePath: string): Promise<ExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Le classeur ne contient aucune feuille.");
  }

  const rows: ExcelRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const dateValue = readCellDate(row.getCell(1).value);
    const tour = readCellText(row.getCell(2).value) ?? "";
    const tourNum = readCellNumber(row.getCell(3).value) ?? 0;
    const horairesRaw = readCellText(row.getCell(4).value);
    const agentRaw = readCellText(row.getCell(5).value);
    const points = readCellNumber(row.getCell(11).value);

    if (!agentRaw) {
      return;
    }

    if (!dateValue) {
      return;
    }

    if (points == null || points < 1) {
      return;
    }

    rows.push({
      date: dateValue,
      tour,
      tourNum,
      horaires: horairesRaw,
      agent: agentRaw,
      points: Math.round(points),
    });
  });

  return rows;
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      "Chemin du classeur requis.\nExemple : npx tsx scripts/import-classeur-astreintes.ts ~/Desktop/Classeur1.xlsx",
    );
  }

  const ligneIds = await ensureBaseStructure();
  await clearImportedPlanningData();

  const rows = await readExcelRows(filePath);
  if (rows.length === 0) {
    throw new Error("Aucune astreinte avec agent et points trouvée dans le classeur.");
  }

  const uniqueDates = [...new Set(rows.map((row) => formatDateKey(row.date)))].map(
    (key) =>
      dateAtUtc(
        Number(key.slice(0, 4)),
        Number(key.slice(5, 7)),
        Number(key.slice(8, 10)),
      ),
  );
  const typesJourParDate = await chargerTypesJour(uniqueDates);

  const agents = [...new Set(rows.map((row) => row.agent))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  const motDePasseHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
  const userIdByAgent = new Map<string, string>();
  const lignesParAgent = new Map<string, Set<string>>();

  for (const [index, agent] of agents.entries()) {
    const { nom, prenom } = parseAgentName(agent);
    const matricule = `IADE${String(index + 1).padStart(3, "0")}`;
    const email = `${slugify(prenom)}.${slugify(nom)}@test.local`;

    const utilisateur = await prisma.utilisateur.create({
      data: {
        nom,
        prenom,
        matricule,
        email,
        motDePasseHash,
        role: Role.IADE,
      },
    });

    userIdByAgent.set(agent, utilisateur.id);
    lignesParAgent.set(agent, new Set());
  }

  const astreintes: Array<{
    date: Date;
    ligneId: string;
    typeCreneau: TypeCreneau;
    iadeId: string;
    pointsAttribues: number;
  }> = [];

  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const ligneNom = mapLigneExcel(row.tour);
    const ligneId = ligneIds[ligneNom];
    const typeJour = typesJourParDate.get(formatDateKey(row.date));

    if (!ligneId || !typeJour) {
      skipped.push(`${formatDateKey(row.date)} ${ligneNom} : type de jour introuvable`);
      continue;
    }

    const typeCreneau = resolveTypeCreneau(ligneNom, row.horaires, typeJour);
    if (!typeCreneau) {
      skipped.push(
        `${formatDateKey(row.date)} ${ligneNom} ${row.horaires ?? "sans horaire"} : créneau non mappable`,
      );
      continue;
    }

    const iadeId = userIdByAgent.get(row.agent);
    if (!iadeId) {
      skipped.push(`${row.agent} : utilisateur introuvable`);
      continue;
    }

    lignesParAgent.get(row.agent)?.add(ligneNom);

    const key = `${formatDateKey(row.date)}|${ligneId}|${typeCreneau}`;
    if (seen.has(key)) {
      skipped.push(`${key} : doublon ignoré`);
      continue;
    }
    seen.add(key);

    astreintes.push({
      date: row.date,
      ligneId,
      typeCreneau,
      iadeId,
      pointsAttribues: row.points,
    });
  }

  const qualifications = [...lignesParAgent.entries()].flatMap(([agent, lignes]) => {
    const iadeId = userIdByAgent.get(agent);
    if (!iadeId) {
      return [];
    }

    return [...lignes].map((ligneNom) => ({
      iadeId,
      ligneId: ligneIds[ligneNom],
    }));
  });

  if (qualifications.length > 0) {
    await prisma.qualification.createMany({ data: qualifications });
  }

  const BATCH_SIZE = 500;
  let creees = 0;

  for (let offset = 0; offset < astreintes.length; offset += BATCH_SIZE) {
    const batch = astreintes.slice(offset, offset + BATCH_SIZE);
    const result = await prisma.astreinte.createMany({
      data: batch.map((astreinte) => ({
        ...astreinte,
        statut: StatutAstreinte.PLANIFIEE,
        publie: true,
        datePublication: new Date(),
      })),
    });
    creees += result.count;
  }

  const pointsParIade = new Map<string, number>();
  for (const astreinte of astreintes) {
    pointsParIade.set(
      astreinte.iadeId,
      (pointsParIade.get(astreinte.iadeId) ?? 0) + astreinte.pointsAttribues,
    );
  }

  console.log(`Import terminé depuis ${filePath}`);
  console.log(`- ${agents.length} IADE créés (mot de passe : ${TEST_PASSWORD})`);
  console.log(`- ${qualifications.length} qualifications`);
  console.log(`- ${creees} astreintes importées (${IMPORT_YEAR})`);
  console.log(`- ${skipped.length} ligne(s) ignorée(s)`);

  if (skipped.length > 0) {
    console.log("\nExemples ignorés :");
    for (const line of skipped.slice(0, 10)) {
      console.log(`  • ${line}`);
    }
    if (skipped.length > 10) {
      console.log(`  • … et ${skipped.length - 10} autre(s)`);
    }
  }

  console.log("\nIADE importés :");
  for (const agent of agents) {
    const iadeId = userIdByAgent.get(agent)!;
    const { nom, prenom } = parseAgentName(agent);
    const lignes = [...(lignesParAgent.get(agent) ?? [])].join(", ");
    const totalPoints = pointsParIade.get(iadeId) ?? 0;
    const utilisateur = await prisma.utilisateur.findUnique({
      where: { id: iadeId },
      select: { email: true, matricule: true },
    });
    console.log(
      `  • ${prenom} ${nom} — ${utilisateur?.email} (${utilisateur?.matricule}) — ${lignes} — ${totalPoints} pts`,
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
