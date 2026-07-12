"use client";

import type { AstreinteListItem } from "@/server/astreintes";
import { getLigneColorClass } from "@/lib/ligne-colors";
import { AstreinteBrouillonBadge } from "@/components/planning/astreinte-brouillon-badge";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";

type AstreintesTableProps = {
  astreintes: AstreinteListItem[];
  onEdit: (astreinte: AstreinteListItem) => void;
  onDelete: (astreinte: AstreinteListItem) => void;
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AstreintesTable({
  astreintes,
  onEdit,
  onDelete,
}: AstreintesTableProps) {
  if (astreintes.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Aucune astreinte pour ce mois avec les filtres sélectionnés.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left">
            <th className="border border-zinc-200 px-3 py-2">Date</th>
            <th className="border border-zinc-200 px-3 py-2">Ligne</th>
            <th className="border border-zinc-200 px-3 py-2">Créneau</th>
            <th className="border border-zinc-200 px-3 py-2">IADE</th>
            <th className="border border-zinc-200 px-3 py-2">Publication</th>
            <th className="border border-zinc-200 px-3 py-2">
              Points attribués
            </th>
            <th className="border border-zinc-200 px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {astreintes.map((astreinte) => (
            <tr key={astreinte.id}>
              <td className="border border-zinc-200 px-3 py-2 whitespace-nowrap">
                {formatDate(astreinte.date)}
              </td>
              <td className="border border-zinc-200 px-3 py-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getLigneColorClass(astreinte.ligne.id)}`}
                >
                  {astreinte.ligne.nom}
                </span>
              </td>
              <td className="border border-zinc-200 px-3 py-2">
                {LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau]}
              </td>
              <td className="border border-zinc-200 px-3 py-2 whitespace-nowrap">
                {astreinte.iade.prenom} {astreinte.iade.nom}
              </td>
              <td className="border border-zinc-200 px-3 py-2">
                {astreinte.publie ? (
                  <span className="text-xs text-green-700">Publiée</span>
                ) : (
                  <AstreinteBrouillonBadge publie={astreinte.publie} />
                )}
              </td>
              <td className="border border-zinc-200 px-3 py-2 text-center">
                {astreinte.pointsAttribues}
              </td>
              <td className="border border-zinc-200 px-3 py-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(astreinte)}
                    className="text-sm underline"
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(astreinte)}
                    className="text-sm underline"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { formatDate as formatAstreinteDate };
