"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import type { UtilisateurListItem } from "@/server/utilisateurs";

type UtilisateursTableProps = {
  utilisateurs: UtilisateurListItem[];
  currentUserId: string;
};

type DraftState = {
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  role: Role;
};

function roleLabel(role: Role): string {
  return role === "CADRE" ? "Cadre" : "IADE";
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function UtilisateursTable({
  utilisateurs: initialUtilisateurs,
  currentUserId,
}: UtilisateursTableProps) {
  const router = useRouter();
  const [utilisateurs, setUtilisateurs] = useState(initialUtilisateurs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<UtilisateurListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setUtilisateurs(initialUtilisateurs);
  }, [initialUtilisateurs]);

  function getDraft(utilisateur: UtilisateurListItem): DraftState {
    return (
      drafts[utilisateur.id] ?? {
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        matricule: utilisateur.matricule,
        email: utilisateur.email,
        role: utilisateur.role,
      }
    );
  }

  function startEditing(utilisateur: UtilisateurListItem) {
    setEditingId(utilisateur.id);
    setDrafts((current) => ({
      ...current,
      [utilisateur.id]: getDraft(utilisateur),
    }));
    setError(null);
    setFeedback(null);
  }

  function cancelEditing(utilisateur: UtilisateurListItem) {
    setEditingId(null);
    setDrafts((current) => {
      const next = { ...current };
      delete next[utilisateur.id];
      return next;
    });
  }

  function updateDraft(
    utilisateurId: string,
    field: keyof DraftState,
    value: string,
  ) {
    setDrafts((current) => {
      const utilisateur = utilisateurs.find((entry) => entry.id === utilisateurId);
      const base =
        current[utilisateurId] ??
        (utilisateur
          ? {
              nom: utilisateur.nom,
              prenom: utilisateur.prenom,
              matricule: utilisateur.matricule,
              email: utilisateur.email,
              role: utilisateur.role,
            }
          : { nom: "", prenom: "", matricule: "", email: "", role: "IADE" as Role });

      return {
        ...current,
        [utilisateurId]: { ...base, [field]: value },
      };
    });
  }

  async function saveUtilisateur(utilisateur: UtilisateurListItem) {
    const draft = getDraft(utilisateur);
    setSavingId(utilisateur.id);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/utilisateurs/${utilisateur.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement.");
        return;
      }

      setUtilisateurs((current) =>
        [...current]
          .map((entry) =>
            entry.id === utilisateur.id ? (data as UtilisateurListItem) : entry,
          )
          .sort((a, b) => {
            if (a.role !== b.role) {
              return a.role === "CADRE" ? -1 : 1;
            }

            return (
              a.nom.localeCompare(b.nom, "fr") ||
              a.prenom.localeCompare(b.prenom, "fr")
            );
          }),
      );
      setEditingId(null);
      setDrafts((current) => {
        const next = { ...current };
        delete next[utilisateur.id];
        return next;
      });
      setFeedback("Utilisateur mis à jour.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSavingId(null);
    }
  }

  function demanderSuppression(utilisateur: UtilisateurListItem) {
    setPendingDeletion(utilisateur);
    setError(null);
    setFeedback(null);
  }

  function annulerSuppression() {
    if (deletingId) {
      return;
    }

    setPendingDeletion(null);
  }

  async function confirmerSuppression() {
    if (!pendingDeletion) {
      return;
    }

    const utilisateur = pendingDeletion;
    const label = `${utilisateur.prenom} ${utilisateur.nom}`;

    setDeletingId(utilisateur.id);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/utilisateurs/${utilisateur.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Erreur lors de la suppression.");
        return;
      }

      setUtilisateurs((current) =>
        current.filter((entry) => entry.id !== utilisateur.id),
      );

      if (editingId === utilisateur.id) {
        setEditingId(null);
      }

      setPendingDeletion(null);
      setFeedback(`${label} a été supprimé définitivement.`);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setDeletingId(null);
    }
  }

  async function supprimerUtilisateur(utilisateur: UtilisateurListItem) {
    demanderSuppression(utilisateur);
  }

  if (utilisateurs.length === 0) {
    return <p className="text-sm text-zinc-600">Aucun utilisateur enregistré.</p>;
  }

  return (
    <div className="space-y-4">
      {pendingDeletion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={annulerSuppression}
        >
          <div
            role="alertdialog"
            aria-labelledby="suppression-titre"
            aria-describedby="suppression-description"
            className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="suppression-titre"
              className="text-lg font-semibold text-red-800"
            >
              Suppression définitive du compte
            </h2>
            <div
              id="suppression-description"
              className="mt-3 space-y-2 text-sm text-zinc-700"
            >
              <p>
                Vous êtes sur le point de supprimer définitivement le compte de{" "}
                <span className="font-medium">
                  {pendingDeletion.prenom} {pendingDeletion.nom}
                </span>{" "}
                ({pendingDeletion.matricule}).
              </p>
              <p>
                Cette action est <strong>irréversible</strong>. Toutes les
                données liées à cette personne seront effacées sans possibilité
                de restauration, notamment :
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>astreintes passées et futures</li>
                <li>disponibilités et préférences de continuité</li>
                <li>qualifications, candidatures et offres de bourse</li>
                <li>notifications et entrées du journal d&apos;audit</li>
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={annulerSuppression}
                disabled={Boolean(deletingId)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmerSuppression}
                disabled={Boolean(deletingId)}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deletingId ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p
          className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nom</th>
              <th className="px-4 py-2 font-medium">Prénom</th>
              <th className="px-4 py-2 font-medium">Matricule</th>
              <th className="px-4 py-2 font-medium">Mail</th>
              <th className="px-4 py-2 font-medium">Rôle</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {utilisateurs.map((utilisateur) => {
              const isEditing = editingId === utilisateur.id;
              const draft = getDraft(utilisateur);
              const isSaving = savingId === utilisateur.id;
              const isDeleting = deletingId === utilisateur.id;
              const isBusy = isSaving || isDeleting;

              return (
                <tr key={utilisateur.id}>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={draft.nom}
                      disabled={!isEditing || isBusy}
                      onChange={(event) =>
                        updateDraft(utilisateur.id, "nom", event.target.value)
                      }
                      className="w-full min-w-[8rem] rounded border border-zinc-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent disabled:text-zinc-900"
                      aria-label={`Nom — ${utilisateur.prenom} ${utilisateur.nom}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={draft.prenom}
                      disabled={!isEditing || isBusy}
                      onChange={(event) =>
                        updateDraft(utilisateur.id, "prenom", event.target.value)
                      }
                      className="w-full min-w-[8rem] rounded border border-zinc-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent disabled:text-zinc-900"
                      aria-label={`Prénom — ${utilisateur.prenom} ${utilisateur.nom}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={draft.matricule}
                      disabled={!isEditing || isBusy}
                      onChange={(event) =>
                        updateDraft(utilisateur.id, "matricule", event.target.value)
                      }
                      className="w-full min-w-[7rem] rounded border border-zinc-300 px-2 py-1 font-mono text-xs disabled:border-transparent disabled:bg-transparent disabled:text-zinc-900"
                      aria-label={`Matricule — ${utilisateur.matricule}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="email"
                      value={draft.email}
                      disabled={!isEditing || isBusy}
                      onChange={(event) =>
                        updateDraft(utilisateur.id, "email", event.target.value)
                      }
                      className="w-full min-w-[12rem] rounded border border-zinc-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent disabled:text-zinc-900"
                      aria-label={`Mail — ${utilisateur.email}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <select
                        value={draft.role}
                        disabled={isBusy}
                        onChange={(event) =>
                          updateDraft(
                            utilisateur.id,
                            "role",
                            event.target.value,
                          )
                        }
                        className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        aria-label={`Rôle — ${utilisateur.prenom} ${utilisateur.nom}`}
                      >
                        <option value="IADE">IADE</option>
                        <option value="CADRE">Cadre</option>
                      </select>
                    ) : (
                      <span className="text-zinc-600">
                        {roleLabel(utilisateur.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveUtilisateur(utilisateur)}
                            disabled={isBusy}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {isSaving ? "…" : "Enregistrer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEditing(utilisateur)}
                            disabled={isBusy}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(utilisateur)}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center rounded border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          aria-label={`Modifier ${utilisateur.prenom} ${utilisateur.nom}`}
                          title="Modifier"
                        >
                          <PencilIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => supprimerUtilisateur(utilisateur)}
                        disabled={isBusy || utilisateur.id === currentUserId}
                        className="inline-flex items-center justify-center rounded border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        aria-label={`Supprimer ${utilisateur.prenom} ${utilisateur.nom}`}
                        title={
                          utilisateur.id === currentUserId
                            ? "Vous ne pouvez pas supprimer votre propre compte"
                            : "Supprimer"
                        }
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
