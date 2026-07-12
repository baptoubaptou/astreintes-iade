"use client";

import { useActionState } from "react";
import {
  createLigneAction,
  type LigneActionState,
} from "@/app/admin/lignes/actions";

const initialState: LigneActionState = {};

export function CreateLigneForm() {
  const [state, formAction, isPending] = useActionState(
    createLigneAction,
    initialState,
  );

  return (
    <section className="rounded border border-zinc-200 p-4">
      <h2 className="mb-4 text-lg font-medium">Nouvelle ligne</h2>
      <form action={formAction} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="nom" className="mb-1 block text-sm">
            Nom
          </label>
          <input
            id="nom"
            name="nom"
            type="text"
            required
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ordrePriorite" className="mb-1 block text-sm">
            Ordre de priorité
          </label>
          <input
            id="ordrePriorite"
            name="ordrePriorite"
            type="number"
            min={1}
            required
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={isPending}
            className="rounded border border-zinc-300 px-4 py-1 text-sm disabled:opacity-50"
          >
            {isPending ? "Création..." : "Créer"}
          </button>
        </div>
      </form>
      <p className="mt-3 text-xs text-zinc-500">
        Les points par créneau se configurent ensuite sur{" "}
        <a href="/admin/points-creneaux" className="underline">
          Points par créneau
        </a>
        .
      </p>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-2 text-sm text-green-700" role="status">
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
