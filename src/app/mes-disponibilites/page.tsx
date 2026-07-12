import { Suspense } from "react";
import { MesDisponibilitesCalendar } from "@/components/disponibilites/mes-disponibilites-calendar";
import { parseMoisParam, shiftMois } from "@/server/astreintes";
import { getMesDisponibilitesMoisData } from "@/server/disponibilites";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

type MesDisponibilitesPageProps = {
  searchParams: Promise<{ mois?: string }>;
};

export default async function MesDisponibilitesPage({
  searchParams,
}: MesDisponibilitesPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const { value: mois } = parseMoisParam(params.mois);
  const moisLabel = shiftMois(mois, 0).label;
  const data = await getMesDisponibilitesMoisData({
    iadeId: user.id,
    mois,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Mes disponibilités</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Déclarez les dates et créneaux où vous êtes disponible, ligne par ligne.
          Sans déclaration, vous êtes considéré indisponible (opt-in strict).
          Les jours de semaine utilisent le créneau Journée ; les week-ends et
          jours fériés se déclarent en Jour et Nuit.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm">Chargement du calendrier...</p>}>
        <MesDisponibilitesCalendar
          initialMois={mois}
          initialMoisLabel={moisLabel}
          initialData={data}
        />
      </Suspense>
    </main>
  );
}
