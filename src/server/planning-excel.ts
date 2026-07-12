import ExcelJS from "exceljs";
import type { TypeCreneau } from "@prisma/client";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import {
  getActiveLignesOptions,
  listAstreintes,
  parseMoisParam,
  shiftMois,
  type AstreinteListItem,
} from "@/server/astreintes";

const HEADERS = ["Date", "Jour", "Créneau", "IADE", "Points attribués"] as const;

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

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nomFeuilleExcel(nom: string): string {
  return nom.replace(/[\\/*?:[\]]/g, "").trim().slice(0, 31) || "Planning";
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

function astreinteVersLigne(astreinte: AstreinteListItem): (string | number)[] {
  return [
    formatDateCourte(astreinte.date),
    formatJourSemaine(astreinte.date),
    LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau as TypeCreneau],
    `${astreinte.iade.prenom} ${astreinte.iade.nom}`,
    astreinte.pointsAttribues,
  ];
}

function ajusterLargeursColonnes(worksheet: ExcelJS.Worksheet): void {
  worksheet.columns.forEach((column) => {
    let maxLength = HEADERS[column.number! - 1]?.length ?? 10;

    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value === null || cell.value === undefined ? "" : String(cell.value);
      if (value.length > maxLength) {
        maxLength = value.length;
      }
    });

    column.width = Math.min(maxLength + 2, 50);
  });
}

function remplirFeuille(
  worksheet: ExcelJS.Worksheet,
  astreintes: AstreinteListItem[],
): void {
  const headerRow = worksheet.addRow([...HEADERS]);
  headerRow.font = { bold: true };

  if (astreintes.length === 0) {
    worksheet.addRow(["Aucune astreinte publiée sur ce mois."]);
  } else {
    for (const astreinte of astreintes) {
      worksheet.addRow(astreinteVersLigne(astreinte));
    }
  }

  ajusterLargeursColonnes(worksheet);
}

export async function genererPlanningExcel(options: {
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

  const groupes = groupAstreintesParLigne(astreintes, lignesFiltrees);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Astreintes IADE";
  workbook.created = new Date();

  const uneSeuleLigne = lignesFiltrees.length === 1;

  for (const ligne of lignesFiltrees) {
    const groupe = groupes.get(ligne.id);
    if (!groupe) {
      continue;
    }

    const sheetTitle = uneSeuleLigne
      ? nomFeuilleExcel(groupe.ligneNom)
      : nomFeuilleExcel(groupe.ligneNom);

    const worksheet = workbook.addWorksheet(sheetTitle);
    worksheet.getCell("A1").value = `Planning — ${moisLabel}`;
    worksheet.getCell("A1").font = { bold: true, size: 12 };
    worksheet.getCell("A2").value = `Ligne : ${groupe.ligneNom}`;
    worksheet.addRow([]);

    remplirFeuille(worksheet, groupe.astreintes);
  }

  if (workbook.worksheets.length === 0) {
    const worksheet = workbook.addWorksheet("Planning");
    worksheet.getCell("A1").value = `Planning — ${moisLabel}`;
    worksheet.getCell("A1").font = { bold: true, size: 12 };
    worksheet.getCell("A2").value = `Ligne(s) : ${lignesLabel}`;
    worksheet.addRow([]);
    remplirFeuille(worksheet, []);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filename = options.ligneId
    ? `planning-${mois}-${slugify(lignesLabel)}.xlsx`
    : `planning-${mois}.xlsx`;

  return { buffer, filename };
}
