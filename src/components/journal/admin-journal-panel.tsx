"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TypeActionAudit } from "@prisma/client";
import {
  ACTEUR_SYSTEME_VALUE,
  LIBELLES_TYPE_ACTION_AUDIT,
  TYPES_ACTION_AUDIT,
} from "@/lib/journal-audit-constants";
import type { IadeOption } from "@/server/astreintes";
import type {
  JournalAuditListItem,
  JournalAuditListResult,
  UtilisateurOption,
} from "@/server/journal-audit";

type AdminJournalPanelProps = {
  iades: IadeOption[];
  utilisateurs: UtilisateurOption[];
};

function formatDateHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatUtilisateur(
  user: { prenom: string; nom: string } | null,
): string {
  if (!user) {
    return "—";
  }

  return `${user.prenom} ${user.nom}`;
}

function hasDetail(detail: unknown): boolean {
  return detail !== null && detail !== undefined;
}

export function AdminJournalPanel({
  iades,
  utilisateurs,
}: AdminJournalPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<JournalAuditListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/journal?${searchParams.toString()}`,
      );

      if (!response.ok) {
        throw new Error("Impossible de charger le journal.");
      }

      const result = (await response.json()) as JournalAuditListResult;
      setData(result);
    } catch {
      setError("Impossible de charger le journal.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void fetchJournal();
  }, [fetchJournal]);

  function applyFilters(formData: FormData, page = 1) {
    const params = new URLSearchParams();

    const fields = [
      "iadeConcerneId",
      "typeAction",
      "dateDebut",
      "dateFin",
      "acteurId",
    ] as const;

    for (const field of fields) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) {
        params.set(field, value);
      }
    }

    if (page > 1) {
      params.set("page", String(page));
    }

    router.push(`/admin/journal?${params.toString()}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    router.push(`/admin/journal?${params.toString()}`);
  }

  function toggleDetail(entry: JournalAuditListItem) {
    if (!hasDetail(entry.detail)) {
      return;
    }

    setExpandedId((current) => (current === entry.id ? null : entry.id));
  }

  const currentPage = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(new FormData(event.currentTarget));
        }}
        className="flex flex-wrap items-end gap-4 rounded border border-zinc-200 p-4"
      >
        <div>
          <label htmlFor="iadeConcerneId" className="mb-1 block text-sm">
            IADE concerné
          </label>
          <select
            id="iadeConcerneId"
            name="iadeConcerneId"
            defaultValue={searchParams.get("iadeConcerneId") ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">Tous</option>
            {iades.map((iade) => (
              <option key={iade.id} value={iade.id}>
                {iade.prenom} {iade.nom}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="typeAction" className="mb-1 block text-sm">
            Type d&apos;action
          </label>
          <select
            id="typeAction"
            name="typeAction"
            defaultValue={searchParams.get("typeAction") ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">Tous</option>
            {TYPES_ACTION_AUDIT.map((type) => (
              <option key={type} value={type}>
                {LIBELLES_TYPE_ACTION_AUDIT[type as TypeActionAudit]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="acteurId" className="mb-1 block text-sm">
            Acteur
          </label>
          <select
            id="acteurId"
            name="acteurId"
            defaultValue={searchParams.get("acteurId") ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">Tous</option>
            <option value={ACTEUR_SYSTEME_VALUE}>Système</option>
            {utilisateurs.map((user) => (
              <option key={user.id} value={user.id}>
                {user.prenom} {user.nom}
                {user.role === "CADRE" ? " (cadre)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dateDebut" className="mb-1 block text-sm">
            Du
          </label>
          <input
            id="dateDebut"
            name="dateDebut"
            type="date"
            defaultValue={searchParams.get("dateDebut") ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>

        <div>
          <label htmlFor="dateFin" className="mb-1 block text-sm">
            Au
          </label>
          <input
            id="dateFin"
            name="dateFin"
            type="date"
            defaultValue={searchParams.get("dateFin") ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded border border-zinc-300 px-4 py-1.5 text-sm"
        >
          Filtrer
        </button>
      </form>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">
            Entrées du journal
            {data ? ` (${data.total})` : ""}
          </h2>

          {data && data.totalPages > 1 ? (
            <p className="text-sm text-zinc-600">
              Page {currentPage} sur {totalPages}
            </p>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-600">Chargement...</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Aucune entrée pour les filtres sélectionnés.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Date / heure</th>
                  <th className="px-4 py-2 font-medium">Acteur</th>
                  <th className="px-4 py-2 font-medium">Type d&apos;action</th>
                  <th className="px-4 py-2 font-medium">IADE concerné</th>
                  <th className="px-4 py-2 font-medium">Résumé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {data.items.map((entry) => {
                  const expandable = hasDetail(entry.detail);
                  const expanded = expandedId === entry.id;

                  return (
                    <JournalRow
                      key={entry.id}
                      entry={entry}
                      expandable={expandable}
                      expanded={expanded}
                      onToggle={() => toggleDetail(entry)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => goToPage(currentPage - 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages || loading}
              onClick={() => goToPage(currentPage + 1)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function JournalRow({
  entry,
  expandable,
  expanded,
  onToggle,
}: {
  entry: JournalAuditListItem;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={
          expandable ? "cursor-pointer hover:bg-zinc-50" : undefined
        }
        onClick={expandable ? onToggle : undefined}
      >
        <td className="whitespace-nowrap px-4 py-2">
          {formatDateHeure(entry.dateAction)}
        </td>
        <td className="px-4 py-2">
          {entry.acteur ? formatUtilisateur(entry.acteur) : "Système"}
        </td>
        <td className="px-4 py-2">{entry.typeActionLabel}</td>
        <td className="px-4 py-2">{formatUtilisateur(entry.iadeConcerne)}</td>
        <td className="px-4 py-2">
          <span className="inline-flex items-start gap-2">
            <span>{entry.resume}</span>
            {expandable ? (
              <span className="shrink-0 text-xs text-zinc-500">
                {expanded ? "▲" : "▼"} détail
              </span>
            ) : null}
          </span>
        </td>
      </tr>
      {expandable && expanded ? (
        <tr className="bg-zinc-50">
          <td colSpan={5} className="px-4 py-3">
            <pre className="overflow-x-auto rounded border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
              {JSON.stringify(entry.detail, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}
