import { Suspense } from "react";
import { AdminDisponibilitesView } from "@/components/disponibilites/admin-disponibilites-view";
import { formatMois, getActiveIadesOptions } from "@/server/astreintes";
import {
  getCoverageAlerts,
  listDisponibilites,
} from "@/server/disponibilites";
import { requireCadre } from "@/server/require-cadre";

type AdminDisponibilitesPageProps = {
  searchParams: Promise<{
    iadeId?: string;
    periodeDebut?: string;
    periodeFin?: string;
  }>;
};

function defaultPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodeDebut = formatMois(year, month) + "-01";

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodeFin = `${formatMois(year, month)}-${String(lastDay).padStart(2, "0")}`;

  return { periodeDebut, periodeFin };
}

export default async function AdminDisponibilitesPage({
  searchParams,
}: AdminDisponibilitesPageProps) {
  await requireCadre();

  const params = await searchParams;
  const defaults = defaultPeriod();
  const periodeDebut = params.periodeDebut || defaults.periodeDebut;
  const periodeFin = params.periodeFin || defaults.periodeFin;
  const iadeId = params.iadeId || undefined;

  const [disponibilites, iades, alerts] = await Promise.all([
    listDisponibilites({
      iadeId,
      periodeDebut,
      periodeFin,
      includeIade: true,
    }),
    getActiveIadesOptions(),
    getCoverageAlerts({ periodeDebut, periodeFin }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Disponibilités IADE</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Vue de toutes les disponibilités déclarées. Les dates sans déclaration
          sont indisponibles par défaut. Les alertes signalent les jours à venir
          sans aucun IADE qualifié et disponible sur une ligne.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm">Chargement...</p>}>
        <AdminDisponibilitesView
          disponibilites={disponibilites}
          iades={iades}
          alerts={alerts}
          selectedIadeId={iadeId}
          periodeDebut={periodeDebut}
          periodeFin={periodeFin}
        />
      </Suspense>
    </main>
  );
}
