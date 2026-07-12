"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TypeCreneau } from "@prisma/client";
import {
  LIBELLES_TYPE_CRENEAU,
  TYPES_CRENEAU,
  type PoidsCreneauLigne,
} from "@/server/poids-creneaux";

type AdminPoidsCreneauxPanelProps = {
  lignes: PoidsCreneauLigne[];
};

type CellKey = `${string}:${TypeCreneau}`;

function cellKey(ligneId: string, typeCreneau: TypeCreneau): CellKey {
  return `${ligneId}:${typeCreneau}`;
}

export function AdminPoidsCreneauxPanel({
  lignes: initialLignes,
}: AdminPoidsCreneauxPanelProps) {
  const router = useRouter();
  const [lignes, setLignes] = useState(initialLignes);
  const [drafts, setDrafts] = useState<Record<CellKey, string>>({});
  const [saving, setSaving] = useState<Record<CellKey, boolean>>({});
  const [saved, setSaved] = useState<Record<CellKey, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function getDraftValue(
    ligne: PoidsCreneauLigne,
    typeCreneau: TypeCreneau,
  ): string {
    const key = cellKey(ligne.ligneId, typeCreneau);
    return drafts[key] ?? String(ligne.poids[typeCreneau].valeur);
  }

  function handleDraftChange(
    ligneId: string,
    typeCreneau: TypeCreneau,
    value: string,
  ) {
    const key = cellKey(ligneId, typeCreneau);
    setDrafts((current) => ({ ...current, [key]: value }));
    setSaved((current) => ({ ...current, [key]: false }));
  }

  async function sauvegarderCellule(
    ligne: PoidsCreneauLigne,
    typeCreneau: TypeCreneau,
  ) {
    const key = cellKey(ligne.ligneId, typeCreneau);
    const rawValue = getDraftValue(ligne, typeCreneau).trim();
    const parsed = Number(rawValue);
    const valeurActuelle = ligne.poids[typeCreneau].valeur;

    if (rawValue === "" || !Number.isInteger(parsed) || parsed < 0) {
      setError("Le poids doit être un entier positif ou nul.");
      setDrafts((current) => ({
        ...current,
        [key]: String(valeurActuelle),
      }));
      return;
    }

    if (parsed === valeurActuelle && ligne.poids[typeCreneau].id !== null) {
      return;
    }

    setSaving((current) => ({ ...current, [key]: true }));
    setError(null);

    try {
      const response = await fetch("/api/admin/poids-creneaux", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ligneId: ligne.ligneId,
          typeCreneau,
          poids: parsed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement.");
        setDrafts((current) => ({
          ...current,
          [key]: String(valeurActuelle),
        }));
        return;
      }

      setLignes((current) =>
        current.map((entry) => {
          if (entry.ligneId !== ligne.ligneId) {
            return entry;
          }

          return {
            ...entry,
            poids: {
              ...entry.poids,
              [typeCreneau]: {
                id: data.id,
                valeur: data.poids,
              },
            },
          };
        }),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSaved((current) => ({ ...current, [key]: true }));
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
      setDrafts((current) => ({
        ...current,
        [key]: String(valeurActuelle),
      }));
    } finally {
      setSaving((current) => ({ ...current, [key]: false }));
    }
  }

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Aucune ligne active. Activez ou créez une ligne depuis{" "}
        <a href="/admin/lignes" className="underline">
          Lignes d&apos;astreinte
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {lignes.map((ligne) => (
        <section
          key={ligne.ligneId}
          className="overflow-x-auto rounded border border-zinc-200"
        >
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h2 className="font-medium">{ligne.ligneNom}</h2>
            <p className="text-xs text-zinc-500">
              Priorité {ligne.ordrePriorite}
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-zinc-200">
                {TYPES_CRENEAU.map((type) => (
                  <th key={type} className="px-4 py-2 font-medium">
                    {LIBELLES_TYPE_CRENEAU[type]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {TYPES_CRENEAU.map((type) => {
                  const key = cellKey(ligne.ligneId, type);
                  const isSaving = saving[key];
                  const isSaved = saved[key];

                  return (
                    <td key={type} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={getDraftValue(ligne, type)}
                          disabled={isSaving}
                          onChange={(event) =>
                            handleDraftChange(
                              ligne.ligneId,
                              type,
                              event.target.value,
                            )
                          }
                          onBlur={() => sauvegarderCellule(ligne, type)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50"
                          aria-label={`Poids ${LIBELLES_TYPE_CRENEAU[type]} — ${ligne.ligneNom}`}
                        />
                        {isSaving ? (
                          <span className="text-xs text-zinc-500">…</span>
                        ) : isSaved ? (
                          <span className="text-xs text-green-700">OK</span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
