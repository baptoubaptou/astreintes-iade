"use client";

import { useState } from "react";
import {
  LIBELLES_MODE_ATTRIBUTION,
  MODE_ATTRIBUTION,
  MODES_ATTRIBUTION,
  type ModeAttributionValue,
} from "@/lib/mode-attribution";
import type { SeuilEcartAberrantLigne } from "@/types/parametre-algorithme";

type AdminAlgorithmePanelProps = {
  modeInitial: ModeAttributionValue;
  seuilsInitiaux: SeuilEcartAberrantLigne[];
};

function libelleSeuilEffectif(ligne: SeuilEcartAberrantLigne): string {
  if (ligne.seuilPersonnalise != null) {
    return `${ligne.seuilEffectif} points (personnalisé)`;
  }

  return `${ligne.seuilEffectif} points (défaut : 2 × ${ligne.poidsMax})`;
}

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

  async function handleChangeMode(nextMode: ModeAttributionValue) {
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

      <section
        className={`space-y-4 rounded border p-4 ${
          mode === MODE_ATTRIBUTION.LISSE
            ? "border-zinc-200"
            : "border-zinc-100 bg-zinc-50 opacity-90"
        }`}
      >
        <div className="space-y-3">
          <h2 className="text-sm font-medium">
            Seuil d&apos;écart aberrant entre IADE (mode lissé)
          </h2>

          <div className="rounded border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-950">
            <p className="font-medium">À quoi ça sert ?</p>
            <p className="mt-1">
              Après la première passe de lissage (échanges de blocs sans casser
              la continuité), l&apos;algorithme mesure l&apos;
              <strong>écart de points</strong> sur chaque ligne : différence
              entre l&apos;IADE le plus haut et le plus bas.
            </p>
            <p className="mt-2">
              Si cet écart <strong>dépasse le seuil</strong> configuré ci-dessous,
              une seconde passe peut exceptionnellement{" "}
              <strong>casser un bloc de continuité</strong> pour le réduire —
              uniquement si la variance globale n&apos;est pas dégradée.
            </p>
            <p className="mt-2 text-blue-900">
              Exemple : seuil = 8 points → si un IADE est à 20 points et un autre
              à 10 (écart 10), la passe 2 peut intervenir ; si l&apos;écart est 6,
              aucune cassure n&apos;est tentée.
            </p>
          </div>

          {mode !== MODE_ATTRIBUTION.LISSE ? (
            <p className="text-sm text-zinc-600">
              Ce réglage ne s&apos;applique que lorsque le mode{" "}
              <strong>Lissé</strong> est actif. Il est affiché ici à titre
              informatif.
            </p>
          ) : null}

          <p className="text-sm text-zinc-600">
            <strong>Valeur par défaut</strong> (champ vide) :{" "}
            <span className="font-mono">2 × poids max</span> des créneaux de la
            ligne. Le poids max est celui configuré dans Poids des créneaux.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-600">
                <th className="py-2 pr-4 font-medium">Ligne</th>
                <th className="py-2 pr-4 font-medium">Poids max créneau</th>
                <th className="py-2 pr-4 font-medium">Défaut (2 × poids max)</th>
                <th className="py-2 pr-4 font-medium">Seuil en vigueur</th>
                <th className="py-2 pr-4 font-medium">Personnaliser</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {seuils.map((ligne) => (
                <tr key={ligne.ligneId} className="border-b border-zinc-100">
                  <td className="py-3 pr-4 font-medium text-zinc-900">
                    {ligne.nom}
                  </td>
                  <td className="py-3 pr-4 font-mono text-zinc-600">
                    {ligne.poidsMax}
                  </td>
                  <td className="py-3 pr-4 font-mono text-zinc-600">
                    {ligne.seuilDefaut}
                  </td>
                  <td className="py-3 pr-4 text-zinc-900">
                    {libelleSeuilEffectif(ligne)}
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={`Seuil personnalisé pour ${ligne.nom}`}
                      placeholder={`Défaut : ${ligne.seuilDefaut}`}
                      value={draftSeuils[ligne.ligneId] ?? ""}
                      onChange={(event) =>
                        setDraftSeuils((current) => ({
                          ...current,
                          [ligne.ligneId]: event.target.value,
                        }))
                      }
                      disabled={mode !== MODE_ATTRIBUTION.LISSE}
                      className="w-32 rounded border border-zinc-300 px-2 py-1 disabled:bg-zinc-100"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Vide = défaut
                    </p>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => handleSaveSeuil(ligne)}
                      disabled={
                        savingLigneId === ligne.ligneId ||
                        mode !== MODE_ATTRIBUTION.LISSE
                      }
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
