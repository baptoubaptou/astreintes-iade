"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getLigneLegendColors } from "@/lib/ligne-colors";
import { buildRechercheRemplacementHref } from "@/lib/a-pourvoir-links";
import type { APourvoirResult } from "@/server/a-pourvoir";

type AdminAPourvoirPanelProps = {
  initialData: APourvoirResult;
  initialDateDebut: string;
  initialDateFin: string;
};

function formatDateFr(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function countDaysInclusive(dateDebut: string, dateFin: string): number {
  const [sy, sm, sd] = dateDebut.split("-").map(Number);
  const [ey, em, ed] = dateFin.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function AdminAPourvoirPanel({
  initialData,
  initialDateDebut,
  initialDateFin,
}: AdminAPourvoirPanelProps) {
  const router = useRouter();
  const [dateDebut, setDateDebut] = useState(initialDateDebut);
  const [dateFin, setDateFin] = useState(initialDateFin);
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nbJours = countDaysInclusive(data.periode.dateDebut, data.periode.dateFin);
  const legend = getLigneLegendColors(
    data.parLigne.map((groupe) => ({ id: groupe.ligneId, nom: groupe.ligneNom })),
  );
  const legendParNom = new Map(legend.map((item) => [item.nom, item.colorClass]));

  async function appliquerPeriode() {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ dateDebut, dateFin });
      const response = await fetch(`/api/admin/a-pourvoir?${params.toString()}`);
      const payload = (await response.json()) as APourvoirResult & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Impossible de charger les créneaux à pourvoir.");
        return;
      }

      setData(payload);
      router.replace(`/admin/a-pourvoir?${params.toString()}`, { scroll: false });
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-zinc-200 p-6">
        <h2 className="text-lg font-medium">Période</h2>
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
          <p
            className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={appliquerPeriode}
          disabled={isLoading}
          className="mt-4 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? "Actualisation..." : "Actualiser"}
        </button>
      </section>

      <section className="rounded border border-amber-200 bg-amber-50/60 p-4">
        <p className="text-sm font-medium text-amber-950">
          {data.total === 0
            ? `Aucun créneau à pourvoir sur les ${nbJours} prochains jours (${data.periode.dateDebut} → ${data.periode.dateFin}).`
            : `${data.total} créneau${data.total > 1 ? "x" : ""} à pourvoir sur les ${nbJours} prochains jours (${data.periode.dateDebut} → ${data.periode.dateFin}).`}
        </p>
      </section>

      {data.total === 0 ? (
        <p className="text-sm text-zinc-600">
          Tous les créneaux attendus sont couverts par une astreinte sur la
          période sélectionnée.
        </p>
      ) : (
        <div className="space-y-8">
          {data.parLigne.map((groupe) => (
            <section
              key={groupe.ligneId}
              className="overflow-hidden rounded border border-zinc-200"
            >
              <header
                className={`flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 ${
                  legendParNom.get(groupe.ligneNom) ?? "bg-zinc-50"
                }`}
              >
                <h3 className="font-medium">{groupe.ligneNom}</h3>
                <span className="text-sm text-zinc-700">
                  {groupe.creneaux.length} créneau
                  {groupe.creneaux.length > 1 ? "x" : ""} à pourvoir
                </span>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Créneau</th>
                      <th className="px-4 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {groupe.creneaux.map((creneau) => (
                      <tr key={`${creneau.date}-${creneau.typeCreneau}`}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {formatDateFr(creneau.date)}
                        </td>
                        <td className="px-4 py-2">{creneau.libelleCreneau}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={buildRechercheRemplacementHref(creneau)}
                            className="inline-block rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Trouver un remplaçant
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
