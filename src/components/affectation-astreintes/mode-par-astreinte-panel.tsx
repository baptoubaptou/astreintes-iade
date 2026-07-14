"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BorneCalendrierPublie } from "@/server/calendrier-publie";
import {
  ajusterPeriodeApresCalendrierPublie,
} from "@/server/calendrier-publie";
import type { LigneCampagneOption } from "@/server/campagnes";
import type { LotEnAttenteSummary } from "@/server/lot-generation";
import type { SimulationPlanningResult } from "@/server/simulation-planning";
import {
  parseJsonResponse,
  SimulationApercu,
} from "@/components/affectation-astreintes/simulation-apercu";

type CampagneProchaine = {
  id: string;
  ligneId: string;
  ligneNom: string;
  periodeDebut: string;
  periodeFin: string;
  dateGenerationPrevue: string;
};

type ModeParAstreintePanelProps = {
  lignes: LigneCampagneOption[];
  campagneProchaine: CampagneProchaine | null;
  lotEnAttenteInitial: LotEnAttenteSummary | null;
  defaultDateDebut: string;
  defaultDateFin: string;
  bornesCalendrierParLigne: Record<string, BorneCalendrierPublie>;
};

const BORNE_VIDE: BorneCalendrierPublie = {
  dateDernierePublication: null,
  dateDebutMin: null,
};

function ajusterDatesPourLigne(
  dateDebut: string,
  dateFin: string,
  borne: BorneCalendrierPublie,
): { dateDebut: string; dateFin: string } {
  return ajusterPeriodeApresCalendrierPublie(
    dateDebut,
    dateFin,
    borne.dateDebutMin,
  );
}

type ViewState =
  | { kind: "form" }
  | { kind: "simulation"; simulation: SimulationPlanningResult }
  | { kind: "lot"; lot: LotEnAttenteSummary; simulation: SimulationPlanningResult };

function initialLigneId(
  lotEnAttente: LotEnAttenteSummary | null,
  campagneProchaine: CampagneProchaine | null,
  lignes: LigneCampagneOption[],
): string {
  if (lotEnAttente) {
    return lotEnAttente.ligneId;
  }
  if (campagneProchaine) {
    return campagneProchaine.ligneId;
  }
  return lignes[0]?.id ?? "";
}

function initialDates(
  lotEnAttente: LotEnAttenteSummary | null,
  campagneProchaine: CampagneProchaine | null,
  defaultDateDebut: string,
  defaultDateFin: string,
  ligneId: string,
  bornesCalendrierParLigne: Record<string, BorneCalendrierPublie>,
): { dateDebut: string; dateFin: string } {
  const borne = bornesCalendrierParLigne[ligneId] ?? BORNE_VIDE;

  if (lotEnAttente) {
    return ajusterDatesPourLigne(
      lotEnAttente.periodeDebut,
      lotEnAttente.periodeFin,
      borne,
    );
  }
  if (campagneProchaine) {
    return ajusterDatesPourLigne(
      campagneProchaine.periodeDebut,
      campagneProchaine.periodeFin,
      borne,
    );
  }
  return ajusterDatesPourLigne(defaultDateDebut, defaultDateFin, borne);
}

export function ModeParAstreintePanel({
  lignes,
  campagneProchaine,
  lotEnAttenteInitial,
  defaultDateDebut,
  defaultDateFin,
  bornesCalendrierParLigne,
}: ModeParAstreintePanelProps) {
  const router = useRouter();
  const initialLigne = initialLigneId(
    lotEnAttenteInitial,
    campagneProchaine,
    lignes,
  );
  const initialDatesValue = initialDates(
    lotEnAttenteInitial,
    campagneProchaine,
    defaultDateDebut,
    defaultDateFin,
    initialLigne,
    bornesCalendrierParLigne,
  );

  const [lotEnAttente, setLotEnAttente] = useState(lotEnAttenteInitial);
  const [ligneId, setLigneId] = useState(initialLigne);
  const [dateDebut, setDateDebut] = useState(initialDatesValue.dateDebut);
  const [dateFin, setDateFin] = useState(initialDatesValue.dateFin);
  const [view, setView] = useState<ViewState>({ kind: "form" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Array<{ date: string; ligneNom: string; message: string }>
  >([]);

  const verrouAutreLigne =
    lotEnAttente !== null && lotEnAttente.ligneId !== ligneId;

  const lotPourLigneSelectionnee =
    lotEnAttente !== null && lotEnAttente.ligneId === ligneId
      ? lotEnAttente
      : null;

  const chargerApercuLot = useCallback(async (lotId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/lots-generation/apercu?lotId=${encodeURIComponent(lotId)}`,
      );
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Impossible de charger le lot en attente.",
        );
        return null;
      }

      return data as SimulationPlanningResult;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger le lot.",
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!lotPourLigneSelectionnee) {
      setView((current) => (current.kind === "lot" ? { kind: "form" } : current));
      return;
    }

    let cancelled = false;

    void (async () => {
      const simulation = await chargerApercuLot(lotPourLigneSelectionnee.id);
      if (cancelled || !simulation) {
        return;
      }

      setView({
        kind: "lot",
        lot: lotPourLigneSelectionnee,
        simulation,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [lotPourLigneSelectionnee, chargerApercuLot]);

  const borneLigne = bornesCalendrierParLigne[ligneId] ?? BORNE_VIDE;
  const dateDebutMin = borneLigne.dateDebutMin;
  const dateDebutInvalide =
    dateDebutMin !== null && dateDebut < dateDebutMin;

  function appliquerCampagneLigne(nouvelleLigneId: string) {
    setLigneId(nouvelleLigneId);

    const borne = bornesCalendrierParLigne[nouvelleLigneId] ?? BORNE_VIDE;
    const campagne = campagneProchaine?.ligneId === nouvelleLigneId
      ? campagneProchaine
      : null;

    if (lotEnAttente?.ligneId === nouvelleLigneId) {
      const periode = ajusterDatesPourLigne(
        lotEnAttente.periodeDebut,
        lotEnAttente.periodeFin,
        borne,
      );
      setDateDebut(periode.dateDebut);
      setDateFin(periode.dateFin);
    } else if (campagne) {
      const periode = ajusterDatesPourLigne(
        campagne.periodeDebut,
        campagne.periodeFin,
        borne,
      );
      setDateDebut(periode.dateDebut);
      setDateFin(periode.dateFin);
    } else {
      const periode = ajusterDatesPourLigne(dateDebut, dateFin, borne);
      setDateDebut(periode.dateDebut);
      setDateFin(periode.dateFin);
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
        body: JSON.stringify({ dateDebut, dateFin, ligneId }),
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

      setView({ kind: "simulation", simulation: data as SimulationPlanningResult });
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

  async function enregistrerLot(publier: boolean) {
    const simulation =
      view.kind === "simulation" ? view.simulation : null;

    if (!simulation) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch("/api/admin/lots-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ligneId,
          dateDebut: simulation.periode.dateDebut,
          dateFin: simulation.periode.dateFin,
          propositions: simulation.propositions,
          publier,
        }),
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
            : "L'enregistrement a échoué.",
        );
        return;
      }

      if (publier) {
        router.push(
          `/admin/planning?success=lot-publie&created=${data.created}&ligne=${encodeURIComponent(ligneId)}`,
        );
        router.refresh();
        return;
      }

      router.refresh();
      setLotEnAttente({
        id: String(data.lotId),
        ligneId,
        ligneNom: lignes.find((l) => l.id === ligneId)?.nom ?? "",
        periodeDebut: simulation.periode.dateDebut,
        periodeFin: simulation.periode.dateFin,
        dateCreation: new Date().toISOString(),
        astreintesCount: Number(data.created),
        fenetreGenerationId: null,
      });
      setView({ kind: "form" });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer le lot.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function actionLot(action: "publier" | "annuler", lotId: string) {
    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch(
        `/api/admin/lots-generation/${encodeURIComponent(lotId)}/${action}`,
        { method: "POST" },
      );

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Action impossible.",
        );
        return;
      }

      if (action === "publier") {
        router.push(
          `/admin/planning?success=lot-publie&publiees=${data.publiees ?? 0}`,
        );
      } else {
        setLotEnAttente(null);
        setView({ kind: "form" });
      }

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Impossible d'exécuter l'action.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function rejeterSimulation() {
    setView({ kind: "form" });
    setError(null);
    setValidationErrors([]);
  }

  const formulaireDesactive =
    verrouAutreLigne || lotPourLigneSelectionnee !== null;

  return (
    <div className="space-y-6">
      {lotEnAttente ? (
        <section
          className="rounded border border-amber-300 bg-amber-50 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-amber-950">
            Une génération est en cours sur{" "}
            <strong>{lotEnAttente.ligneNom}</strong> ({lotEnAttente.periodeDebut}{" "}
            → {lotEnAttente.periodeFin}) — publiez-la ou annulez-la avant
            d&apos;en commencer une autre.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => actionLot("publier", lotEnAttente.id)}
              className="rounded border border-green-700 bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Publier
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => actionLot("annuler", lotEnAttente.id)}
              className="rounded border border-zinc-400 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      {view.kind === "lot" ? (
        <SimulationApercu
          simulation={view.simulation}
          titre={`Lot en attente — ${view.lot.ligneNom}`}
          error={error}
          validationErrors={validationErrors}
          actions={
            <>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => actionLot("publier", view.lot.id)}
                className="rounded border border-green-700 bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isLoading ? "Publication..." : "Publier maintenant"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => actionLot("annuler", view.lot.id)}
                className="rounded border border-red-300 px-4 py-2 text-sm text-red-800 disabled:opacity-50"
              >
                Annuler ce lot
              </button>
            </>
          }
          piedDePage={
            <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              <p>
                {view.lot.astreintesCount} astreinte(s) enregistrée(s), non
                publiée(s). La publication notifiera les IADE concernés et
                retirera les disponibilités en conflit sur les autres lignes.
              </p>
            </section>
          }
        />
      ) : view.kind === "simulation" ? (
        <SimulationApercu
          simulation={view.simulation}
          titre={`Aperçu — ${lignes.find((l) => l.id === ligneId)?.nom ?? "ligne"}`}
          error={error}
          validationErrors={validationErrors}
          actions={
            <>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => enregistrerLot(true)}
                className="rounded border border-green-700 bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isLoading ? "Enregistrement..." : "Valider et publier maintenant"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => enregistrerLot(false)}
                className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Enregistrer sans publier
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={rejeterSimulation}
                className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                Rejeter
              </button>
            </>
          }
          piedDePage={
            <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              <p>
                « Valider et publier » enregistre et notifie immédiatement les
                IADE. « Enregistrer sans publier » bloque toute autre génération
                par astreinte jusqu&apos;à publication ou annulation du lot.
              </p>
            </section>
          }
        />
      ) : (
        <section
          className={`rounded border border-zinc-200 p-6 ${formulaireDesactive ? "opacity-60" : ""}`}
        >
          <h2 className="text-lg font-medium">Paramétrage — Par astreinte</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Générez le planning pour une seule ligne. Les points de départ
            proviennent des affectations déjà enregistrées sur les autres lignes.
          </p>

          <fieldset disabled={formulaireDesactive} className="mt-4 space-y-4">
            <div>
              <label htmlFor="ligneId" className="mb-1 block text-sm">
                Ligne d&apos;astreinte
              </label>
              <select
                id="ligneId"
                value={ligneId}
                onChange={(event) => appliquerCampagneLigne(event.target.value)}
                className="w-full max-w-md rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                {lignes.map((ligne) => (
                  <option key={ligne.id} value={ligne.id}>
                    {ligne.nom}
                  </option>
                ))}
              </select>
              {campagneProchaine ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Campagne planifiée la plus proche : {campagneProchaine.ligneNom}{" "}
                  (génération prévue le {campagneProchaine.dateGenerationPrevue})
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ligne-dateDebut" className="mb-1 block text-sm">
                  Date de début
                </label>
                <input
                  id="ligne-dateDebut"
                  type="date"
                  value={dateDebut}
                  min={dateDebutMin ?? undefined}
                  onChange={(event) => setDateDebut(event.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                />
                {dateDebutMin ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Calendrier publié jusqu&apos;au{" "}
                    {borneLigne.dateDernierePublication} — début minimum le{" "}
                    {dateDebutMin}.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ligne-dateFin" className="mb-1 block text-sm">
                  Date de fin
                </label>
                <input
                  id="ligne-dateFin"
                  type="date"
                  value={dateFin}
                  onChange={(event) => setDateFin(event.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              </div>
            </div>

            {verrouAutreLigne ? (
              <p className="text-sm text-amber-800">
                Le formulaire est désactivé tant que le lot en cours sur{" "}
                {lotEnAttente?.ligneNom} n&apos;est pas résolu.
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

            <button
              type="button"
              onClick={lancerSimulation}
              disabled={
                isLoading || formulaireDesactive || !ligneId || dateDebutInvalide
              }
              className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isLoading ? "Simulation en cours..." : "Lancer la simulation"}
            </button>
          </fieldset>
        </section>
      )}
    </div>
  );
}
