"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publierMoisPlanningAction } from "@/app/admin/planning/actions";

type PublierMoisButtonProps = {
  mois: string;
  moisLabel: string;
  nonPublieesCount: number;
};

export function PublierMoisButton({
  mois,
  moisLabel,
  nonPublieesCount,
}: PublierMoisButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handlePublish() {
    if (nonPublieesCount === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Publier ${nonPublieesCount} astreinte(s) non publiée(s) pour ${moisLabel} ?\n\nLes IADE concernés recevront une notification de nouvelle affectation.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await publierMoisPlanningAction(mois);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setMessage(result.success ?? "Planning publié.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending || nonPublieesCount === 0}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "Publication…"
          : `Publier le mois (${nonPublieesCount})`}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-green-700">{message}</p> : null}
    </div>
  );
}
