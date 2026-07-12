"use client";

import { Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TypeCreneau, TypePreferenceContinuite } from "@prisma/client";
import { shiftMois } from "@/server/astreintes";
import {
  creneauxDisponiblesPour,
} from "@/server/jours-feries";
import type {
  DisponibiliteItem,
  LigneQualifiee,
  MesDisponibilitesMoisData,
} from "@/server/disponibilites";
import { LIBELLES_DISPONIBILITE_CRENEAU } from "@/server/disponibilites";

type ViewMode = "global" | "ligne";

type MesDisponibilitesCalendarProps = {
  initialMois: string;
  initialMoisLabel: string;
  initialData: MesDisponibilitesMoisData;
};

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function libelleCreneau(typeCreneau: TypeCreneau): string {
  return LIBELLES_DISPONIBILITE_CRENEAU[typeCreneau];
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function buildCalendarWeeks(
  year: number,
  month: number,
): Array<Array<Date | null>> {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const weeks: Array<Array<Date | null>> = [];
  let currentWeek: Array<Date | null> = Array.from({ length: startOffset }, () => null);

  for (let day = 1; day <= lastDay.getUTCDate(); day += 1) {
    currentWeek.push(new Date(Date.UTC(year, month - 1, day)));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

function getSaturdayInWeek(week: Array<Date | null>): Date | null {
  return week.find((day) => day && day.getUTCDay() === 6) ?? null;
}

export function MesDisponibilitesCalendar({
  initialMois,
  initialMoisLabel,
  initialData,
}: MesDisponibilitesCalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mois, setMois] = useState(initialMois);
  const [moisLabel, setMoisLabel] = useState(initialMoisLabel);
  const [viewMode, setViewMode] = useState<ViewMode>("global");
  const [activeLigneId, setActiveLigneId] = useState(
    initialData.lignesQualifiees[0]?.id ?? "",
  );
  const [ligneSourceId, setLigneSourceId] = useState(
    initialData.lignesQualifiees[0]?.id ?? "",
  );
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dupliquerPreview, setDupliquerPreview] = useState<string | null>(null);
  const [showDupliquerConfirm, setShowDupliquerConfirm] = useState(false);

  const today = startOfTodayUtc();

  const [year, month] = useMemo(() => {
    const [y, m] = mois.split("-").map(Number);
    return [y, m];
  }, [mois]);

  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);

  const dispoMap = useMemo(() => {
    const map = new Map<string, DisponibiliteItem>();
    for (const dispo of data.disponibilites) {
      map.set(`${dispo.date}|${dispo.ligneId}|${dispo.typeCreneau}`, dispo);
    }
    return map;
  }, [data.disponibilites]);

  const prefMap = useMemo(() => {
    const map = new Map<string, { id: string }>();
    for (const pref of data.preferencesContinuite) {
      map.set(`${pref.dateDebut}|${pref.ligneId}|${pref.type}`, { id: pref.id });
    }
    return map;
  }, [data.preferencesContinuite]);

  const navigateMois = useCallback(
    (delta: number) => {
      const next = shiftMois(mois, delta);
      const params = new URLSearchParams(searchParams.toString());
      params.set("mois", next.value);
      router.push(`/mes-disponibilites?${params.toString()}`);
    },
    [mois, router, searchParams],
  );

  const loadMois = useCallback(async (targetMois: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/disponibilites?mois=${targetMois}`);
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Erreur de chargement.");
        return;
      }

      setData(payload as MesDisponibilitesMoisData);
      setMois(payload.mois);
      const shifted = shiftMois(payload.mois, 0);
      setMoisLabel(shifted.label);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialMois !== mois) {
      setMois(initialMois);
      setMoisLabel(initialMoisLabel);
      setData(initialData);
    }
  }, [initialMois, initialMoisLabel, initialData]);

  function isChecked(
    date: string,
    ligneId: string,
    typeCreneau: TypeCreneau,
  ): boolean {
    return dispoMap.has(`${date}|${ligneId}|${typeCreneau}`);
  }

  function isPrefChecked(
    date: string,
    ligneId: string,
    type: TypePreferenceContinuite,
  ): boolean {
    return prefMap.has(`${date}|${ligneId}|${type}`);
  }

  function isPast(date: string): boolean {
    return date < today;
  }

  async function toggleDisponibilite(
    date: string,
    ligneId: string,
    typeCreneau: TypeCreneau,
    checked: boolean,
  ) {
    if (isPast(date)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      if (checked) {
        const response = await fetch("/api/disponibilites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ligneId, date, typeCreneau }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error ?? "Erreur lors de la création.");
          return;
        }
        setData((current) => ({
          ...current,
          disponibilites: [...current.disponibilites, payload as DisponibiliteItem],
        }));
      } else {
        const existing = dispoMap.get(`${date}|${ligneId}|${typeCreneau}`);
        if (!existing) {
          return;
        }

        const response = await fetch(`/api/disponibilites/${existing.id}`, {
          method: "DELETE",
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error ?? "Erreur lors de la suppression.");
          return;
        }

        if (payload.warning) {
          setWarning(payload.warning);
        }

        setData((current) => ({
          ...current,
          disponibilites: current.disponibilites.filter(
            (dispo) => dispo.id !== existing.id,
          ),
          preferencesContinuite: current.preferencesContinuite.filter((pref) => {
            if (pref.ligneId !== ligneId) {
              return true;
            }
            const typeJour = current.typesJourParDate[date] ?? "SEMAINE";
            const creneaux = creneauxDisponiblesPour(typeJour);
            if (
              pref.type === "JOUR_NUIT" &&
              pref.dateDebut === date &&
              creneaux.includes(typeCreneau)
            ) {
              return false;
            }
            return true;
          }),
        }));
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePreference(
    date: string,
    ligneId: string,
    type: TypePreferenceContinuite,
    checked: boolean,
  ) {
    if (isPast(date)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (checked) {
        const response = await fetch("/api/preferences-continuite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ligneId, dateDebut: date, type }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error ?? "Erreur lors de la création.");
          return;
        }
        setData((current) => ({
          ...current,
          preferencesContinuite: [
            ...current.preferencesContinuite,
            {
              id: payload.id,
              ligneId: payload.ligneId,
              dateDebut: payload.dateDebut,
              type: payload.type,
            },
          ],
        }));
      } else {
        const existing = prefMap.get(`${date}|${ligneId}|${type}`);
        if (!existing) {
          return;
        }

        const response = await fetch(
          `/api/preferences-continuite/${existing.id}`,
          { method: "DELETE" },
        );
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error ?? "Erreur lors de la suppression.");
          return;
        }

        setData((current) => ({
          ...current,
          preferencesContinuite: current.preferencesContinuite.filter((pref) => {
            if (pref.id === existing.id) {
              return false;
            }
            if (
              type === "JOUR_NUIT" &&
              pref.type === "WEEKEND_48H" &&
              pref.ligneId === ligneId
            ) {
              const samedi = new Date(`${date}T00:00:00.000Z`);
              if (samedi.getUTCDay() === 6) {
                return pref.dateDebut !== date;
              }
              if (samedi.getUTCDay() === 0) {
                const sat = new Date(samedi);
                sat.setUTCDate(sat.getUTCDate() - 1);
                return pref.dateDebut !== dateKey(sat);
              }
            }
            return true;
          }),
        }));
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function preparerDuplication() {
    const sourceId =
      viewMode === "ligne" ? activeLigneId : ligneSourceId;
    const cibles = data.lignesQualifiees
      .map((ligne) => ligne.id)
      .filter((id) => id !== sourceId);

    if (cibles.length === 0) {
      setError("Aucune autre ligne qualifiée vers laquelle dupliquer.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setDupliquerPreview(null);

    try {
      const response = await fetch("/api/disponibilites/dupliquer-lignes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moisSource: mois,
          ligneSourceId: sourceId,
          lignesCibles: cibles,
          dryRun: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Erreur lors de la prévisualisation.");
        return;
      }

      if (payload.total === 0) {
        setDupliquerPreview("Aucune nouvelle disponibilité à ajouter sur les autres lignes.");
        setShowDupliquerConfirm(false);
        return;
      }

      const resume = payload.lignes
        .map(
          (ligne: { ligneNom: string; nouvelles: number }) =>
            `${ligne.nouvelles} sur ${ligne.ligneNom}`,
        )
        .join(", ");

      setDupliquerPreview(
        `${payload.total} nouvelle(s) disponibilité(s) seront ajoutées : ${resume}. Les cases déjà différentes ne seront pas modifiées.`,
      );
      setShowDupliquerConfirm(true);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmerDuplication() {
    const sourceId =
      viewMode === "ligne" ? activeLigneId : ligneSourceId;
    const cibles = data.lignesQualifiees
      .map((ligne) => ligne.id)
      .filter((id) => id !== sourceId);

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/disponibilites/dupliquer-lignes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moisSource: mois,
          ligneSourceId: sourceId,
          lignesCibles: cibles,
          dryRun: false,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Erreur lors de la duplication.");
        return;
      }

      setShowDupliquerConfirm(false);
      setDupliquerPreview("Disponibilités dupliquées avec succès.");
      await loadMois(mois);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  function renderLigneChecks(
    day: Date,
    lignes: LigneQualifiee[],
    compact = false,
  ) {
    const date = dateKey(day);
    const typeJour = data.typesJourParDate[date] ?? "SEMAINE";
    const creneaux = creneauxDisponiblesPour(typeJour);
    const disabled = isPast(date) || isLoading;

    return (
      <div className={`space-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
        {lignes.map((ligne) => {
          if (typeJour === "SEMAINE") {
            const creneau = creneaux[0];
            const checked = isChecked(date, ligne.id, creneau);
            return (
              <label key={ligne.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleDisponibilite(
                      date,
                      ligne.id,
                      creneau,
                      event.target.checked,
                    )
                  }
                />
                <span>
                  {ligne.nom} — {libelleCreneau(creneau)}
                </span>
              </label>
            );
          }

          const [creneauJour, creneauNuit] = creneaux;
          const jourChecked = isChecked(date, ligne.id, creneauJour);
          const nuitChecked = isChecked(date, ligne.id, creneauNuit);
          const jourNuitChecked = isPrefChecked(
            date,
            ligne.id,
            "JOUR_NUIT",
          );

          return (
            <div key={ligne.id} className="rounded border border-zinc-100 p-1">
              <p className="font-medium">{ligne.nom}</p>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={jourChecked}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleDisponibilite(
                      date,
                      ligne.id,
                      creneauJour,
                      event.target.checked,
                    )
                  }
                />
                <span>{libelleCreneau(creneauJour)}</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={nuitChecked}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleDisponibilite(
                      date,
                      ligne.id,
                      creneauNuit,
                      event.target.checked,
                    )
                  }
                />
                <span>{libelleCreneau(creneauNuit)}</span>
              </label>
              {jourChecked && nuitChecked ? (
                <label className="mt-1 flex items-center gap-1 text-violet-800">
                  <input
                    type="checkbox"
                    checked={jourNuitChecked}
                    disabled={disabled}
                    onChange={(event) =>
                      togglePreference(
                        date,
                        ligne.id,
                        "JOUR_NUIT",
                        event.target.checked,
                      )
                    }
                  />
                  <span>Partant pour les 24h</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderWeekend48hRow(week: Array<Date | null>) {
    const samedi = getSaturdayInWeek(week);
    if (!samedi) {
      return null;
    }

    const satKey = dateKey(samedi);
    if (data.typesJourParDate[satKey] !== "SAMEDI") {
      return null;
    }

    const dimanche = new Date(samedi);
    dimanche.setUTCDate(dimanche.getUTCDate() + 1);
    if (dimanche.getUTCMonth() !== samedi.getUTCMonth()) {
      return null;
    }

    const sunKey = dateKey(dimanche);
    const lignes =
      viewMode === "ligne"
        ? data.lignesQualifiees.filter((ligne) => ligne.id === activeLigneId)
        : data.lignesQualifiees;

    const eligible = lignes.filter(
      (ligne) =>
        isPrefChecked(satKey, ligne.id, "JOUR_NUIT") &&
        isPrefChecked(sunKey, ligne.id, "JOUR_NUIT"),
    );

    if (eligible.length === 0) {
      return null;
    }

    return (
      <tr className="bg-violet-50">
        <td colSpan={7} className="border border-zinc-200 px-2 py-2 text-xs">
          <p className="mb-1 font-medium text-violet-900">
            Week-end {samedi.getUTCDate()}–{dimanche.getUTCDate()}
          </p>
          <div className="flex flex-wrap gap-4">
            {eligible.map((ligne) => {
              const checked = isPrefChecked(satKey, ligne.id, "WEEKEND_48H");
              const disabled = isPast(satKey) || isLoading;
              return (
                <label
                  key={ligne.id}
                  className="inline-flex items-center gap-1 text-violet-900"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) =>
                      togglePreference(
                        satKey,
                        ligne.id,
                        "WEEKEND_48H",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    {ligne.nom} — Partant pour le week-end complet (48h)
                  </span>
                </label>
              );
            })}
          </div>
        </td>
      </tr>
    );
  }

  const visibleLignes =
    viewMode === "ligne"
      ? data.lignesQualifiees.filter((ligne) => ligne.id === activeLigneId)
      : data.lignesQualifiees;

  if (data.lignesQualifiees.length === 0) {
    return (
      <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
        Vous n&apos;êtes qualifié sur aucune ligne d&apos;astreinte. Contactez
        le cadre pour configurer vos qualifications.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateMois(-1)}
            disabled={isLoading}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
          >
            ←
          </button>
          <h2 className="min-w-40 text-center text-lg font-medium capitalize">
            {moisLabel}
          </h2>
          <button
            type="button"
            onClick={() => navigateMois(1)}
            disabled={isLoading}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
          >
            →
          </button>
        </div>

        <div className="flex rounded border border-zinc-300 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setViewMode("global")}
            className={`rounded px-3 py-1 ${
              viewMode === "global" ? "bg-zinc-900 text-white" : ""
            }`}
          >
            Vue globale
          </button>
          <button
            type="button"
            onClick={() => setViewMode("ligne")}
            className={`rounded px-3 py-1 ${
              viewMode === "ligne" ? "bg-zinc-900 text-white" : ""
            }`}
          >
            Vue par ligne
          </button>
        </div>
      </div>

      {viewMode === "ligne" ? (
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
          {data.lignesQualifiees.map((ligne) => (
            <button
              key={ligne.id}
              type="button"
              onClick={() => setActiveLigneId(ligne.id)}
              className={`rounded px-3 py-1 text-sm ${
                activeLigneId === ligne.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300"
              }`}
            >
              {ligne.nom}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {warning ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {warning}
        </p>
      ) : null}

      {dupliquerPreview ? (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
          {dupliquerPreview}
        </p>
      ) : null}

      <section className="flex flex-wrap items-end gap-3 rounded border border-zinc-200 p-4">
        {viewMode === "global" ? (
          <div>
            <label htmlFor="ligneSource" className="mb-1 block text-sm">
              Ligne source
            </label>
            <select
              id="ligneSource"
              value={ligneSourceId}
              onChange={(event) => setLigneSourceId(event.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              {data.lignesQualifiees.map((ligne) => (
                <option key={ligne.id} value={ligne.id}>
                  {ligne.nom}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          type="button"
          onClick={preparerDuplication}
          disabled={isLoading}
          className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Appliquer à toutes mes lignes qualifiées
        </button>
        {showDupliquerConfirm ? (
          <button
            type="button"
            onClick={confirmerDuplication}
            disabled={isLoading}
            className="rounded border border-green-700 bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Confirmer
          </button>
        ) : null}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              {JOURS_SEMAINE.map((jour) => (
                <th
                  key={jour}
                  className="border border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-medium"
                >
                  {jour}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, weekIndex) => (
              <Fragment key={`week-${weekIndex}`}>
                <tr key={`week-${weekIndex}`}>
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return (
                        <td
                          key={`empty-${weekIndex}-${dayIndex}`}
                          className="border border-zinc-100 bg-zinc-50"
                        />
                      );
                    }

                    const date = dateKey(day);
                    const typeJour = data.typesJourParDate[date] ?? "SEMAINE";
                    const past = isPast(date);

                    return (
                      <td
                        key={date}
                        className={`align-top border border-zinc-200 px-2 py-2 ${
                          past ? "bg-zinc-50 text-zinc-500" : ""
                        } ${typeJour !== "SEMAINE" ? "bg-amber-50/40" : ""}`}
                      >
                        <p className="mb-2 font-medium">{day.getUTCDate()}</p>
                        {viewMode === "global" ? (
                          renderLigneChecks(day, data.lignesQualifiees, true)
                        ) : (
                          renderLigneChecks(day, visibleLignes)
                        )}
                      </td>
                    );
                  })}
                </tr>
                {renderWeekend48hRow(week)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
