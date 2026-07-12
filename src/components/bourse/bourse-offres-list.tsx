"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OffreBourseItem } from "@/server/bourse-astreintes";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";

type BourseOffresListProps = {
  offres: OffreBourseItem[];
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BourseOffresList({ offres }: BourseOffresListProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (offres.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Aucune offre ouverte pour le moment.
      </p>
    );
  }

  async function postuler(offreId: string) {
    setLoadingId(offreId);
    setError(null);

    try {
      const response = await fetch(`/api/bourse/offres/${offreId}/candidatures`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de postuler.",
        );
        return;
      }

      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
        {offres.map((offre) => (
          <li
            key={offre.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {offre.ligneNom} — {offre.date}
              </p>
              <p className="text-sm text-zinc-600">
                {LIBELLES_TYPE_CRENEAU_ASTREINTE[offre.typeCreneau]} · Proposée
                par {offre.proposantNom}
              </p>
              <p className="text-xs text-zinc-500">
                Clôture : {formatDateTime(offre.dateFermeture)}
              </p>
            </div>
            {offre.candidatureEnvoyee ? (
              <span className="text-sm text-green-700">Candidature envoyée</span>
            ) : (
              <button
                type="button"
                onClick={() => postuler(offre.id)}
                disabled={loadingId === offre.id}
                className="rounded border border-zinc-800 px-3 py-1 text-sm disabled:opacity-50"
              >
                {loadingId === offre.id ? "Envoi..." : "Postuler"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
