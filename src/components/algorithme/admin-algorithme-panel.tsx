"use client";

import { useState } from "react";
import { ModeAttribution } from "@prisma/client";
import { LIBELLES_MODE_ATTRIBUTION } from "@/server/parametre-algorithme";

type AdminAlgorithmePanelProps = {
  modeInitial: ModeAttribution;
};

export function AdminAlgorithmePanel({
  modeInitial,
}: AdminAlgorithmePanelProps) {
  const [mode, setMode] = useState(modeInitial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleChange(nextMode: ModeAttribution) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setIsSaving(true);

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
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Paramètre <code className="text-xs">mode_attribution</code> — valeur
        actuelle :{" "}
        <span className="font-medium text-zinc-900">
          {LIBELLES_MODE_ATTRIBUTION[mode]}
        </span>
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode d&apos;attribution</legend>
        {Object.values(ModeAttribution).map((value) => {
          const isLisse = value === ModeAttribution.LISSE;
          const disabled = isLisse || isSaving;

          return (
            <label
              key={value}
              title={isLisse ? "Fonctionnalité à venir" : undefined}
              className={`flex items-center gap-2 text-sm ${isLisse ? "cursor-not-allowed text-zinc-400" : ""}`}
            >
              <input
                type="radio"
                name="modeAttribution"
                value={value}
                checked={mode === value}
                disabled={disabled}
                onChange={() => handleChange(value)}
              />
              <span>{LIBELLES_MODE_ATTRIBUTION[value]}</span>
            </label>
          );
        })}
      </fieldset>

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
