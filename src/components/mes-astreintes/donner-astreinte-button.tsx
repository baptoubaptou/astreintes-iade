"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BourseEligibiliteAstreinte } from "@/server/bourse-astreintes";

type DonnerAstreinteButtonProps = {
  astreinteId: string;
  eligibilite: BourseEligibiliteAstreinte;
};

export function DonnerAstreinteButton({
  astreinteId,
  eligibilite,
}: DonnerAstreinteButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (eligibilite.offreOuverte || success) {
    return (
      <p className="max-w-xs text-sm text-green-800">
        {eligibilite.message ??
          "Offre ouverte — vos collègues peuvent postuler dans la bourse."}
      </p>
    );
  }

  if (!eligibilite.peutDonner) {
    return (
      <p className="max-w-xs text-sm text-amber-800">
        {eligibilite.message ??
          "Délai trop court pour la bourse, contactez le cadre."}
      </p>
    );
  }

  async function handleClick() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bourse/offres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ astreinteId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible d'ouvrir la bourse.",
        );
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {isLoading
          ? "Ouverture..."
          : `Donner cette astreinte (${eligibilite.dureeFenetreHeures}h)`}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
