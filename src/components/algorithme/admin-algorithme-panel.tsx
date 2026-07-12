"use client";

import { useState } from "react";
import type { ModeAttribution } from "@prisma/client";
import {
  LIBELLES_MODE_ATTRIBUTION,
  MODES_ATTRIBUTION,
} from "@/lib/mode-attribution";
import type { SeuilEcartAberrantLigne } from "@/server/parametre-algorithme";

type AdminAlgorithmePanelProps = {
  modeInitial: ModeAttribution;
  seuilsInitiaux: SeuilEcartAberrantLigne[];
};

export function AdminAlgorithmePanel({
  modeInitial,
  seuilsInitiaux,
}: AdminAlgorithmePanelProps) {
  const [mode, setMode] = useState(modeInitial);
  const [seuils, setSeuils] = useState(seuilsInitiaux);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [savingLigneId, setSavingLigneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftSeuils, setDraftSeuils] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      seuilsInitiaux.map((ligne) => [
        ligne.ligneId,
        ligne.seuilPersonnalise != null
          ? String(ligne.seuilPersonnalise)
          : "",
      ]),
    ),
  );

  async function handleChangeMode(nextMode: ModeAttribution) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setIsSavingMode(true);

    try {
      const response = await fetch("/api/admin/algorithme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMode(modeInitial);
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de mettre à jour le mode.",
        );
        return;
      }

      setMessage("Mode d'attribution enregistré.");
    } catch {
      setMode(modeInitial);
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsSavingMode(false);
    }
  }

  async function handleSaveSeuil(ligne: SeuilEcartAberrantLigne) {
    setError(null);
    setMessage(null);
    setSavingLigneId(ligne.ligneId);

    const raw = draftSeuils[ligne.ligneId] ?? "";
    const seuil = raw.trim() === "" ? null : Number(raw);

    if (seuil !== null && (!Number.isInteger(seuil) || seuil < 1)) {
      setError(
        `Seuil invalide pour ${ligne.nom} : entier positif ou vide pour la valeur par défaut.`,
      );
      setSavingLigneId(null);
      return;
    }

    try {
      const response = await fetch("/api/admin/algorithme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seuilEcartAberrant: { ligneId: ligne.ligneId, seuil },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de mettre à jour le seuil.",
        );
        return;
      }

      if (Array.isArray(data.seuilsEcartAberrant)) {
        setSeuils(data.seuilsEcartAberrant as SeuilEcartAberrantLigne[]);
      }

      setMessage(`Seuil ${ligne.nom} enregistré.`);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSavingLigneId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="text-sm text-zinc-600">
          Paramètre <code className="text-xs">mode_attribution</code> — valeur
          actuelle :{" "}
          <span className="font-medium text-zinc-900">
            {LIBELLES_MODE_ATTRIBUTION[mode]}
          </span>
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mode d&apos;attribution</legend>
        {MODES_ATTRIBUTION.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="modeAttribution"
              value={value}
              checked={mode === value}
              disabled={isSavingMode}
              onChange={() => handleChangeMode(value)}
            />
            <span>{LIBELLES_MODE_ATTRIBUTION[value]}</span>
          </label>
        ))}
        </fieldset>
      </section>

      <section className="space-y-4 rounded border border-zinc-200 p-4">
        <div>
          <h2 className="text-sm font-medium">
            Seuil d&apos;écart aberrant (mode lissé)
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Paramètre <code className="text-xs">lisse_seuil_ecart_aberrant</code>{" "}
            — réglage par ligne sur{" "}
            <code className="text-xs">LigneAstreinte.seuilEcartAberrant</code>.
            Laissez vide pour appliquer le défaut :{" "}
            <strong>2× le poids du créneau le plus élevé</strong> de la ligne.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-600">
                <th className="py-2 pr-4 font-medium">Ligne</th>
                <th className="py-2 pr-4 font-medium">Défaut (2× poids max)</th>
                <th className="py-2 pr-4 font-medium">Seuil personnalisé</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {seuils.map((ligne) => (
                <tr key={ligne.ligneId} className="border-b border-zinc-100">
                  <td className="py-3 pr-4 font-medium text-zinc-900">
                    {ligne.nom}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {ligne.seuilDefaut}
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder={String(ligne.seuilDefaut)}
                      value={draftSeuils[ligne.ligneId] ?? ""}
                      onChange={(event) =>
                        setDraftSeuils((current) => ({
                          ...current,
                          [ligne.ligneId]: event.target.value,
                        }))
                      }
                      className="w-28 rounded border border-zinc-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => handleSaveSeuil(ligne)}
                      disabled={savingLigneId === ligne.ligneId}
                      className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-50"
                    >
                      {savingLigneId === ligne.ligneId
                        ? "Enregistrement…"
                        : "Enregistrer"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
    </div>
  );
}
