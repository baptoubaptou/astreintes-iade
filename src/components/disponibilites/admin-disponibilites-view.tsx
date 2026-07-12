"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { TypeCreneau } from "@prisma/client";
import {
  LIBELLES_DISPONIBILITE_CRENEAU,
  type CoverageAlert,
  type DisponibiliteItem,
} from "@/server/disponibilites";
import type { IadeOption } from "@/server/astreintes";

type AdminDisponibilitesViewProps = {
  disponibilites: DisponibiliteItem[];
  iades: IadeOption[];
  alerts: CoverageAlert[];
  selectedIadeId?: string;
  periodeDebut: string;
  periodeFin: string;
};

function libelleCreneau(typeCreneau: TypeCreneau): string {
  return LIBELLES_DISPONIBILITE_CRENEAU[typeCreneau] ?? typeCreneau;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AdminDisponibilitesView({
  disponibilites,
  iades,
  alerts,
  selectedIadeId,
  periodeDebut,
  periodeFin,
}: AdminDisponibilitesViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [feedback] = useState<string | null>(null);

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams(searchParams.toString());
    const iadeId = String(formData.get("iadeId") ?? "");
    const debut = String(formData.get("periodeDebut") ?? "");
    const fin = String(formData.get("periodeFin") ?? "");

    if (iadeId) {
      params.set("iadeId", iadeId);
    } else {
      params.delete("iadeId");
    }

    if (debut) {
      params.set("periodeDebut", debut);
    }

    if (fin) {
      params.set("periodeFin", fin);
    }

    router.push(`/admin/disponibilites?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(new FormData(event.currentTarget));
        }}
        className="flex flex-wrap items-end gap-4 rounded border border-zinc-200 p-4"
      >
        <div>
          <label htmlFor="iadeId" className="mb-1 block text-sm">
            IADE
          </label>
          <select
            id="iadeId"
            name="iadeId"
            defaultValue={selectedIadeId ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">Tous les IADE</option>
            {iades.map((iade) => (
              <option key={iade.id} value={iade.id}>
                {iade.prenom} {iade.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="periodeDebut" className="mb-1 block text-sm">
            Période du
          </label>
          <input
            id="periodeDebut"
            name="periodeDebut"
            type="date"
            defaultValue={periodeDebut}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="periodeFin" className="mb-1 block text-sm">
            au
          </label>
          <input
            id="periodeFin"
            name="periodeFin"
            defaultValue={periodeFin}
            type="date"
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

      <p className="text-sm text-zinc-600">
        Consultation seule : les IADE gèrent leurs disponibilités depuis{" "}
        <a href="/mes-disponibilites" className="underline">
          Mes disponibilités
        </a>
        .
      </p>

      {alerts.length > 0 ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-900">Alertes de couverture</h2>
          <p className="mt-1 text-sm text-amber-800">
            Dates à venir sans aucun IADE qualifié et disponible déclaré sur une
            ligne :
          </p>
          <ul className="mt-3 space-y-1 text-sm text-amber-900">
            {alerts.map((alert) => (
              <li key={`${alert.date}-${alert.ligneId}`}>
                {formatDate(alert.date)} — {alert.ligneNom} : 0 IADE disponible
                qualifié
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feedback ? (
        <p
          className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-medium">
          Disponibilités déclarées ({disponibilites.length})
        </h2>
        {disponibilites.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Aucune disponibilité pour les filtres sélectionnés.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">IADE</th>
                  <th className="px-4 py-2 font-medium">Ligne</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Créneau</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {disponibilites.map((dispo) => (
                  <tr key={dispo.id}>
                    <td className="px-4 py-2">
                      {dispo.iade
                        ? `${dispo.iade.prenom} ${dispo.iade.nom}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2">{dispo.ligneNom ?? "—"}</td>
                    <td className="px-4 py-2">{formatDate(dispo.date)}</td>
                    <td className="px-4 py-2">
                      {libelleCreneau(dispo.typeCreneau)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
