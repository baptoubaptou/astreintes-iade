"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TypeBonusContinuite } from "@prisma/client";
import {
  LIBELLES_BONUS_CONTINUITE,
  TYPES_BONUS_CONTINUITE,
  type BonusContinuiteLigne,
} from "@/server/bonus-continuite";

type AdminBonusContinuitePanelProps = {
  lignes: BonusContinuiteLigne[];
};

type CellKey = `${string}:${TypeBonusContinuite}`;

function cellKey(ligneId: string, type: TypeBonusContinuite): CellKey {
  return `${ligneId}:${type}`;
}

export function AdminBonusContinuitePanel({
  lignes: initialLignes,
}: AdminBonusContinuitePanelProps) {
  const router = useRouter();
  const [lignes, setLignes] = useState(initialLignes);
  const [drafts, setDrafts] = useState<Record<CellKey, string>>({});
  const [saving, setSaving] = useState<Record<CellKey, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function getDraftValue(
    ligne: BonusContinuiteLigne,
    type: TypeBonusContinuite,
  ): string {
    const key = cellKey(ligne.ligneId, type);
    return drafts[key] ?? String(ligne.bonus[type].valeur);
  }

  async function sauvegarderCellule(
    ligne: BonusContinuiteLigne,
    type: TypeBonusContinuite,
  ) {
    const key = cellKey(ligne.ligneId, type);
    const rawValue = getDraftValue(ligne, type).trim();
    const parsed = Number(rawValue);
    const valeurActuelle = ligne.bonus[type].valeur;

    if (rawValue === "" || !Number.isInteger(parsed) || parsed < 0) {
      setError("Le bonus doit être un entier positif ou nul.");
      return;
    }

    if (parsed === valeurActuelle && ligne.bonus[type].id !== null) {
      return;
    }

    setSaving((current) => ({ ...current, [key]: true }));
    setError(null);

    try {
      const response = await fetch("/api/admin/bonus-continuite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ligneId: ligne.ligneId,
          type,
          bonus: parsed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Erreur lors de la sauvegarde.",
        );
        return;
      }

      setLignes((current) =>
        current.map((entry) =>
          entry.ligneId === ligne.ligneId
            ? {
                ...entry,
                bonus: {
                  ...entry.bonus,
                  [type]: { id: data.id, valeur: data.bonus },
                },
              }
            : entry,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving((current) => ({ ...current, [key]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Bonus ajouté lorsqu&apos;un même IADE couvre jour+nuit (24h) ou le
        week-end complet (48h). Le bonus 48h remplace les deux bonus 24h du
        samedi et du dimanche.
      </p>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Ligne</th>
              {TYPES_BONUS_CONTINUITE.map((type) => (
                <th key={type} className="px-4 py-2 font-medium">
                  {LIBELLES_BONUS_CONTINUITE[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {lignes.map((ligne) => (
              <tr key={ligne.ligneId}>
                <td className="px-4 py-2 font-medium">{ligne.ligneNom}</td>
                {TYPES_BONUS_CONTINUITE.map((type) => {
                  const key = cellKey(ligne.ligneId, type);
                  return (
                    <td key={type} className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={getDraftValue(ligne, type)}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        onBlur={() => sauvegarderCellule(ligne, type)}
                        disabled={saving[key]}
                        className="w-20 rounded border border-zinc-300 px-2 py-1"
                        aria-label={`${LIBELLES_BONUS_CONTINUITE[type]} — ${ligne.ligneNom}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
