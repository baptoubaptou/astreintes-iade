"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAstreinteAction } from "@/app/admin/planning/actions";
import type { AstreinteListItem } from "@/server/astreintes";

type DeleteAstreinteModalProps = {
  astreinte: AstreinteListItem;
  formattedDate: string;
  onClose: () => void;
};

export function DeleteAstreinteModal({
  astreinte,
  formattedDate,
  onClose,
}: DeleteAstreinteModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAstreinteAction(astreinte.id);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded border border-zinc-200 bg-white p-6 shadow-xl"
        role="alertdialog"
        aria-labelledby="delete-astreinte-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-astreinte-title" className="text-lg font-medium">
          Confirmer la suppression
        </h2>
        <p className="mt-3 text-sm text-zinc-700">
          Confirmer la suppression de l&apos;astreinte du {formattedDate} —{" "}
          {astreinte.ligne.nom} — {astreinte.iade.prenom} {astreinte.iade.nom}{" "}
          ?
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          L&apos;astreinte sera annulée (statut ANNULEE) pour préserver
          l&apos;historique.
        </p>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isPending}
            className="rounded border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-800 disabled:opacity-50"
          >
            {isPending ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
