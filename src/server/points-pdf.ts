import PDFDocument from "pdfkit";
import {
  getPointsOverview,
  type PointsParLigne,
  type PointsOverview,
} from "@/server/points";
import { formatLigneCellComplet } from "@/server/points-export-format";

const MARGIN = 40;
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 22;

function formatDateGeneration(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function computeColumnWidths(overview: PointsOverview, pageWidth: number) {
  const usable = pageWidth - MARGIN * 2;
  const iadeWidth = 110;
  const totalWidth = 55;
  const ligneCount = overview.lignes.length;
  const ligneWidth =
    ligneCount > 0
      ? Math.max(90, (usable - iadeWidth - totalWidth) / ligneCount)
      : 90;

  return {
    iade: iadeWidth,
    total: totalWidth,
    ligne: ligneWidth,
    tableWidth: iadeWidth + totalWidth + ligneWidth * ligneCount,
  };
}

function ensureSpace(
  doc: InstanceType<typeof PDFDocument>,
  needed: number,
): void {
  if (doc.y + needed > doc.page.height - MARGIN - 24) {
    doc.addPage({ layout: "landscape" });
    doc.y = MARGIN;
  }
}

function drawHeaderRow(
  doc: InstanceType<typeof PDFDocument>,
  overview: PointsOverview,
  x: number,
  widths: ReturnType<typeof computeColumnWidths>,
): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(8);

  let offset = x;
  doc.text("IADE", offset, y, { width: widths.iade });
  offset += widths.iade;
  doc.text("Points cumulés", offset, y, { width: widths.total });
  offset += widths.total;

  for (const ligne of overview.lignes) {
    doc.text(ligne.nom, offset, y, { width: widths.ligne });
    offset += widths.ligne;
  }

  doc
    .moveTo(x, y + HEADER_HEIGHT - 2)
    .lineTo(x + widths.tableWidth, y + HEADER_HEIGHT - 2)
    .strokeColor("#cccccc")
    .stroke();

  doc.y = y + HEADER_HEIGHT;
  doc.font("Helvetica").fontSize(7.5);
}

function drawDataRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  widths: ReturnType<typeof computeColumnWidths>,
  iadeLabel: string,
  pointsTotal: number,
  parLigne: PointsParLigne[],
): void {
  ensureSpace(doc, ROW_HEIGHT);
  const y = doc.y;
  let offset = x;

  doc.text(iadeLabel, offset, y, { width: widths.iade });
  offset += widths.iade;
  doc.text(String(pointsTotal), offset, y, { width: widths.total });
  offset += widths.total;

  for (const ligne of parLigne) {
    doc.text(formatLigneCellComplet(ligne), offset, y, {
      width: widths.ligne,
      lineGap: 1,
    });
    offset += widths.ligne;
  }

  doc.y = y + ROW_HEIGHT;
}

function addFooters(
  doc: InstanceType<typeof PDFDocument>,
  generatedAt: Date,
): void {
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

export async function genererPointsPdf(
  annee: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const overview = await getPointsOverview(annee, {
    visibilite: "publiees_seulement",
  });
  const generatedAt = new Date();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: MARGIN,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
      info: {
        Title: `Points cumulés ${annee}`,
        Author: "Astreintes IADE",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(14).text("Points cumulés", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).text(`Année civile ${annee}`, {
      align: "center",
    });
    doc.moveDown(0.8);

    const widths = computeColumnWidths(overview, doc.page.width);
    const tableX = MARGIN;

    drawHeaderRow(doc, overview, tableX, widths);

    if (overview.iades.length === 0) {
      doc.fontSize(9).text("Aucun IADE actif.");
    } else {
      for (const iade of overview.iades) {
        drawDataRow(
          doc,
          tableX,
          widths,
          `${iade.prenom} ${iade.nom}`,
          iade.pointsTotal,
          iade.parLigne,
        );
      }
    }

    addFooters(doc, generatedAt);
    doc.end();
  });

  return {
    buffer,
    filename: `points-${annee}.pdf`,
  };
}
