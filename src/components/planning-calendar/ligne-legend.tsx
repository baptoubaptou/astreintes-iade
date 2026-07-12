import { getLigneLegendColors } from "@/lib/ligne-colors";

type LigneLegendProps = {
  lignes: Array<{ id: string; nom: string }>;
};

export function LigneLegend({ lignes }: LigneLegendProps) {
  const items = getLigneLegendColors(lignes);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <span className="font-medium text-zinc-700">Légende :</span>
      {items.map((item) => (
        <div key={item.nom} className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded border ${item.colorClass}`}
            aria-hidden
          />
          <span>{item.nom}</span>
        </div>
      ))}
    </div>
  );
}
