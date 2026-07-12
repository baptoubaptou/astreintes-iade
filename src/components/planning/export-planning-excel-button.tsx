"use client";

type ExportPlanningExcelButtonProps = {
  mois: string;
  ligneId?: string;
  className?: string;
};

function buildExportUrl(mois: string, ligneId?: string): string {
  const params = new URLSearchParams({ mois });
  if (ligneId) {
    params.set("ligneId", ligneId);
  }
  return `/api/export/planning-excel?${params.toString()}`;
}

export function ExportPlanningExcelButton({
  mois,
  ligneId,
  className = "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium",
}: ExportPlanningExcelButtonProps) {
  return (
    <a
      href={buildExportUrl(mois, ligneId)}
      download
      className={className}
      title="Exporte uniquement les astreintes publiées"
    >
      Exporter en Excel
    </a>
  );
}
