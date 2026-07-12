"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AstreinteBloquantDesactivation,
  JourFerieItem,
  PreviewDesactivationJourFerie,
} from "@/server/jours-feries";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";

type AdminJoursFeriesPanelProps = {
  annee: number;
  anneeCourante: number;
  anneeSuivante: number;
  joursFeries: JourFerieItem[];
};

function formatDateFr(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AdminJoursFeriesPanel({
  annee,
  anneeCourante,
  anneeSuivante,
  joursFeries: initialJoursFeries,
}: AdminJoursFeriesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [joursFeries, setJoursFeries] = useState(initialJoursFeries);
  const [date, setDate] = useState("");
  const [nom, setNom] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [astreintesBloquantes, setAstreintesBloquantes] = useState<
    AstreinteBloquantDesactivation[]
  >([]);
  const [deactivationPreview, setDeactivationPreview] = useState<{
    jourId: string;
    preview: PreviewDesactivationJourFerie;
  } | null>(null);

  useEffect(() => {
    setJoursFeries(initialJoursFeries);
    setFeedback(null);
    setError(null);
    setAstreintesBloquantes([]);
    setDeactivationPreview(null);
  }, [annee, initialJoursFeries]);

  function navigateAnnee(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("annee", String(target));
    router.push(`/admin/jours-feries?${params.toString()}`);
  }

  async function synchroniser(targetAnnee: number) {
    setIsLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "synchroniser", annee: targetAnnee }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erreur lors de la synchronisation.");
        return;
      }

      if (targetAnnee === annee) {
        setJoursFeries(data.joursFeries ?? []);
      }

      setFeedback(
        `${data.inseres} jour(s) férié(s) ajouté(s) pour ${targetAnnee} (${data.ignores} déjà présent(s), ignoré(s)).`,
      );
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function ajouterManuel(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, nom }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erreur lors de l'ajout.");
        return;
      }

      if (data.date?.startsWith(String(annee))) {
        setJoursFeries((current) =>
          [...current, data as JourFerieItem].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      }

      setDate("");
      setNom("");
      setFeedback("Jour férié manuel ajouté.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function patchJourFerie(
    id: string,
    actif: boolean,
    confirmer = false,
  ): Promise<JourFerieItem | null> {
    const response = await fetch(`/api/admin/jours-feries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif, confirmer }),
    });

    const data = await response.json();

    if (response.status === 400 && Array.isArray(data.astreintesBloquantes)) {
      setAstreintesBloquantes(data.astreintesBloquantes);
      setError(
        data.error ??
          "Des astreintes bloquent la désactivation de ce jour férié.",
      );
      return null;
    }

    if (data.requiresConfirmation && data.preview) {
      setDeactivationPreview({
        jourId: id,
        preview: data.preview as PreviewDesactivationJourFerie,
      });
      return null;
    }

    if (!response.ok) {
      setError(data.error ?? "Erreur lors de la mise à jour.");
      return null;
    }

    return data as JourFerieItem;
  }

  async function toggleActif(id: string, actif: boolean) {
    setIsLoading(true);
    setError(null);
    setAstreintesBloquantes([]);
    setDeactivationPreview(null);

    try {
      const updated = await patchJourFerie(id, actif);

      if (updated) {
        setJoursFeries((current) =>
          current.map((jour) => (jour.id === id ? updated : jour)),
        );
        if (!actif) {
          setFeedback("Jour férié désactivé.");
        }
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmerDesactivation() {
    if (!deactivationPreview) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const updated = await patchJourFerie(
        deactivationPreview.jourId,
        false,
        true,
      );

      if (updated) {
        setJoursFeries((current) =>
          current.map((jour) =>
            jour.id === deactivationPreview.jourId ? updated : jour,
          ),
        );
        setDeactivationPreview(null);
        setFeedback(
          "Jour férié désactivé. Les disponibilités et préférences scindées associées ont été supprimées.",
        );
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  function annulerDesactivation() {
    setDeactivationPreview(null);
  }

  return (
    <div className="space-y-8">
      <section className="rounded border border-zinc-200 p-6">
        <h2 className="text-lg font-medium">Synchronisation automatique</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Calcule les jours fériés français (fixes + Pâques) et les insère en base
          s&apos;ils n&apos;existent pas encore. Les enregistrements existants ne sont
          jamais écrasés.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => synchroniser(anneeCourante)}
            disabled={isLoading}
            className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Synchroniser l&apos;année {anneeCourante}
          </button>
          <button
            type="button"
            onClick={() => synchroniser(anneeSuivante)}
            disabled={isLoading}
            className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Synchroniser l&apos;année {anneeSuivante}
          </button>
        </div>
      </section>

      {feedback ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {feedback}
        </p>
      ) : null}

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {astreintesBloquantes.length > 0 ? (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Astreintes à traiter avant désactivation
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {astreintesBloquantes.map((astreinte, index) => (
              <li key={`${astreinte.date}-${astreinte.ligneNom}-${index}`}>
                {astreinte.date} — {astreinte.ligneNom} —{" "}
                {LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau]} —{" "}
                {astreinte.iadeNom}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {deactivationPreview ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Confirmer la désactivation
          </p>
          <p className="mt-2 text-sm text-amber-800">
            Cette action supprimera{" "}
            <strong>{deactivationPreview.preview.disponibilites}</strong>{" "}
            disponibilité(s) Jour/Nuit et{" "}
            <strong>{deactivationPreview.preview.preferencesContinuite}</strong>{" "}
            préférence(s) de continuité (24h/48h) liées à cette date, puis
            désactivera le jour férié. Le jour repassera en mode semaine normal.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmerDesactivation}
              disabled={isLoading}
              className="rounded border border-amber-700 bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isLoading ? "Suppression..." : "Confirmer la désactivation"}
            </button>
            <button
              type="button"
              onClick={annulerDesactivation}
              disabled={isLoading}
              className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Jours fériés — {annee}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigateAnnee(annee - 1)}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
          >
            {annee - 1}
          </button>
          <button
            type="button"
            onClick={() => navigateAnnee(annee + 1)}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
          >
            {annee + 1}
          </button>
        </div>
      </section>

      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Nom</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Actif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {joursFeries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-zinc-600">
                  Aucun jour férié pour {annee}. Lancez une synchronisation.
                </td>
              </tr>
            ) : (
              joursFeries.map((jour) => (
                <tr key={jour.id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDateFr(jour.date)}
                  </td>
                  <td className="px-4 py-2">{jour.nom}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        jour.source === "AUTO"
                          ? "bg-blue-100 text-blue-900"
                          : "bg-violet-100 text-violet-900"
                      }`}
                    >
                      {jour.source}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={jour.actif}
                        disabled={isLoading}
                        onChange={(event) =>
                          toggleActif(jour.id, event.target.checked)
                        }
                      />
                      <span>{jour.actif ? "Actif" : "Désactivé"}</span>
                    </label>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded border border-zinc-200 p-6">
        <h2 className="text-lg font-medium">Ajouter un jour férié manuel</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Pour un jour spécifique à l&apos;établissement (source MANUEL).
        </p>
        <form onSubmit={ajouterManuel} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="mb-1 block text-sm">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label htmlFor="nom" className="mb-1 block text-sm">
              Nom
            </label>
            <input
              id="nom"
              type="text"
              value={nom}
              onChange={(event) => setNom(event.target.value)}
              required
              placeholder="Ex. Fermeture établissement"
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isLoading}
              className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
