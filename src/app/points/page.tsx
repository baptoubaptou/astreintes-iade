import { Suspense } from "react";
import { PointsTable, PointsYearSelector } from "@/components/points/points-view";
import { ExportPointsButtons } from "@/components/points/export-points-buttons";
import { getCurrentUser } from "@/server/auth";
import { getPointsOverview, parseAnneeParam } from "@/server/points";
import { redirect } from "next/navigation";

type PointsPageProps = {
  searchParams: Promise<{ annee?: string }>;
};

export default async function PointsPage({ searchParams }: PointsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const annee = parseAnneeParam(params.annee);
  const overview = await getPointsOverview(annee);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Points cumulés</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Vue transparente des points par IADE pour l&apos;année civile
            sélectionnée (tous types de créneau). Tri par défaut : points
            décroissants. Le détail par créneau s&apos;affiche lorsque plusieurs
            types sont présents sur une ligne.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Suspense fallback={null}>
            <PointsYearSelector annee={annee} />
          </Suspense>
          <ExportPointsButtons annee={annee} />
        </div>
      </div>

      {overview.iades.length === 0 ? (
        <p className="text-sm text-zinc-600">Aucun IADE actif.</p>
      ) : (
        <PointsTable
          overview={overview}
          currentUserId={user.role === "IADE" ? user.id : undefined}
        />
      )}
    </main>
  );
}
