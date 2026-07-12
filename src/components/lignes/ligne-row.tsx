"use client";

import { useActionState, useEffect, useState } from "react";
import type { LigneAstreinte } from "@prisma/client";
import {
  updateLigneAction,
  type LigneActionState,
} from "@/app/admin/lignes/actions";

const initialState: LigneActionState = {};

type LigneRowProps = {
  ligne: LigneAstreinte;
};

export function LigneRow({ ligne }: LigneRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const boundUpdateAction = updateLigneAction.bind(null, ligne.id);
  const [state, formAction, isPending] = useActionState(
    boundUpdateAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      setIsEditing(false);
    }
  }, [state.success]);

  if (!isEditing) {
    return (
      <tr>
        <td className="border border-zinc-200 px-3 py-2">{ligne.nom}</td>
        <td className="border border-zinc-200 px-3 py-2">
          {ligne.ordrePriorite}
        </td>
        <td className="border border-zinc-200 px-3 py-2">
          {ligne.actif ? "Oui" : "Non"}
        </td>
        <td className="border border-zinc-200 px-3 py-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-sm underline"
          >
            Modifier
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="border border-zinc-200 px-3 py-2" colSpan={4}>
        <form action={formAction} className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="mb-1 text-sm font-medium">{ligne.nom}</p>
            <p className="text-xs text-zinc-500">Le nom n&apos;est pas modifiable</p>
          </div>
          <div>
            <label
              htmlFor={`ordre-${ligne.id}`}
              className="mb-1 block text-sm"
            >
              Ordre de priorité
            </label>
            <input
              id={`ordre-${ligne.id}`}
              name="ordrePriorite"
              type="number"
              min={1}
              defaultValue={ligne.ordrePriorite}
              required
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label htmlFor={`actif-${ligne.id}`} className="mb-1 block text-sm">
              Active
            </label>
            <select
              id={`actif-${ligne.id}`}
              name="actif"
              defaultValue={ligne.actif ? "true" : "false"}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
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
      </td>
    </tr>
  );
}
