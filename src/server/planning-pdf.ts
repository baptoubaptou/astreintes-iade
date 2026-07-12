import PDFDocument from "pdfkit";
import type { TypeCreneau } from "@prisma/client";
import { formatDateParam } from "@/lib/calendar";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import {
  getActiveLignesOptions,
  listAstreintes,
  listAstreintesInRange,
  parseMoisParam,
  shiftMois,
  type AstreinteListItem,
} from "@/server/astreintes";

const MARGIN = 50;
const COL_DATE = 75;
const COL_JOUR = 95;
const COL_CRENEAU = 130;
const COL_IADE = 195;
const ROW_HEIGHT = 18;
const HEADER_ROW_HEIGHT = 20;

function parseDateUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatJourSemaine(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parseDateUtc(date));
}

function formatDateCourte(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateUtc(date));
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

function groupAstreintesParLigne(
  astreintes: AstreinteListItem[],
  ordreLignes: Array<{ id: string; nom: string }>,
): Map<string, { ligneNom: string; astreintes: AstreinteListItem[] }> {
  const map = new Map<string, { ligneNom: string; astreintes: AstreinteListItem[] }>();

  for (const ligne of ordreLignes) {
    map.set(ligne.id, { ligneNom: ligne.nom, astreintes: [] });
  }

  for (const astreinte of astreintes) {
    const groupe = map.get(astreinte.ligne.id);
    if (groupe) {
      groupe.astreintes.push(astreinte);
    } else {
      map.set(astreinte.ligne.id, {
        ligneNom: astreinte.ligne.nom,
        astreintes: [astreinte],
      });
    }
  }

  return map;
}

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number): void {
  const bottom = doc.page.height - MARGIN - 30;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function drawTableHeader(doc: InstanceType<typeof PDFDocument>, x: number): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Date", x, y, { width: COL_DATE });
  doc.text("Jour", x + COL_DATE, y, { width: COL_JOUR });
  doc.text("Créneau", x + COL_DATE + COL_JOUR, y, { width: COL_CRENEAU });
  doc.text("IADE", x + COL_DATE + COL_JOUR + COL_CRENEAU, y, { width: COL_IADE });
  doc
    .moveTo(x, y + HEADER_ROW_HEIGHT - 4)
    .lineTo(x + COL_DATE + COL_JOUR + COL_CRENEAU + COL_IADE, y + HEADER_ROW_HEIGHT - 4)
    .strokeColor("#cccccc")
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
  const y = doc.y;
  doc.text(formatDateCourte(astreinte.date), x, y, { width: COL_DATE });
  doc.text(formatJourSemaine(astreinte.date), x + COL_DATE, y, { width: COL_JOUR });
  doc.text(
    LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau as TypeCreneau],
    x + COL_DATE + COL_JOUR,
    y,
    { width: COL_CRENEAU },
  );
  doc.text(
    `${astreinte.iade.prenom} ${astreinte.iade.nom}`,
    x + COL_DATE + COL_JOUR + COL_CRENEAU,
    y,
    { width: COL_IADE },
  );
  doc.y = y + ROW_HEIGHT;
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
  const groupes = groupAstreintesParLigne(
    options.astreintes,
    options.lignesFiltrees,
  );
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

    for (const ligne of options.lignesFiltrees) {
      const groupe = groupes.get(ligne.id);
      if (!groupe) {
        continue;
      }

      sectionCount += 1;
      ensureSpace(doc, 60);

      if (sectionCount > 1) {
        doc.moveDown(0.5);
      }

      doc.font("Helvetica-Bold").fontSize(11).text(groupe.ligneNom);
      doc.moveDown(0.3);

      if (groupe.astreintes.length === 0) {
        doc.font("Helvetica").fontSize(9).fillColor("#666666");
        doc.text("Aucune astreinte publiée sur cette période.");
        doc.fillColor("#000000");
        doc.moveDown(0.5);
        continue;
      }

      drawTableHeader(doc, tableX);

      for (const astreinte of groupe.astreintes) {
        drawAstreinteRow(doc, tableX, astreinte);
      }

      doc.moveDown(0.5);
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
