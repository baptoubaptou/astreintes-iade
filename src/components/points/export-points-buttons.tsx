"use client";

type ExportPointsButtonsProps = {
  annee: number;
};

const buttonClass =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium";

export function ExportPointsButtons({ annee }: ExportPointsButtonsProps) {
  const pdfUrl = `/api/export/points-pdf?annee=${annee}`;
  const excelUrl = `/api/export/points-excel?annee=${annee}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={pdfUrl} download className={buttonClass}>
        Exporter en PDF
      </a>
      <a href={excelUrl} download className={buttonClass}>
        Exporter en Excel
      </a>
    </div>
  );
}
