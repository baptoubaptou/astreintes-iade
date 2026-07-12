"use client";

import type { IadeOption, LigneOption } from "@/server/astreintes";

type PlanningFiltersProps = {
  lignes: LigneOption[];
  iades: IadeOption[];
  selectedLigneId?: string;
  selectedIadeId?: string;
  onFilterChange: (filters: {
    ligneId?: string;
    iadeId?: string;
  }) => void;
};

export function PlanningFilters({
  lignes,
  iades,
  selectedLigneId,
  selectedIadeId,
  onFilterChange,
}: PlanningFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4">
      <div>
        <label htmlFor="filter-ligne" className="mb-1 block text-sm">
          Ligne
        </label>
        <select
          id="filter-ligne"
          value={selectedLigneId ?? ""}
          onChange={(event) =>
            onFilterChange({
              ligneId: event.target.value || undefined,
              iadeId: selectedIadeId,
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        >
          <option value="">Toutes les lignes</option>
          {lignes.map((ligne) => (
            <option key={ligne.id} value={ligne.id}>
              {ligne.nom}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-iade" className="mb-1 block text-sm">
          IADE
        </label>
        <select
          id="filter-iade"
          value={selectedIadeId ?? ""}
          onChange={(event) =>
            onFilterChange({
              ligneId: selectedLigneId,
              iadeId: event.target.value || undefined,
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        >
          <option value="">Tous les IADE</option>
          {iades.map((iade) => (
            <option key={iade.id} value={iade.id}>
              {iade.prenom} {iade.nom}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
