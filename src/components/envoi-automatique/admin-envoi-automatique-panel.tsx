"use client";

import { useMemo, useState } from "react";
import type { JourSemaine } from "@prisma/client";
import { formaterApercuEnvoiAutomatique } from "@/lib/envoi-automatique-periode";
import { JOURS_SEMAINE, LIBELLES_JOUR_SEMAINE } from "@/lib/jour-semaine";
import type { ConfigurationEnvoiAutomatiqueAvecApercu } from "@/server/envoi-automatique";

type AdminEnvoiAutomatiquePanelProps = {
  configurationInitiale: ConfigurationEnvoiAutomatiqueAvecApercu;
};

export function AdminEnvoiAutomatiquePanel({
  configurationInitiale,
}: AdminEnvoiAutomatiquePanelProps) {
  const [emailDestinataire, setEmailDestinataire] = useState(
    configurationInitiale.emailDestinataire,
  );
  const [jourEnvoi, setJourEnvoi] = useState<JourSemaine>(
    configurationInitiale.jourEnvoi,
  );
  const [actif, setActif] = useState(configurationInitiale.actif);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apercu = useMemo(
    () => formaterApercuEnvoiAutomatique(jourEnvoi),
    [jourEnvoi],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/envoi-automatique", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDestinataire,
          jourEnvoi,
          actif,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible d'enregistrer la configuration.",
        );
        return;
      }

      setEmailDestinataire(data.emailDestinataire);
      setJourEnvoi(data.jourEnvoi);
      setActif(data.actif);
      setMessage("Configuration enregistrée.");
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div>
        <label htmlFor="emailDestinataire" className="mb-1 block text-sm font-medium">
          E-mail destinataire
        </label>
        <input
          id="emailDestinataire"
          type="email"
          value={emailDestinataire}
          onChange={(event) => setEmailDestinataire(event.target.value)}
          placeholder="secretariat@exemple.fr"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          autoComplete="email"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Adresse qui recevra le planning exporté (ex. secrétariat).
        </p>
      </div>

      <div>
        <label htmlFor="jourEnvoi" className="mb-1 block text-sm font-medium">
          Jour d&apos;envoi
        </label>
        <select
          id="jourEnvoi"
          value={jourEnvoi}
          onChange={(event) => setJourEnvoi(event.target.value as JourSemaine)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          {JOURS_SEMAINE.map((jour) => (
            <option key={jour} value={jour}>
              {LIBELLES_JOUR_SEMAINE[jour]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="actif"
          type="checkbox"
          checked={actif}
          onChange={(event) => setActif(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        <label htmlFor="actif" className="text-sm">
          Envoi automatique actif
        </label>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium">Aperçu de la prochaine échéance</p>
        <p className="mt-1">{apercu.libelle}</p>
        {!actif ? (
          <p className="mt-2 text-xs text-blue-800">
            L&apos;envoi automatique est désactivé : aucun e-mail ne sera
            envoyé tant que cette option n&apos;est pas activée.
          </p>
        ) : null}
      </div>

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

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {isSaving ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
