import PDFDocument from "pdfkit";
import { formatDateParam } from "@/lib/calendar";
import { getLignePdfColors } from "@/lib/ligne-colors";
import { libelleCourtCreneau } from "@/server/astreinte-creneaux";
import {
  getActiveLignesOptions,
  listAstreintes,
  listAstreintesInRange,
  parseMoisParam,
  shiftMois,
  type AstreinteListItem,
} from "@/server/astreintes";

const MARGIN = 50;
const COL_ASTREINTE = 130;
const COL_JOUR_NUIT = 50;
const COL_IADE = 220;
const TABLE_WIDTH = COL_ASTREINTE + COL_JOUR_NUIT + COL_IADE;
const ROW_HEIGHT = 20;
const HEADER_ROW_HEIGHT = 20;
const DAY_HEADER_HEIGHT = 26;
const DAY_PADDING = 6;
const DAY_BLOCK_GAP = 14;
const DAY_BLOCK_INSET = 4;

function parseDateUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateGeneration(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ordreLigneIndex(
  ligneId: string,
  ordreLignes: Array<{ id: string }>,
): number {
  const index = ordreLignes.findIndex((ligne) => ligne.id === ligneId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function trierAstreintesPourPdf(
  astreintes: AstreinteListItem[],
  ordreLignes: Array<{ id: string; nom: string }>,
): AstreinteListItem[] {
  return [...astreintes].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    const ligneCompare =
      ordreLigneIndex(a.ligne.id, ordreLignes) -
      ordreLigneIndex(b.ligne.id, ordreLignes);
    if (ligneCompare !== 0) {
      return ligneCompare;
    }

    return a.typeCreneau.localeCompare(b.typeCreneau);
  });
}

function groupAstreintesParDate(
  astreintes: AstreinteListItem[],
): Array<{ date: string; astreintes: AstreinteListItem[] }> {
  const map = new Map<string, AstreinteListItem[]>();

  for (const astreinte of astreintes) {
    const liste = map.get(astreinte.date) ?? [];
    liste.push(astreinte);
    map.set(astreinte.date, liste);
  }

  return [...map.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, groupe]) => ({ date, astreintes: groupe }));
}

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number): void {
  const bottom = doc.page.height - MARGIN - 30;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function formatDateSection(date: string): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateUtc(date));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getDaySectionStyle(date: string, sectionIndex: number): {
  blockBg: string;
  blockBorder: string;
  headerBg: string;
} {
  const dayOfWeek = parseDateUtc(date).getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    return {
      blockBg: "#fffbeb",
      blockBorder: "#fbbf24",
      headerBg: "#b45309",
    };
  }

  return sectionIndex % 2 === 0
    ? {
        blockBg: "#f8fafc",
        blockBorder: "#cbd5e1",
        headerBg: "#334155",
      }
    : {
        blockBg: "#ffffff",
        blockBorder: "#94a3b8",
        headerBg: "#1e293b",
      };
}

function drawTableHeader(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  blockBg: string,
): void {
  const y = doc.y;
  doc.rect(x, y, TABLE_WIDTH, HEADER_ROW_HEIGHT).fill(blockBg);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
  doc.text("Astreinte", x + 8, y + 5, { width: COL_ASTREINTE - 8 });
  doc.text("Créneau", x + COL_ASTREINTE, y + 5, { width: COL_JOUR_NUIT });
  doc.text("IADE", x + COL_ASTREINTE + COL_JOUR_NUIT, y + 5, { width: COL_IADE });
  doc
    .moveTo(x, y + HEADER_ROW_HEIGHT)
    .lineTo(x + TABLE_WIDTH, y + HEADER_ROW_HEIGHT)
    .strokeColor("#cbd5e1")
    .lineWidth(0.5)
    .stroke();
  doc.y = y + HEADER_ROW_HEIGHT;
  doc.font("Helvetica").fontSize(9);
}

function drawAstreinteRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  astreinte: AstreinteListItem,
): void {
  ensureSpace(doc, ROW_HEIGHT);
  const colors = getLignePdfColors(astreinte.ligne.id, astreinte.ligne.nom);
  const y = doc.y;
  const creneau = libelleCourtCreneau(astreinte.typeCreneau);

  doc.rect(x, y, TABLE_WIDTH, ROW_HEIGHT).fill(colors.rowBg);
  doc.rect(x, y, 4, ROW_HEIGHT).fill(colors.accent);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(colors.rowText)
    .text(astreinte.ligne.nom, x + 10, y + 5, { width: COL_ASTREINTE - 10 });

  doc
    .font("Helvetica")
    .fillColor(creneau === "Nuit" ? "#1e293b" : "#475569")
    .text(creneau, x + COL_ASTREINTE, y + 5, { width: COL_JOUR_NUIT });

  doc
    .fillColor("#111827")
    .text(
      `${astreinte.iade.prenom} ${astreinte.iade.nom}`,
      x + COL_ASTREINTE + COL_JOUR_NUIT,
      y + 5,
      { width: COL_IADE },
    );

  doc.y = y + ROW_HEIGHT;
}

function drawDaySection(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  groupe: { date: string; astreintes: AstreinteListItem[] },
  sectionIndex: number,
): void {
  const styles = getDaySectionStyle(groupe.date, sectionIndex);
  const blockHeight =
    DAY_HEADER_HEIGHT +
    DAY_PADDING +
    HEADER_ROW_HEIGHT +
    groupe.astreintes.length * ROW_HEIGHT +
    DAY_PADDING;

  ensureSpace(doc, blockHeight + DAY_BLOCK_GAP);

  const blockX = x - DAY_BLOCK_INSET;
  const blockY = doc.y;
  const blockWidth = TABLE_WIDTH + DAY_BLOCK_INSET * 2;

  doc
    .roundedRect(blockX, blockY, blockWidth, blockHeight, 4)
    .fill(styles.blockBg);
  doc
    .roundedRect(blockX, blockY, blockWidth, blockHeight, 4)
    .lineWidth(0.75)
    .strokeColor(styles.blockBorder)
    .stroke();

  doc
    .roundedRect(blockX, blockY, blockWidth, DAY_HEADER_HEIGHT, 4)
    .fill(styles.headerBg);
  doc
    .rect(blockX, blockY + DAY_HEADER_HEIGHT - 4, blockWidth, 4)
    .fill(styles.headerBg);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#ffffff")
    .text(formatDateSection(groupe.date), x, blockY + 7, { width: TABLE_WIDTH });

  doc.y = blockY + DAY_HEADER_HEIGHT + DAY_PADDING;
  doc.fillColor("#000000");

  drawTableHeader(doc, x, styles.blockBg);

  for (const astreinte of groupe.astreintes) {
    drawAstreinteRow(doc, x, astreinte);
  }

  doc.y = blockY + blockHeight + DAY_BLOCK_GAP;
}

function addFooters(doc: InstanceType<typeof PDFDocument>, generatedAt: Date): void {
  const footer = `Document généré le ${formatDateGeneration(generatedAt)}`;
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666666")
      .text(footer, MARGIN, doc.page.height - MARGIN, {
        align: "center",
        width: doc.page.width - MARGIN * 2,
      });
  }
}

function formatPeriodeLabel(debut: Date, fin: Date): string {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(debut)} — ${formatter.format(fin)}`;
}

async function buildPlanningPdfBuffer(options: {
  astreintes: AstreinteListItem[];
  lignesFiltrees: Array<{ id: string; nom: string }>;
  titrePeriode: string;
  lignesLabel: string;
  filename: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const astreintesTriees = trierAstreintesPourPdf(
    options.astreintes,
    options.lignesFiltrees,
  );
  const groupesParDate = groupAstreintesParDate(astreintesTriees);
  const generatedAt = new Date();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: MARGIN,
      size: "A4",
      bufferPages: true,
      info: {
        Title: `Planning ${options.titrePeriode}`,
        Author: "Astreintes IADE",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text("Planning des astreintes", {
      align: "center",
    });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(12).text(options.titrePeriode, {
      align: "center",
    });
    doc.fontSize(10).fillColor("#444444").text(`Ligne(s) : ${options.lignesLabel}`, {
      align: "center",
    });
    doc.fillColor("#000000");
    doc.moveDown(1);

    const tableX = MARGIN;
    let sectionCount = 0;

    for (const groupe of groupesParDate) {
      if (groupe.astreintes.length === 0) {
        continue;
      }

      sectionCount += 1;
      drawDaySection(doc, tableX, groupe, sectionCount - 1);
    }

    if (sectionCount === 0) {
      doc.font("Helvetica").fontSize(10).text("Aucune astreinte publiée pour cette sélection.");
    }

    addFooters(doc, generatedAt);
    doc.end();
  });

  return { buffer, filename: options.filename };
}

export async function genererPlanningPdf(options: {
  mois: string;
  ligneId?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const { value: mois } = parseMoisParam(options.mois);
  const moisLabel = shiftMois(mois, 0).label;

  const [astreintes, lignes] = await Promise.all([
    listAstreintes({
      mois,
      ligneId: options.ligneId,
      visibilite: "publiees_seulement",
    }),
    getActiveLignesOptions(),
  ]);

  const lignesFiltrees = options.ligneId
    ? lignes.filter((ligne) => ligne.id === options.ligneId)
    : lignes;
  const lignesLabel =
    lignesFiltrees.length === 1
      ? lignesFiltrees[0]!.nom
      : options.ligneId
        ? lignesFiltrees[0]?.nom ?? "Ligne sélectionnée"
        : "Toutes lignes";

  const filename = options.ligneId
    ? `planning-${mois}-${slugify(lignesLabel)}.pdf`
    : `planning-${mois}.pdf`;

  return buildPlanningPdfBuffer({
    astreintes,
    lignesFiltrees,
    titrePeriode: moisLabel,
    lignesLabel,
    filename,
  });
}

export async function genererPlanningPdfPeriode(options: {
  periodeDebut: Date;
  periodeFin: Date;
  ligneId?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const debut = new Date(
    Date.UTC(
      options.periodeDebut.getUTCFullYear(),
      options.periodeDebut.getUTCMonth(),
      options.periodeDebut.getUTCDate(),
    ),
  );
  const fin = new Date(
    Date.UTC(
      options.periodeFin.getUTCFullYear(),
      options.periodeFin.getUTCMonth(),
      options.periodeFin.getUTCDate(),
    ),
  );
  const finExclusive = new Date(
    Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate() + 1),
  );

  const [astreintes, lignes] = await Promise.all([
    listAstreintesInRange(debut, finExclusive, {
      visibilite: "publiees_seulement",
    }),
    getActiveLignesOptions(),
  ]);

  const lignesFiltrees = options.ligneId
    ? lignes.filter((ligne) => ligne.id === options.ligneId)
    : lignes;
  const lignesLabel =
    lignesFiltrees.length === 1
      ? lignesFiltrees[0]!.nom
      : options.ligneId
        ? lignesFiltrees[0]?.nom ?? "Ligne sélectionnée"
        : "Toutes lignes";

  const debutIso = formatDateParam(debut);
  const finIso = formatDateParam(fin);
  const filename = options.ligneId
    ? `planning-${debutIso}_${finIso}-${slugify(lignesLabel)}.pdf`
    : `planning-${debutIso}_${finIso}.pdf`;

  return buildPlanningPdfBuffer({
    astreintes,
    lignesFiltrees,
    titrePeriode: formatPeriodeLabel(debut, fin),
    lignesLabel,
    filename,
  });
}
