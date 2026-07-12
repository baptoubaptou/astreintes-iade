"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getLigneLegendColors } from "@/lib/ligne-colors";
import type { PropositionAffectation } from "@/server/algorithme-affectation";
import { SimulationCreneauDisplay } from "@/components/generation-automatique/simulation-creneau-display";
import type { TypeJour } from "@/server/jours-feries";
import type { SimulationPlanningResult } from "@/server/simulation-planning";

type GenerationAutomatiquePanelProps = {
  defaultDateDebut: string;
  defaultDateFin: string;
};

type WorkflowStep = "parametrage" | "apercu";

function formatDateFr(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function libelleTypeJour(typeJour: TypeJour): string {
  switch (typeJour) {
    case "SAMEDI":
      return "Samedi";
    case "DIMANCHE":
      return "Dimanche";
    case "FERIE":
      return "Férié";
    default:
      return "Semaine";
  }
}

function classeLigneTypeJour(typeJour: TypeJour | undefined): string {
  switch (typeJour) {
    case "SAMEDI":
      return "bg-blue-50/60";
    case "DIMANCHE":
      return "bg-violet-50/60";
    case "FERIE":
      return "bg-rose-50/60";
    default:
      return "";
  }
}

function eachDayInRange(dateDebut: string, dateFin: string): string[] {
  const [startYear, startMonth, startDay] = dateDebut.split("-").map(Number);
  const [endYear, endMonth, endDay] = dateFin.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const days: string[] = [];

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function GenerationAutomatiquePanel({
  defaultDateDebut,
  defaultDateFin,
}: GenerationAutomatiquePanelProps) {
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

  const propositionMap = useMemo(() => {
    const map = new Map<string, PropositionAffectation[]>();

    if (!simulation) {
      return map;
    }

    for (const proposition of simulation.propositions) {
      const key = `${proposition.date}:${proposition.ligneId}`;
      const existing = map.get(key) ?? [];
      existing.push(proposition);
      map.set(key, existing);
    }

    return map;
  }, [simulation]);

  const jours = useMemo(() => {
    if (!simulation) {
      return [];
    }

    return eachDayInRange(
      simulation.periode.dateDebut,
      simulation.periode.dateFin,
    );
  }, [simulation]);

  async function parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error("Réponse serveur invalide. Rechargez la page et réessayez.");
    }
  }

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
          <h2 className="text-lg font-medium">Étape 1 — Paramétrage</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Choisissez la période à simuler. Le résultat sera figé : vous pourrez
            le valider en bloc ou le rejeter pour relancer une nouvelle simulation.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dateDebut" className="mb-1 block text-sm">
                Date de début
              </label>
              <input
                id="dateDebut"
                type="date"
                value={dateDebut}
                onChange={(event) => setDateDebut(event.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dateFin" className="mb-1 block text-sm">
                Date de fin
              </label>
              <input
                id="dateFin"
                type="date"
                value={dateFin}
                onChange={(event) => setDateFin(event.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={lancerSimulation}
            disabled={isLoading}
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

  const legend = getLigneLegendColors(simulation.lignes);

  return (
    <div className="space-y-8">
      <section className="rounded border border-zinc-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Étape 2 — Aperçu</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Période simulée : {simulation.periode.dateDebut} →{" "}
              {simulation.periode.dateFin}
              {simulation.modeAttribution === "LISSE"
                ? " · mode lissé"
                : " · mode glouton"}{" "}
              · {simulation.resume.pourvues} créneaux proposés ·{" "}
              {simulation.resume.dejaPlanifiees} déjà planifiés ·{" "}
              {simulation.resume.nonPourvues} non pourvus
              {simulation.resume.tiragesAuSort > 0
                ? ` · ${simulation.resume.tiragesAuSort} tirage(s) au sort`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {validationErrors.length > 0 ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">
              Erreurs de cohérence à la validation :
            </p>
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              {validationErrors.map((item, index) => (
                <li key={`${item.date}-${item.ligneNom}-${index}`}>
                  {item.date} — {item.ligneNom} : {item.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {legend.map((item) => (
            <span
              key={item.nom}
              className={`rounded border px-2 py-0.5 text-xs ${item.colorClass}`}
            >
              {item.nom}
            </span>
          ))}
          <span className="rounded border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs text-orange-900">
            Non pourvu
          </span>
          <span className="rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
            Déjà planifié
          </span>
        </div>
      </section>

      {simulation.modeAttribution === "LISSE" ? (
        <section className="rounded border border-amber-200 bg-amber-50/50 p-6">
          <h3 className="text-lg font-medium">
            Ajustements par rapport au résultat de base
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Le mode lissé part du résultat glouton, puis applique des échanges
            pour équilibrer la répartition des points.
          </p>
          {simulation.ajustementsLisse &&
          simulation.ajustementsLisse.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {simulation.ajustementsLisse.map((ajustement, index) => (
                <li
                  key={`${ajustement.type}-${index}`}
                  className={
                    ajustement.type === "bloc_casse"
                      ? "font-medium text-amber-900"
                      : "text-zinc-800"
                  }
                >
                  {ajustement.type === "bloc_casse" ? "⚠ " : "• "}
                  {ajustement.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">
              Aucun ajustement : le résultat glouton était déjà optimal pour le
              mode lissé sur cette période.
            </p>
          )}
        </section>
      ) : null}

      <section className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              {simulation.lignes.map((ligne) => (
                <th key={ligne.id} className="px-4 py-2 font-medium">
                  {ligne.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {jours.map((jour) => {
              const typeJour = simulation.typesJourParDate?.[jour];
              const rowClass = classeLigneTypeJour(typeJour);

              return (
                <tr key={jour} className={rowClass}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDateFr(jour)}
                    {typeJour && typeJour !== "SEMAINE" ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        ({libelleTypeJour(typeJour)})
                      </span>
                    ) : null}
                  </td>
                  {simulation.lignes.map((ligne) => {
                    const propositions =
                      propositionMap.get(`${jour}:${ligne.id}`) ?? [];

                    return (
                      <td key={ligne.id} className="px-4 py-2">
                        <SimulationCreneauDisplay
                          propositions={propositions}
                          ligneId={ligne.id}
                          ligneNom={ligne.nom}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-medium">
          Impact sur les points
          {simulation.annees.length === 1
            ? ` — année ${simulation.annees[0]}`
            : ""}
        </h3>
        <p className="mb-4 text-sm text-zinc-600">
          Totaux projetés après application de cette simulation (points actuels +
          astreintes simulées). Tri croissant pour visualiser l&apos;équilibre.
        </p>
        {(simulation.annees.length === 1
          ? [simulation.annees[0]]
          : simulation.annees
        ).map((annee) => {
          const rows = simulation.pointsApresSimulation.filter(
            (iade) => iade.annee === annee,
          );

          return (
            <div
              key={annee}
              className={
                simulation.annees.length > 1 ? "mb-8 last:mb-0" : undefined
              }
            >
              {simulation.annees.length > 1 ? (
                <h4 className="mb-2 text-base font-medium">Année {annee}</h4>
              ) : null}
              <div className="overflow-x-auto rounded border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">IADE</th>
                      <th className="px-4 py-2 font-medium">Points actuels</th>
                      <th className="px-4 py-2 font-medium">+ Simulation</th>
                      <th className="px-4 py-2 font-medium">Total projeté</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {rows.map((iade) => (
                      <tr key={`${annee}-${iade.iadeId}`}>
                        <td className="px-4 py-2">
                          {iade.prenom} {iade.nom}
                        </td>
                        <td className="px-4 py-2">{iade.pointsAvant}</td>
                        <td className="px-4 py-2">
                          {iade.delta > 0 ? `+${iade.delta}` : "—"}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {iade.pointsApres}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p>
          Rappel : ce résultat est figé. Validez-le en bloc pour l&apos;enregistrer,
          ou rejetez-le pour relancer une simulation complète. Les ajustements fins
          se font ensuite astreinte par astreinte via{" "}
          <a href="/admin/planning" className="underline">
            Gestion du planning
          </a>
          .
        </p>
      </section>
    </div>
  );
}
