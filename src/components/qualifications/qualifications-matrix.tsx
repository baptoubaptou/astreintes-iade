"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { QualificationMatrixData } from "@/server/qualifications";
import {
  checkUncheckWarningAction,
  createQualificationAction,
  deleteQualificationAction,
} from "@/app/admin/qualifications/actions";

type QualificationsMatrixProps = QualificationMatrixData;

type PendingDelete = {
  iadeId: string;
  ligneId: string;
  iadeLabel: string;
  ligneLabel: string;
  message: string | null;
  count: number;
};

function qualificationKey(iadeId: string, ligneId: string) {
  return `${iadeId}:${ligneId}`;
}

export function QualificationsMatrix({
  iades,
  lignes,
  qualifications,
}: QualificationsMatrixProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const serverKeys = useMemo(
    () =>
      new Set(
        qualifications.map((q) => qualificationKey(q.iadeId, q.ligneId)),
      ),
    [qualifications],
  );

  const [qualifiedKeys, setQualifiedKeys] = useState(serverKeys);

  useEffect(() => {
    setQualifiedKeys(serverKeys);
  }, [serverKeys]);

  async function handleCheck(
    iadeId: string,
    ligneId: string,
    checked: boolean,
    iadeLabel: string,
    ligneLabel: string,
  ) {
    setError(null);
    const key = qualificationKey(iadeId, ligneId);

    if (checked) {
      setQualifiedKeys((current) => new Set([...current, key]));

      startTransition(async () => {
        const result = await createQualificationAction(iadeId, ligneId);
        if (result.error) {
          setError(result.error);
          setQualifiedKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
          return;
        }
        router.refresh();
      });
      return;
    }

    startTransition(async () => {
      const warning = await checkUncheckWarningAction(iadeId, ligneId);
      if ("error" in warning) {
        setError(warning.error);
        return;
      }

      setPendingDelete({
        iadeId,
        ligneId,
        iadeLabel,
        ligneLabel,
        message: warning.message,
        count: warning.count,
      });
    });
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    const { iadeId, ligneId } = pendingDelete;
    const key = qualificationKey(iadeId, ligneId);
    setPendingDelete(null);
    setQualifiedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });

    startTransition(async () => {
      const result = await deleteQualificationAction(iadeId, ligneId);
      if (result.error) {
        setError(result.error);
        setQualifiedKeys((current) => new Set([...current, key]));
        return;
      }
      router.refresh();
    });
  }

  function cancelDelete() {
    setPendingDelete(null);
  }

  if (iades.length === 0) {
    return (
      <p className="text-sm text-zinc-600">Aucun IADE actif à afficher.</p>
    );
  }

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Aucune ligne d&apos;astreinte active. Activez ou créez des lignes
        d&apos;abord.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {pendingDelete ? (
        <div
          className="rounded border border-amber-300 bg-amber-50 p-4 text-sm"
          role="alertdialog"
          aria-labelledby="confirm-title"
        >
          <p id="confirm-title" className="font-medium">
            Retirer la qualification de {pendingDelete.iadeLabel} sur{" "}
            {pendingDelete.ligneLabel} ?
          </p>
          {pendingDelete.message ? (
            <p className="mt-2 text-amber-900">{pendingDelete.message}</p>
          ) : (
            <p className="mt-2 text-zinc-700">
              Cette action supprime l&apos;habilitation de l&apos;IADE sur
              cette ligne.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isPending}
              className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={cancelDelete}
              disabled={isPending}
              className="rounded border border-zinc-300 px-3 py-1"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="border border-zinc-200 px-3 py-2">IADE</th>
              {lignes.map((ligne) => (
                <th
                  key={ligne.id}
                  className="border border-zinc-200 px-3 py-2 text-center"
                >
                  {ligne.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {iades.map((iade) => {
              const iadeLabel = `${iade.prenom} ${iade.nom}`;

              return (
                <tr key={iade.id}>
                  <td className="border border-zinc-200 px-3 py-2 whitespace-nowrap">
                    {iadeLabel}
                  </td>
                  {lignes.map((ligne) => {
                    const key = qualificationKey(iade.id, ligne.id);
                    const isChecked = qualifiedKeys.has(key);

                    return (
                      <td
                        key={ligne.id}
                        className="border border-zinc-200 px-3 py-2 text-center"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isPending}
                          aria-label={`Qualification ${iadeLabel} — ${ligne.nom}`}
                          onChange={(event) =>
                            handleCheck(
                              iade.id,
                              ligne.id,
                              event.target.checked,
                              iadeLabel,
                              ligne.nom,
                            )
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
