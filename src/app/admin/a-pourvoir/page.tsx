import { AdminAPourvoirPanel } from "@/components/a-pourvoir/admin-a-pourvoir-panel";
import {
  getDefaultAPourvoirPeriode,
  listerCreneauxAPourvoir,
} from "@/server/a-pourvoir";
import { parseDateInput } from "@/server/astreintes";
import { requireCadre } from "@/server/require-cadre";

type PageProps = {
  searchParams: Promise<{ dateDebut?: string; dateFin?: string }>;
};

export default async function AdminAPourvoirPage({ searchParams }: PageProps) {
  await requireCadre();

  const params = await searchParams;
  const defaults = getDefaultAPourvoirPeriode();
  const dateDebutStr = params.dateDebut ?? defaults.dateDebut;
  const dateFinStr = params.dateFin ?? defaults.dateFin;

  const dateDebut = parseDateInput(dateDebutStr);
  const dateFin = parseDateInput(dateFinStr);

  const data =
    dateDebut && dateFin && dateFin >= dateDebut
      ? await listerCreneauxAPourvoir(dateDebut, dateFin)
      : await listerCreneauxAPourvoir(
          parseDateInput(defaults.dateDebut)!,
          parseDateInput(defaults.dateFin)!,
        );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Créneaux à pourvoir</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Créneaux attendus sans astreinte enregistrée (hors annulées), par
          ligne et par période. Utilisez la recherche de remplacement pour
          proposer un IADE sur un créneau manquant.
        </p>
      </div>

      <AdminAPourvoirPanel
        initialData={data}
        initialDateDebut={data.periode.dateDebut}
        initialDateFin={data.periode.dateFin}
      />
    </main>
  );
}
