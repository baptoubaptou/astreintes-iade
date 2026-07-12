import ExcelJS from "exceljs";
import { getPointsOverview } from "@/server/points";
import { formatLigneCellComplet } from "@/server/points-export-format";

function ajusterLargeursColonnes(worksheet: ExcelJS.Worksheet): void {
  worksheet.columns.forEach((column) => {
    let maxLength = 10;

    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const lines = String(cell.value ?? "").split("\n");
      const longest = Math.max(...lines.map((line) => line.length), 0);
      if (longest > maxLength) {
        maxLength = longest;
      }
    });

    column.width = Math.min(maxLength + 2, 45);
  });
}

export async function genererPointsExcel(
  annee: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const overview = await getPointsOverview(annee);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Astreintes IADE";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Points");
  worksheet.getCell("A1").value = `Points cumulés — année ${annee}`;
  worksheet.getCell("A1").font = { bold: true, size: 12 };
  worksheet.addRow([]);

  const headers = [
    "IADE",
    ...overview.lignes.map((ligne) => ligne.nom),
    "Points cumulés",
  ];
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };

  if (overview.iades.length === 0) {
    worksheet.addRow(["Aucun IADE actif."]);
  } else {
    for (const iade of overview.iades) {
      const row = worksheet.addRow([
        `${iade.prenom} ${iade.nom}`,
        ...iade.parLigne.map((ligne) => formatLigneCellComplet(ligne)),
        iade.pointsTotal,
      ]);

      row.alignment = { wrapText: true, vertical: "top" };
    }
  }

  ajusterLargeursColonnes(worksheet);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    filename: `points-${annee}.xlsx`,
  };
}
