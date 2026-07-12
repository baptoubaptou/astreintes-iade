"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAstreinteAction,
  updateAstreinteAction,
  type AstreinteFormActionState,
  type AstreinteFormError,
} from "@/app/admin/planning/actions";
import type { AstreinteFormContext } from "@/server/astreinte-creneaux";
import {
  estCreneauJour,
  LIBELLES_TYPE_CRENEAU_ASTREINTE,
} from "@/server/astreinte-creneaux";
import type { TypeJour } from "@/server/jours-feries";
import type { AstreinteListItem, IadeOption, LigneOption } from "@/server/astreintes";

const LIBELLE_TYPE_JOUR: Record<TypeJour, string> = {
  SEMAINE: "semaine",
  SAMEDI: "samedi",
  DIMANCHE: "dimanche",
  FERIE: "férié",
};

const initialState: AstreinteFormActionState = {};

type AstreinteFormPanelProps = {
  mois: string;
  lignes: LigneOption[];
  qualifiedByLigne: Record<string, IadeOption[]>;
  mode: "create" | "edit";
  astreinte?: AstreinteListItem;
  isOpen: boolean;
  onClose: () => void;
};

function isPastDate(dateValue: string): boolean {
  if (!dateValue) {
    return false;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const selected = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  return selected < todayUtc;
}

function FieldError({
  field,
  error,
}: {
  field: AstreinteFormError["field"];
  error?: AstreinteFormError;
}) {
  if (!error || (error.field && error.field !== field)) {
    return null;
  }

  return (
    <p className="mt-1 text-sm text-red-600" role="alert">
      {error.message}
    </p>
  );
}

export function AstreinteFormPanel({
  lignes,
  qualifiedByLigne,
  mode,
  astreinte,
  isOpen,
  onClose,
}: AstreinteFormPanelProps) {
  const router = useRouter();
  const [date, setDate] = useState(astreinte?.date ?? "");
  const [ligneId, setLigneId] = useState(astreinte?.ligne.id ?? "");
  const [iadeId, setIadeId] = useState(astreinte?.iade.id ?? "");
  const [iadeIdJour, setIadeIdJour] = useState("");
  const [iadeIdNuit, setIadeIdNuit] = useState("");
  const [context, setContext] = useState<AstreinteFormContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const boundCreateAction = createAstreinteAction.bind(null, "");
  const boundUpdateAction = astreinte
    ? updateAstreinteAction.bind(null, astreinte.id)
    : null;

  const [createState, createAction, isCreatePending] = useActionState(
    boundCreateAction,
    initialState,
  );
  const [updateState, updateAction, isUpdatePending] = useActionState(
    boundUpdateAction ?? boundCreateAction,
    initialState,
  );

  const state = mode === "edit" ? updateState : createState;
  const formAction = mode === "edit" ? updateAction : createAction;
  const isPending = mode === "edit" ? isUpdatePending : isCreatePending;

  const qualifiedIades = useMemo(
    () => (ligneId ? (qualifiedByLigne[ligneId] ?? []) : []),
    [ligneId, qualifiedByLigne],
  );

  const creneauJour = context?.creneaux.find((slot) =>
    estCreneauJour(slot.typeCreneau),
  );
  const creneauNuit = context?.creneaux.find(
    (slot) => !estCreneauJour(slot.typeCreneau),
  );
  const creneauSemaine = context?.creneaux.length === 1 ? context.creneaux[0] : null;

  const eligibleIadesEdit = useMemo(() => {
    if (mode !== "edit" || !context || !astreinte) {
      return qualifiedIades;
    }

    const slot = context.creneaux.find(
      (entry) => entry.typeCreneau === astreinte.typeCreneau,
    );

    return slot?.iadesEligibles ?? qualifiedIades;
  }, [mode, context, astreinte, qualifiedIades]);

  const isFormComplete =
    mode === "edit"
      ? Boolean(date && ligneId && iadeId)
      : creneauSemaine
        ? Boolean(date && ligneId && iadeId)
        : Boolean(date && ligneId && (iadeIdJour || iadeIdNuit));

  const showPastDateBadge = isPastDate(date);

  const pointsPreviewCreate = useMemo(() => {
    if (!context || mode === "edit") {
      return null;
    }

    if (creneauSemaine) {
      return String(creneauSemaine.poids);
    }

    const parts: string[] = [];
    if (iadeIdJour && creneauJour) {
      parts.push(`Jour ${creneauJour.poids}`);
    }
    if (iadeIdNuit && creneauNuit) {
      parts.push(`Nuit ${creneauNuit.poids}`);
    }

    if (parts.length === 0) {
      return "—";
    }

    const total =
      (iadeIdJour && creneauJour ? creneauJour.poids : 0) +
      (iadeIdNuit && creneauNuit ? creneauNuit.poids : 0);

    return `${parts.join(" + ")} = ${total} pt`;
  }, [
    context,
    mode,
    creneauSemaine,
    iadeIdJour,
    iadeIdNuit,
    creneauJour,
    creneauNuit,
  ]);

  useEffect(() => {
    if (isOpen) {
      setDate(astreinte?.date ?? "");
      setLigneId(astreinte?.ligne.id ?? "");
      setIadeId(astreinte?.iade.id ?? "");
      setIadeIdJour("");
      setIadeIdNuit("");
      setContext(null);
      setContextError(null);
    }
  }, [isOpen, astreinte]);

  useEffect(() => {
    if (!isOpen || !date || !ligneId) {
      return;
    }

    let cancelled = false;
    setLoadingContext(true);
    setContextError(null);

    fetch(
      `/api/admin/astreintes/context?date=${encodeURIComponent(date)}&ligneId=${encodeURIComponent(ligneId)}`,
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Erreur de chargement du contexte.");
        }
        return data as AstreinteFormContext;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setContext(data);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setContext(null);
          setContextError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, date, ligneId]);

  useEffect(() => {
    if (mode === "edit") {
      if (!eligibleIadesEdit.some((i) => i.id === iadeId)) {
        setIadeId("");
      }
      return;
    }

    if (creneauSemaine && !creneauSemaine.iadesEligibles.some((i) => i.id === iadeId)) {
      setIadeId("");
    }
    if (creneauJour && !creneauJour.iadesEligibles.some((i) => i.id === iadeIdJour)) {
      setIadeIdJour("");
    }
    if (creneauNuit && !creneauNuit.iadesEligibles.some((i) => i.id === iadeIdNuit)) {
      setIadeIdNuit("");
    }
  }, [
    mode,
    creneauSemaine,
    creneauJour,
    creneauNuit,
    eligibleIadesEdit,
    iadeId,
    iadeIdJour,
    iadeIdNuit,
  ]);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      if (!state.warning) {
        onClose();
      }
    }
  }, [state.success, state.warning, onClose, router]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="astreinte-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="astreinte-form-title" className="text-lg font-medium">
            {mode === "edit" ? "Modifier l'astreinte" : "Nouvelle astreinte"}
          </h2>
          <button type="button" onClick={onClose} className="text-sm underline">
            Fermer
          </button>
        </div>

        <form
          key={mode === "edit" ? astreinte?.id : "create"}
          action={formAction}
          className="space-y-4"
        >
          {state.error && !state.error.field ? (
            <p
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {state.error.message}
            </p>
          ) : null}

          <div>
            <label htmlFor="date" className="mb-1 block text-sm">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            {showPastDateBadge ? (
              <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                Date passée
              </span>
            ) : null}
            <FieldError field="date" error={state.error} />
          </div>

          <div>
            <label htmlFor="ligneId" className="mb-1 block text-sm">
              Ligne
            </label>
            <select
              id="ligneId"
              name="ligneId"
              value={ligneId}
              onChange={(event) => setLigneId(event.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="">Sélectionner une ligne</option>
              {lignes.map((ligne) => (
                <option key={ligne.id} value={ligne.id}>
                  {ligne.nom}
                </option>
              ))}
            </select>
            <FieldError field="ligneId" error={state.error} />
          </div>

          {loadingContext ? (
            <p className="text-sm text-zinc-500">Analyse de la date...</p>
          ) : null}

          {contextError ? (
            <p className="text-sm text-red-600" role="alert">
              {contextError}
            </p>
          ) : null}

          {context ? (
            <p className="text-sm text-zinc-600">
              Type de jour :{" "}
              <span className="font-medium">
                {LIBELLE_TYPE_JOUR[context.typeJour]}
              </span>
            </p>
          ) : null}

          {mode === "edit" && astreinte ? (
            <div>
              <p className="mb-1 text-sm">Créneau</p>
              <p className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm">
                {LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau]}
              </p>
            </div>
          ) : null}

          {mode === "create" && context && creneauSemaine ? (
            <div>
              <label htmlFor="iadeId" className="mb-1 block text-sm">
                IADE — {creneauSemaine.libelle}
              </label>
              {creneauSemaine.iadesEligibles.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  Aucun IADE qualifié et disponible pour ce créneau
                </p>
              ) : (
                <select
                  id="iadeId"
                  name="iadeId"
                  value={iadeId}
                  onChange={(event) => setIadeId(event.target.value)}
                  required
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                >
                  <option value="">Sélectionner un IADE</option>
                  {creneauSemaine.iadesEligibles.map((iade) => (
                    <option key={iade.id} value={iade.id}>
                      {iade.prenom} {iade.nom}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                {creneauSemaine.poids} pt — PoidsCreneau (
                {creneauSemaine.typeCreneau})
              </p>
              <FieldError field="iadeId" error={state.error} />
            </div>
          ) : null}

          {mode === "create" && context && !creneauSemaine ? (
            <>
              {creneauJour ? (
                <div>
                  <label htmlFor="iadeIdJour" className="mb-1 block text-sm">
                    IADE — {creneauJour.libelle} ({creneauJour.typeCreneau})
                  </label>
                  <select
                    id="iadeIdJour"
                    name="iadeIdJour"
                    value={iadeIdJour}
                    onChange={(event) => setIadeIdJour(event.target.value)}
                    disabled={creneauJour.iadesEligibles.length === 0}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">— Aucun —</option>
                    {creneauJour.iadesEligibles.map((iade) => (
                      <option key={iade.id} value={iade.id}>
                        {iade.prenom} {iade.nom}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    {creneauJour.poids} pt si renseigné
                  </p>
                  <FieldError field="iadeIdJour" error={state.error} />
                </div>
              ) : null}

              {creneauNuit ? (
                <div>
                  <label htmlFor="iadeIdNuit" className="mb-1 block text-sm">
                    IADE — {creneauNuit.libelle} ({creneauNuit.typeCreneau})
                  </label>
                  <select
                    id="iadeIdNuit"
                    name="iadeIdNuit"
                    value={iadeIdNuit}
                    onChange={(event) => setIadeIdNuit(event.target.value)}
                    disabled={creneauNuit.iadesEligibles.length === 0}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">— Aucun —</option>
                    {creneauNuit.iadesEligibles.map((iade) => (
                      <option key={iade.id} value={iade.id}>
                        {iade.prenom} {iade.nom}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    {creneauNuit.poids} pt si renseigné
                  </p>
                  <FieldError field="iadeIdNuit" error={state.error} />
                </div>
              ) : null}

              <p className="text-xs text-zinc-500">
                Sélectionnez au moins un créneau. Le même IADE peut couvrir jour
                et nuit (2 astreintes distinctes, points cumulés).
              </p>
            </>
          ) : null}

          {mode === "edit" ? (
            <div>
              <label htmlFor="iadeId" className="mb-1 block text-sm">
                IADE
              </label>
              {ligneId && eligibleIadesEdit.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  Aucun IADE qualifié et disponible pour ce créneau
                </p>
              ) : (
                <select
                  id="iadeId"
                  name="iadeId"
                  value={iadeId}
                  onChange={(event) => setIadeId(event.target.value)}
                  required
                  disabled={!ligneId || eligibleIadesEdit.length === 0}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50"
                >
                  <option value="">Sélectionner un IADE</option>
                  {eligibleIadesEdit.map((iade) => (
                    <option key={iade.id} value={iade.id}>
                      {iade.prenom} {iade.nom}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                Seuls les IADE qualifiés ayant déclaré le créneau disponible
                sont proposés.
              </p>
              <FieldError field="iadeId" error={state.error} />
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-sm">Points attribués</p>
            <p className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm">
              {mode === "edit" && astreinte
                ? astreinte.pointsAttribues
                : pointsPreviewCreate ?? "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Calculé depuis PoidsCreneau (ligne × type de créneau exact)
            </p>
          </div>

          {state.warning ? (
            <p
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              {state.warning}
            </p>
          ) : null}

          {state.success ? (
            <p className="text-sm text-green-700" role="status">
              {state.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!isFormComplete || isPending || loadingContext}
            className="w-full rounded border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </aside>
    </div>
  );
}
