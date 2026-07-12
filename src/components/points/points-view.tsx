"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PointsOverview } from "@/server/points";
import {
  formatCreneauDetail,
  formatLigneCell,
  shouldShowCreneauDetail,
} from "@/server/points-export-format";

type PointsYearSelectorProps = {
  annee: number;
};

export function PointsYearSelector({ annee }: PointsYearSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("annee", event.target.value);
    router.push(`/points?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="annee" className="text-sm text-zinc-600">
        Année civile
      </label>
      <select
        id="annee"
        value={String(annee)}
        onChange={handleChange}
        className="rounded border border-zinc-300 px-2 py-1 text-sm"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

type PointsTableProps = {
  overview: PointsOverview;
  currentUserId?: string;
};

export function PointsTable({ overview, currentUserId }: PointsTableProps) {
  return (
    <div className="overflow-x-auto rounded border border-zinc-200">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">IADE</th>
            <th className="px-4 py-2 font-medium">Points cumulés</th>
            {overview.lignes.map((ligne) => (
              <th key={ligne.id} className="px-4 py-2 font-medium">
                {ligne.nom}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {overview.iades.map((iade) => {
            const isCurrentUser = currentUserId === iade.iadeId;

            return (
              <tr
                key={iade.iadeId}
                className={isCurrentUser ? "bg-amber-50" : undefined}
              >
                <td className="px-4 py-2">
                  <span className="font-medium">
                    {iade.prenom} {iade.nom}
                  </span>
                  {isCurrentUser ? (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-900">
                      Vous
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 font-medium">{iade.pointsTotal}</td>
                {iade.parLigne.map((ligne) => (
                  <td key={ligne.ligneId} className="px-4 py-2 text-zinc-700">
                    <div>{formatLigneCell(ligne.astreintes, ligne.points)}</div>
                    {shouldShowCreneauDetail(ligne) ? (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatCreneauDetail(ligne)}
                      </p>
                    ) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
