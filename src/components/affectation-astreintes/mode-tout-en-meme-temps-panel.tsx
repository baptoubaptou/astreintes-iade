"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BorneCalendrierPublie } from "@/server/calendrier-publie";
import type { SimulationPlanningResult } from "@/server/simulation-planning";
import {
  parseJsonResponse,
  SimulationApercu,
} from "@/components/affectation-astreintes/simulation-apercu";

type ModeToutEnMemeTempsPanelProps = {
  defaultDateDebut: string;
  defaultDateFin: string;
  borneCalendrier: BorneCalendrierPublie;
};

type WorkflowStep = "parametrage" | "apercu";

export function ModeToutEnMemeTempsPanel({
  defaultDateDebut,
  defaultDateFin,
  borneCalendrier,
}: ModeToutEnMemeTempsPanelProps) {
  const router = useRouter();
  const [step, setStep] = useState<WorkflowStep>("parametrage");
  const [dateDebut, setDateDebut] = useState(defaultDateDebut);
  const [dateFin, setDateFin] = useState(defaultDateFin);
  const [simulation, setSimulation] = useState<SimulationPlanningResult | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Array<{ date: string; ligneNom: string; message: string }>
  >([]);

  const dateDebutMin = borneCalendrier.dateDebutMin;
  const dateDebutInvalide =
    dateDebutMin !== null && dateDebut < dateDebutMin;

  async function lancerSimulation() {
    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch("/api/admin/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateDebut, dateFin }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Erreur lors de la simulation.",
        );
        return;
      }

      setSimulation(data as SimulationPlanningResult);
      setStep("apercu");
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Impossible de contacter le serveur.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function validerSimulation() {
    if (!simulation) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch("/api/admin/simulation/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propositions: simulation.propositions }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        if (Array.isArray(data.errors)) {
          setValidationErrors(
            data.errors as Array<{
              date: string;
              ligneNom: string;
              message: string;
            }>,
          );
        }
        setError(
          typeof data.error === "string"
            ? data.error
            : "La validation a échoué. Le planning a peut-être changé depuis la simulation.",
        );
        return;
      }

      router.push(
        `/admin/planning?success=simulation&created=${data.created}&nonPourvues=${data.nonPourvues ?? 0}`,
      );
      router.refresh();
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Impossible de valider la simulation.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function rejeterSimulation() {
    setSimulation(null);
    setStep("parametrage");
    setError(null);
    setValidationErrors([]);
  }

  if (step === "parametrage") {
    return (
      <div className="space-y-6">
        <section className="rounded border border-zinc-200 p-6">
          <h2 className="text-lg font-medium">Paramétrage — Tout en même temps</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Choisissez la période à simuler sur toutes les lignes actives (ordre
            de priorité Greffe → Obstétrique → Urgences). Validez en bloc ou
            relancez une simulation.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="global-dateDebut" className="mb-1 block text-sm">
                Date de début
              </label>
              <input
                id="global-dateDebut"
                type="date"
                value={dateDebut}
                min={dateDebutMin ?? undefined}
                onChange={(event) => setDateDebut(event.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              {dateDebutMin ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Calendrier publié jusqu&apos;au{" "}
                  {borneCalendrier.dateDernierePublication} — début minimum le{" "}
                  {dateDebutMin}.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="global-dateFin" className="mb-1 block text-sm">
                Date de fin
              </label>
              <input
                id="global-dateFin"
                type="date"
                value={dateFin}
                onChange={(event) => setDateFin(event.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {error ? (
            <p
              className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={lancerSimulation}
            disabled={isLoading || dateDebutInvalide}
            className="mt-4 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? "Simulation en cours..." : "Lancer la simulation"}
          </button>
        </section>
      </div>
    );
  }

  if (!simulation) {
    return null;
  }

  return (
    <SimulationApercu
      simulation={simulation}
      titre="Aperçu — Tout en même temps"
      error={error}
      validationErrors={validationErrors}
      actions={
        <>
          <button
            type="button"
            onClick={validerSimulation}
            disabled={isLoading}
            className="rounded border border-green-700 bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? "Validation..." : "Valider et appliquer"}
          </button>
          <button
            type="button"
            onClick={rejeterSimulation}
            disabled={isLoading}
            className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Rejeter
          </button>
        </>
      }
      piedDePage={
        <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          <p>
            Rappel : ce résultat est figé. Validez-le en bloc pour
            l&apos;enregistrer, ou rejetez-le pour relancer une simulation
            complète. Les ajustements fins se font ensuite via{" "}
            <a href="/admin/planning" className="underline">
              Gestion du planning
            </a>
            .
          </p>
        </section>
      }
    />
  );
}
