"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StatutFenetreGeneration } from "@prisma/client";
import {
  LIBELLES_STATUT_FENETRE,
  ORDRE_PRIORITE_RECOMMANDE,
  type CampagneItem,
  type CampagneLigneRow,
  type LigneCampagneOption,
} from "@/server/campagnes";

type AdminCampagnesPanelProps = {
  lignes: CampagneLigneRow[];
  campagnesArchivees: CampagneLigneRow[];
  lignesOptions: LigneCampagneOption[];
};

type FormState = {
  ligneId: string;
  periodeDebut: string;
  periodeFin: string;
  dateLimiteSaisieDispos: string;
  dateGenerationPrevue: string;
};

const emptyForm = (lignesOptions: LigneCampagneOption[]): FormState => ({
  ligneId: lignesOptions[0]?.id ?? "",
  periodeDebut: "",
  periodeFin: "",
  dateLimiteSaisieDispos: "",
  dateGenerationPrevue: "",
});

function formatDateFr(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function flattenCampagnes(lignes: CampagneLigneRow[]): CampagneItem[] {
  return lignes.flatMap((ligne) => ligne.campagnes);
}

export function AdminCampagnesPanel({
  lignes: initialLignes,
  campagnesArchivees: initialArchivees,
  lignesOptions,
}: AdminCampagnesPanelProps) {
  const router = useRouter();
  const [lignes, setLignes] = useState(initialLignes);
  const [campagnesArchivees, setCampagnesArchivees] = useState(initialArchivees);
  const [form, setForm] = useState<FormState>(emptyForm(lignesOptions));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function resetForm() {
    setForm(emptyForm(lignesOptions));
    setEditingId(null);
    setError(null);
  }

  function startEdit(campagne: CampagneItem) {
    if (!campagne.modifiable) {
      return;
    }

    setEditingId(campagne.id);
    setForm({
      ligneId: campagne.ligneId,
      periodeDebut: campagne.periodeDebut,
      periodeFin: campagne.periodeFin,
      dateLimiteSaisieDispos: campagne.dateLimiteSaisieDispos,
      dateGenerationPrevue: campagne.dateGenerationPrevue,
    });
    setError(null);
    setMessage(null);
  }

  async function refreshData() {
    const response = await fetch("/api/admin/campagnes");
    const data = await response.json();

    if (response.ok) {
      if (Array.isArray(data.lignes)) {
        setLignes(data.lignes);
      }
      if (Array.isArray(data.campagnesArchivees)) {
        setCampagnesArchivees(data.campagnesArchivees);
      }
    }

    router.refresh();
  }

  async function handleArchive(campagne: CampagneItem) {
    const confirmed = window.confirm(
      `Archiver la campagne ${campagne.ligneNom} (${formatDateFr(campagne.periodeDebut)} — ${formatDateFr(campagne.periodeFin)}) ?\n\nElle sera retirée du tableau principal mais restera consultable dans les campagnes archivées.`,
    );

    if (!confirmed) {
      return;
    }

    setArchivingId(campagne.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/campagnes/${campagne.id}/archiver`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archivee: true }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible d'archiver la campagne.",
        );
        return;
      }

      setMessage("Campagne archivée.");
      await refreshData();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setArchivingId(null);
    }
  }

  async function handleUnarchive(campagne: CampagneItem) {
    const confirmed = window.confirm(
      `Désarchiver la campagne ${campagne.ligneNom} (${formatDateFr(campagne.periodeDebut)} — ${formatDateFr(campagne.periodeFin)}) ?`,
    );

    if (!confirmed) {
      return;
    }

    setArchivingId(campagne.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/campagnes/${campagne.id}/archiver`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archivee: false }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de désarchiver la campagne.",
        );
        return;
      }

      setMessage("Campagne désarchivée.");
      await refreshData();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setArchivingId(null);
    }
  }

  async function handleConfirm(campagne: CampagneItem) {
    if (!campagne.confirmable) {
      return;
    }

    const confirmed = window.confirm(
      `Confirmer la campagne ${campagne.ligneNom} (${formatDateFr(campagne.periodeDebut)} — ${formatDateFr(campagne.periodeFin)}) ?\n\nLes disponibilités conflictuelles sur les autres lignes seront retirées silencieusement.`,
    );

    if (!confirmed) {
      return;
    }

    setConfirmingId(campagne.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/campagnes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirmer", id: campagne.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de confirmer la campagne.",
        );
        return;
      }

      setMessage(
        `Campagne confirmée. ${data.disponibilitesSupprimees ?? 0} disponibilité(s) et ${data.preferencesSupprimees ?? 0} préférence(s) retirées.`,
      );
      await refreshData();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handlePublish(campagne: CampagneItem) {
    if (!campagne.publiable) {
      return;
    }

    const confirmed = window.confirm(
      `Publier ${campagne.nonPublieesCount} astreinte(s) non publiée(s) pour la campagne ${campagne.ligneNom} ?\n\nLes IADE concernés recevront une notification de nouvelle affectation.`,
    );

    if (!confirmed) {
      return;
    }

    setPublishingId(campagne.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/campagnes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publier", id: campagne.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de publier la campagne.",
        );
        return;
      }

      setMessage(
        `${data.publiees ?? 0} astreinte(s) publiée(s). Les IADE concernés ont été notifiés.`,
      );
      await refreshData();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/campagnes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          ...form,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible d'enregistrer la campagne.",
        );
        return;
      }

      setMessage(
        editingId ? "Campagne mise à jour." : "Campagne créée.",
      );
      resetForm();
      await refreshData();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsSaving(false);
    }
  }

  const campagnesActives = flattenCampagnes(lignes);
  const campagnesArchiveesList = flattenCampagnes(campagnesArchivees);

  return (
    <div className="space-y-8">
      <p className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <span className="font-medium">Ordre de priorité recommandé :</span>{" "}
        {ORDRE_PRIORITE_RECOMMANDE}. Les dates réellement programmées peuvent
        s&apos;en écarter librement.
      </p>

      <CampagnesTable
        campagnes={campagnesActives}
        archivingId={archivingId}
        confirmingId={confirmingId}
        publishingId={publishingId}
        onConfirm={handleConfirm}
        onPublish={handlePublish}
        onEdit={startEdit}
        onArchive={handleArchive}
        emptyMessage="Aucune campagne active pour le moment."
      />

      <details className="rounded border border-zinc-200 bg-zinc-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-800">
          Campagnes archivées
          {campagnesArchiveesList.length > 0 ? (
            <span className="ml-2 font-normal text-zinc-500">
              ({campagnesArchiveesList.length})
            </span>
          ) : null}
        </summary>
        <div className="border-t border-zinc-200 bg-white">
          <CampagnesTable
            campagnes={campagnesArchiveesList}
            archivingId={archivingId}
            archived
            onUnarchive={handleUnarchive}
            emptyMessage="Aucune campagne archivée."
          />
        </div>
      </details>

      <section className="rounded border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">
          {editingId ? "Modifier la campagne" : "Nouvelle campagne"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Modifiable tant que le statut n&apos;est pas Confirmée.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Ligne</span>
            <select
              value={form.ligneId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ligneId: event.target.value,
                }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            >
              {lignesOptions.map((ligne) => (
                <option key={ligne.id} value={ligne.id}>
                  {ligne.nom} (priorité recommandée : {ligne.ordrePriorite})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Début de période</span>
            <input
              type="date"
              value={form.periodeDebut}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  periodeDebut: event.target.value,
                }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Fin de période</span>
            <input
              type="date"
              value={form.periodeFin}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  periodeFin: event.target.value,
                }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Date limite de saisie des disponibilités
            </span>
            <input
              type="date"
              value={form.dateLimiteSaisieDispos}
              max={form.dateGenerationPrevue || undefined}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dateLimiteSaisieDispos: event.target.value,
                }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Doit être antérieure ou égale à la date de génération prévue.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Date de génération prévue
            </span>
            <input
              type="date"
              value={form.dateGenerationPrevue}
              min={form.dateLimiteSaisieDispos || undefined}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dateGenerationPrevue: event.target.value,
                }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {isSaving
                ? "Enregistrement…"
                : editingId
                  ? "Mettre à jour"
                  : "Créer la campagne"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-zinc-600 hover:underline"
              >
                Annuler
              </button>
            ) : null}
          </div>
        </form>

        {error ? (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

type CampagnesTableProps = {
  campagnes: CampagneItem[];
  archivingId?: string | null;
  confirmingId?: string | null;
  publishingId?: string | null;
  archived?: boolean;
  onConfirm?: (campagne: CampagneItem) => void;
  onPublish?: (campagne: CampagneItem) => void;
  onEdit?: (campagne: CampagneItem) => void;
  onArchive?: (campagne: CampagneItem) => void;
  onUnarchive?: (campagne: CampagneItem) => void;
  emptyMessage: string;
};

function CampagnesTable({
  campagnes,
  archivingId,
  confirmingId,
  publishingId,
  archived = false,
  onConfirm,
  onPublish,
  onEdit,
  onArchive,
  onUnarchive,
  emptyMessage,
}: CampagnesTableProps) {
  if (campagnes.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-zinc-500 italic">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
            <th className="px-4 py-3 font-medium">Ligne</th>
            <th className="px-4 py-3 font-medium">Période couverte</th>
            <th className="px-4 py-3 font-medium">Limite saisie dispos.</th>
            <th className="px-4 py-3 font-medium">Génération prévue</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            {archived ? (
              <th className="px-4 py-3 font-medium">Archivée le</th>
            ) : null}
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {campagnes.map((campagne) => (
            <tr key={campagne.id}>
              <td className="px-4 py-3 font-medium">{campagne.ligneNom}</td>
              <td className="px-4 py-3">
                {formatDateFr(campagne.periodeDebut)} —{" "}
                {formatDateFr(campagne.periodeFin)}
              </td>
              <td className="px-4 py-3">
                {formatDateFr(campagne.dateLimiteSaisieDispos)}
              </td>
              <td className="px-4 py-3">
                {formatDateFr(campagne.dateGenerationPrevue)}
              </td>
              <td className="px-4 py-3">
                <StatutBadge statut={campagne.statut} />
              </td>
              {archived ? (
                <td className="px-4 py-3 text-zinc-600">
                  {campagne.dateArchivage
                    ? formatDateFr(campagne.dateArchivage)
                    : "—"}
                </td>
              ) : null}
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!archived && onPublish && campagne.publiable ? (
                    <button
                      type="button"
                      onClick={() => onPublish(campagne)}
                      disabled={publishingId === campagne.id}
                      className="rounded bg-blue-700 px-2 py-1 text-xs text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {publishingId === campagne.id
                        ? "Publication…"
                        : `Publier (${campagne.nonPublieesCount})`}
                    </button>
                  ) : null}
                  {!archived && onConfirm && campagne.confirmable ? (
                    <button
                      type="button"
                      onClick={() => onConfirm(campagne)}
                      disabled={confirmingId === campagne.id}
                      className="rounded bg-green-700 px-2 py-1 text-xs text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {confirmingId === campagne.id
                        ? "Confirmation…"
                        : "Confirmer"}
                    </button>
                  ) : null}
                  {!archived && onEdit && campagne.modifiable ? (
                    <button
                      type="button"
                      onClick={() => onEdit(campagne)}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Modifier
                    </button>
                  ) : null}
                  {!archived && onArchive ? (
                    <button
                      type="button"
                      onClick={() => onArchive(campagne)}
                      disabled={archivingId === campagne.id}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {archivingId === campagne.id ? "Archivage…" : "Archiver"}
                    </button>
                  ) : null}
                  {archived && onUnarchive ? (
                    <button
                      type="button"
                      onClick={() => onUnarchive(campagne)}
                      disabled={archivingId === campagne.id}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {archivingId === campagne.id
                        ? "Désarchivage…"
                        : "Désarchiver"}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatutBadge({ statut }: { statut: StatutFenetreGeneration }) {
  return (
    <span
      className={
        statut === "CONFIRMEE"
          ? "rounded bg-green-50 px-2 py-0.5 text-xs text-green-800"
          : "rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
      }
    >
      {LIBELLES_STATUT_FENETRE[statut]}
    </span>
  );
}
