"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  AstreinteListItem,
  IadeOption,
  LigneOption,
} from "@/server/astreintes";
import {
  AstreintesTable,
  formatAstreinteDate,
} from "@/components/planning/astreintes-table";
import { AstreinteFormPanel } from "@/components/planning/astreinte-form-panel";
import { DeleteAstreinteModal } from "@/components/planning/delete-astreinte-modal";
import { PlanningFilters } from "@/components/planning/planning-filters";
import { PlanningMonthSelector } from "@/components/planning/planning-month-selector";
import { PublierMoisButton } from "@/components/planning/publier-mois-button";
import { ExportPlanningPdfButton } from "@/components/planning/export-planning-pdf-button";
import { ExportPlanningExcelButton } from "@/components/planning/export-planning-excel-button";

type PlanningAdminProps = {
  mois: string;
  moisLabel: string;
  prevMois: string;
  nextMois: string;
  astreintes: AstreinteListItem[];
  lignes: LigneOption[];
  iades: IadeOption[];
  qualifiedByLigne: Record<string, IadeOption[]>;
  selectedLigneId?: string;
  selectedIadeId?: string;
  nonPublieesCount: number;
};

export function PlanningAdmin({
  mois,
  moisLabel,
  prevMois,
  nextMois,
  astreintes,
  lignes,
  iades,
  qualifiedByLigne,
  selectedLigneId,
  selectedIadeId,
  nonPublieesCount,
}: PlanningAdminProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingAstreinte, setEditingAstreinte] =
    useState<AstreinteListItem | null>(null);
  const [deletingAstreinte, setDeletingAstreinte] =
    useState<AstreinteListItem | null>(null);

  function buildUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    if (!params.get("mois")) {
      params.set("mois", mois);
    }

    return `/admin/planning?${params.toString()}`;
  }

  function openCreateForm() {
    setEditingAstreinte(null);
    setFormMode("create");
  }

  function openEditForm(astreinte: AstreinteListItem) {
    setEditingAstreinte(astreinte);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingAstreinte(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PlanningMonthSelector
          moisLabel={moisLabel}
          prevHref={buildUrl({ mois: prevMois })}
          nextHref={buildUrl({ mois: nextMois })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <ExportPlanningPdfButton mois={mois} ligneId={selectedLigneId} />
          <ExportPlanningExcelButton mois={mois} ligneId={selectedLigneId} />
          <PublierMoisButton
            mois={mois}
            moisLabel={moisLabel}
            nonPublieesCount={nonPublieesCount}
          />
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium"
          >
            Nouvelle astreinte
          </button>
        </div>
      </div>

      {nonPublieesCount > 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {nonPublieesCount} astreinte{nonPublieesCount > 1 ? "s" : ""} en
          brouillon sur ce mois — les IADE ne les voient pas tant qu&apos;elles
          ne sont pas publiées.
        </p>
      ) : null}

      <PlanningFilters
        lignes={lignes}
        iades={iades}
        selectedLigneId={selectedLigneId}
        selectedIadeId={selectedIadeId}
        onFilterChange={(filters) => {
          router.push(
            buildUrl({
              mois,
              ligneId: filters.ligneId,
              iadeId: filters.iadeId,
            }),
          );
        }}
      />

      <AstreintesTable
        astreintes={astreintes}
        onEdit={openEditForm}
        onDelete={setDeletingAstreinte}
      />

      <AstreinteFormPanel
        mois={mois}
        lignes={lignes}
        qualifiedByLigne={qualifiedByLigne}
        mode={formMode === "edit" ? "edit" : "create"}
        astreinte={editingAstreinte ?? undefined}
        isOpen={formMode !== null}
        onClose={closeForm}
      />

      {deletingAstreinte ? (
        <DeleteAstreinteModal
          astreinte={deletingAstreinte}
          formattedDate={formatAstreinteDate(deletingAstreinte.date)}
          onClose={() => setDeletingAstreinte(null)}
        />
      ) : null}
    </div>
  );
}
