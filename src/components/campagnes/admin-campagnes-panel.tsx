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
  lignesOptions: LigneCampagneOption[];
};

type FormState = {
  ligneId: string;
  periodeDebut: string;
  periodeFin: string;
  dateGenerationPrevue: string;
};

const emptyForm = (lignesOptions: LigneCampagneOption[]): FormState => ({
  ligneId: lignesOptions[0]?.id ?? "",
  periodeDebut: "",
  periodeFin: "",
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

export function AdminCampagnesPanel({
  lignes: initialLignes,
  lignesOptions,
}: AdminCampagnesPanelProps) {
  const router = useRouter();
  const [lignes, setLignes] = useState(initialLignes);
  const [form, setForm] = useState<FormState>(emptyForm(lignesOptions));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
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
      dateGenerationPrevue: campagne.dateGenerationPrevue,
    });
    setError(null);
    setMessage(null);
  }

  async function refreshData() {
    const response = await fetch("/api/admin/campagnes");
    const data = await response.json();

    if (response.ok && Array.isArray(data.lignes)) {
      setLignes(data.lignes);
    }

    router.refresh();
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

  const totalCampagnes = lignes.reduce(
    (count, ligne) => count + ligne.campagnes.length,
    0,
  );

  return (
    <div className="space-y-8">
      <p className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <span className="font-medium">Ordre de priorité recommandé :</span>{" "}
        {ORDRE_PRIORITE_RECOMMANDE}. Les dates réellement programmées peuvent
        s&apos;en écarter librement.
      </p>

      <section className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
              <th className="px-4 py-3 font-medium">Ligne</th>
              <th className="px-4 py-3 font-medium">Priorité recommandée</th>
              <th className="px-4 py-3 font-medium">Période couverte</th>
              <th className="px-4 py-3 font-medium">Génération prévue</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lignes.map((ligne) =>
              ligne.campagnes.length === 0 ? (
                <tr key={ligne.ligneId}>
                  <td className="px-4 py-3 font-medium">{ligne.ligneNom}</td>
                  <td className="px-4 py-3 text-zinc-500">{ligne.ordrePriorite}</td>
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-zinc-500 italic"
                  >
                    Aucune campagne à venir ou en cours
                  </td>
                </tr>
              ) : (
                ligne.campagnes.map((campagne, index) => (
                  <tr key={campagne.id}>
                    {index === 0 ? (
                      <>
                        <td
                          className="px-4 py-3 font-medium"
                          rowSpan={ligne.campagnes.length}
                        >
                          {ligne.ligneNom}
                        </td>
                        <td
                          className="px-4 py-3 text-zinc-500"
                          rowSpan={ligne.campagnes.length}
                        >
                          {ligne.ordrePriorite}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-3">
                      {formatDateFr(campagne.periodeDebut)} —{" "}
                      {formatDateFr(campagne.periodeFin)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateFr(campagne.dateGenerationPrevue)}
                    </td>
                    <td className="px-4 py-3">
                      <StatutBadge statut={campagne.statut} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {campagne.publiable ? (
                          <button
                            type="button"
                            onClick={() => handlePublish(campagne)}
                            disabled={publishingId === campagne.id}
                            className="rounded bg-blue-700 px-2 py-1 text-xs text-white hover:bg-blue-800 disabled:opacity-50"
                          >
                            {publishingId === campagne.id
                              ? "Publication…"
                              : `Publier (${campagne.nonPublieesCount})`}
                          </button>
                        ) : null}
                        {campagne.confirmable ? (
                          <button
                            type="button"
                            onClick={() => handleConfirm(campagne)}
                            disabled={confirmingId === campagne.id}
                            className="rounded bg-green-700 px-2 py-1 text-xs text-white hover:bg-green-800 disabled:opacity-50"
                          >
                            {confirmingId === campagne.id
                              ? "Confirmation…"
                              : "Confirmer cette campagne"}
                          </button>
                        ) : null}
                        {campagne.modifiable ? (
                          <button
                            type="button"
                            onClick={() => startEdit(campagne)}
                            className="text-blue-700 hover:underline"
                          >
                            Modifier
                          </button>
                        ) : campagne.statut === "CONFIRMEE" ? (
                          <span className="text-xs text-zinc-400">Verrouillée</span>
                        ) : (
                          <span
                            className="text-xs text-zinc-400"
                            title="Des astreintes doivent être enregistrées sur la période"
                          >
                            Non confirmable
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ),
            )}
          </tbody>
        </table>
        {totalCampagnes === 0 ? (
          <p className="border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500">
            Aucune campagne planifiée pour le moment.
          </p>
        ) : null}
      </section>

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
              Date de génération prévue
            </span>
            <input
              type="date"
              value={form.dateGenerationPrevue}
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
