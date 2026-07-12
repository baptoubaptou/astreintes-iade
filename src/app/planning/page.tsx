import Link from "next/link";
import { Suspense } from "react";
import { Role } from "@prisma/client";
import { PlanningCalendar } from "@/components/planning-calendar/planning-calendar";
import {
  getDefaultSemaine,
  getMonthGridDays,
  getWeekDays,
  getWeekRange,
  parseDateParam,
  type CalendarView,
} from "@/lib/calendar";
import { parseMoisParam } from "@/server/astreintes";
import {
  getActiveLignesOptions,
  listAstreintes,
  listAstreintesInRange,
} from "@/server/astreintes";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

type PlanningPageProps = {
  searchParams: Promise<{
    mois?: string;
    vue?: string;
    semaine?: string;
  }>;
};

function getCalendarRangeForMonthGrid(mois: string) {
  const monthDays = getMonthGridDays(mois);
  const firstDate = monthDays[0]?.date;
  const lastDate = monthDays[monthDays.length - 1]?.date;

  const start = firstDate ? parseDateParam(firstDate) : null;
  const endBase = lastDate ? parseDateParam(lastDate) : null;
  const end =
    endBase &&
    new Date(
      Date.UTC(
        endBase.getUTCFullYear(),
        endBase.getUTCMonth(),
        endBase.getUTCDate() + 1,
      ),
    );

  return { monthDays, start, end };
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const { value: mois } = parseMoisParam(params.mois);
  const vue: CalendarView = params.vue === "semaine" ? "semaine" : "mois";
  const semaine = params.semaine ?? getDefaultSemaine(mois);

  const [lignes, monthGrid] = await Promise.all([
    getActiveLignesOptions(),
    Promise.resolve(getCalendarRangeForMonthGrid(mois)),
  ]);

  const weekDays = getWeekDays(semaine);
  const { start: weekStart, end: weekEnd } = getWeekRange(semaine);

  const visibilite =
    user.role === Role.CADRE ? "toutes" : "publiees_seulement";

  const astreintes =
    vue === "semaine"
      ? await listAstreintesInRange(weekStart, weekEnd, { visibilite })
      : monthGrid.start && monthGrid.end
        ? await listAstreintesInRange(monthGrid.start, monthGrid.end, {
            visibilite,
          })
        : await listAstreintes({ mois, visibilite });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Planning collectif</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Vue calendrier de toutes les astreintes du service (mois / semaine,
          couleurs par ligne).
          {user.role === Role.IADE
            ? " Seules les astreintes publiées par le cadre sont visibles."
            : " Les astreintes en brouillon sont visibles uniquement par le cadre."}{" "}
          <Link href="/mes-astreintes" className="underline">
            Voir mes astreintes
          </Link>
          {user.role === "CADRE" ? (
            <>
              {" "}
              ·{" "}
              <Link href="/admin/planning" className="underline">
                Gérer le planning
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <Suspense fallback={<p className="text-sm">Chargement du calendrier...</p>}>
        <PlanningCalendar
          mois={mois}
          vue={vue}
          semaine={semaine}
          role={user.role}
          lignes={lignes}
          monthDays={monthGrid.monthDays}
          weekDays={weekDays}
          astreintes={astreintes}
        />
      </Suspense>
    </main>
  );
}
