"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@prisma/client";
import type { AstreinteListItem, LigneOption } from "@/server/astreintes";
import type { CalendarDay, CalendarView } from "@/lib/calendar";
import {
  getMonthLabel,
  getWeekLabel,
  shiftMonth,
  shiftSemaine,
} from "@/lib/calendar";
import { LigneLegend } from "@/components/planning-calendar/ligne-legend";
import { MonthGrid } from "@/components/planning-calendar/month-grid";
import { WeekGrid } from "@/components/planning-calendar/week-grid";
import { ExportPlanningPdfButton } from "@/components/planning/export-planning-pdf-button";
import { ExportPlanningExcelButton } from "@/components/planning/export-planning-excel-button";

type PlanningCalendarProps = {
  mois: string;
  vue: CalendarView;
  semaine: string;
  role: Role;
  lignes: LigneOption[];
  monthDays: CalendarDay[];
  weekDays: CalendarDay[];
  astreintes: AstreinteListItem[];
  basePath?: string;
  showAdminLink?: boolean;
};

function groupAstreintesByDate(astreintes: AstreinteListItem[]) {
  return astreintes.reduce<Record<string, AstreinteListItem[]>>(
    (acc, astreinte) => {
      if (!acc[astreinte.date]) {
        acc[astreinte.date] = [];
      }
      acc[astreinte.date].push(astreinte);
      return acc;
    },
    {},
  );
}

export function PlanningCalendar({
  mois,
  vue,
  semaine,
  role,
  lignes,
  monthDays,
  weekDays,
  astreintes,
  basePath = "/planning",
  showAdminLink = true,
}: PlanningCalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const astreintesByDate = groupAstreintesByDate(astreintes);
  const showBrouillon = role === "CADRE";

  function buildUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mois", mois);

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    return `${basePath}?${params.toString()}`;
  }

  function setView(nextView: CalendarView) {
    router.push(
      buildUrl({
        vue: nextView,
        semaine: nextView === "semaine" ? semaine : undefined,
      }),
    );
  }

  const weekPrevHref = buildUrl({
    vue: "semaine",
    semaine: shiftSemaine(semaine, -1),
    mois: shiftSemaine(semaine, -1).slice(0, 7),
  });
  const weekNextHref = buildUrl({
    vue: "semaine",
    semaine: shiftSemaine(semaine, 1),
    mois: shiftSemaine(semaine, 1).slice(0, 7),
  });
  const monthPrevHref = buildUrl({ mois: shiftMonth(mois, -1), vue: "mois" });
  const monthNextHref = buildUrl({ mois: shiftMonth(mois, 1), vue: "mois" });

  const title =
    vue === "mois" ? getMonthLabel(mois) : getWeekLabel(semaine);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={vue === "mois" ? monthPrevHref : weekPrevHref}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
            aria-label={vue === "mois" ? "Mois précédent" : "Semaine précédente"}
          >
            ←
          </Link>
          <h2 className="min-w-48 text-center text-lg font-medium">{title}</h2>
          <Link
            href={vue === "mois" ? monthNextHref : weekNextHref}
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
            aria-label={vue === "mois" ? "Mois suivant" : "Semaine suivante"}
          >
            →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ExportPlanningPdfButton mois={mois} />
          <ExportPlanningExcelButton mois={mois} />
          <div className="inline-flex rounded border border-zinc-300 text-sm">
            <button
              type="button"
              onClick={() => setView("mois")}
              className={`px-3 py-1 ${
                vue === "mois" ? "bg-zinc-100 font-medium" : ""
              }`}
            >
              Vue mois
            </button>
            <button
              type="button"
              onClick={() => setView("semaine")}
              className={`border-l border-zinc-300 px-3 py-1 ${
                vue === "semaine" ? "bg-zinc-100 font-medium" : ""
              }`}
            >
              Vue semaine
            </button>
          </div>

          {showAdminLink && role === "CADRE" ? (
            <Link
              href="/admin/planning"
              className="rounded border border-zinc-300 px-3 py-1 text-sm font-medium"
            >
              Gérer le planning
            </Link>
          ) : null}
        </div>
      </div>

      <LigneLegend lignes={lignes} />

      {vue === "mois" ? (
        <MonthGrid
          days={monthDays}
          astreintesByDate={astreintesByDate}
          showBrouillon={showBrouillon}
        />
      ) : (
        <WeekGrid
          days={weekDays}
          astreintesByDate={astreintesByDate}
          showBrouillon={showBrouillon}
        />
      )}
    </div>
  );
}
