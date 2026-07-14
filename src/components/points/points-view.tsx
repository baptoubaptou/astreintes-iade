"use client";

import { Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PointsIadeRow, PointsOverview } from "@/server/points";
import {
  formatLigneCell,
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

function calculerMoyennePoints(iades: PointsIadeRow[]): number {
  if (iades.length === 0) {
    return 0;
  }

  const total = iades.reduce((sum, iade) => sum + iade.pointsTotal, 0);
  return total / iades.length;
}

function calculerMedianePoints(iades: PointsIadeRow[]): number {
  if (iades.length === 0) {
    return 0;
  }

  const sorted = [...iades]
    .map((iade) => iade.pointsTotal)
    .sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

function formatStatistique(valeur: number): string {
  return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(1);
}

function doitAfficherSeparateur(
  index: number,
  iades: PointsIadeRow[],
  seuil: number,
): boolean {
  const suivant = iades[index + 1];
  if (!suivant) {
    return false;
  }

  return iades[index].pointsTotal >= seuil && suivant.pointsTotal < seuil;
}

function IadeRow({
  iade,
  isCurrentUser,
}: {
  iade: PointsIadeRow;
  isCurrentUser: boolean;
}) {
  return (
    <tr className={isCurrentUser ? "bg-amber-50" : undefined}>
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
          {formatLigneCell(ligne.astreintes, ligne.points)}
        </td>
      ))}
    </tr>
  );
}

function SeparateurMoyenneRow({
  colonnes,
  moyenne,
}: {
  colonnes: number;
  moyenne: number;
}) {
  return (
    <tr className="bg-zinc-50">
      <td
        colSpan={colonnes}
        className="border-y-2 border-zinc-400 px-4 py-2 text-center text-xs font-medium text-red-600"
      >
        Moyenne : {formatStatistique(moyenne)} points
      </td>
    </tr>
  );
}

function SeparateurMedianeRow({
  colonnes,
  mediane,
}: {
  colonnes: number;
  mediane: number;
}) {
  return (
    <tr className="bg-zinc-50">
      <td
        colSpan={colonnes}
        className="border-y-2 border-yellow-400 px-4 py-2 text-center text-xs font-medium text-yellow-600"
      >
        Médiane : {formatStatistique(mediane)} points
      </td>
    </tr>
  );
}

export function PointsTable({ overview, currentUserId }: PointsTableProps) {
  const moyenne = calculerMoyennePoints(overview.iades);
  const mediane = calculerMedianePoints(overview.iades);
  const colonnes = 2 + overview.lignes.length;

  return (
    <div className="overflow-x-auto rounded border border-zinc-200">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Nom</th>
            <th className="px-4 py-2 font-medium">Points cumulés</th>
            {overview.lignes.map((ligne) => (
              <th key={ligne.id} className="px-4 py-2 font-medium">
                {ligne.nom}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {overview.iades.map((iade, index) => {
            const isCurrentUser = currentUserId === iade.iadeId;
            const afficherMoyenne = doitAfficherSeparateur(
              index,
              overview.iades,
              moyenne,
            );
            const afficherMediane = doitAfficherSeparateur(
              index,
              overview.iades,
              mediane,
            );

            return (
              <Fragment key={iade.iadeId}>
                <IadeRow iade={iade} isCurrentUser={isCurrentUser} />
                {afficherMoyenne ? (
                  <SeparateurMoyenneRow colonnes={colonnes} moyenne={moyenne} />
                ) : null}
                {afficherMediane ? (
                  <SeparateurMedianeRow colonnes={colonnes} mediane={mediane} />
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
