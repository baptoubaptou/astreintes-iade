"use client";

type ExportPlanningPdfButtonProps = {
  mois: string;
  ligneId?: string;
  className?: string;
};

function buildExportUrl(mois: string, ligneId?: string): string {
  const params = new URLSearchParams({ mois });
  if (ligneId) {
    params.set("ligneId", ligneId);
  }
  return `/api/export/planning-pdf?${params.toString()}`;
}

export function ExportPlanningPdfButton({
  mois,
  ligneId,
  className = "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium",
}: ExportPlanningPdfButtonProps) {
  return (
    <a
      href={buildExportUrl(mois, ligneId)}
      download
      className={className}
      title="Exporte uniquement les astreintes publiées"
    >
      Exporter en PDF
    </a>
  );
}
