import type { AstreinteListItem } from "@/server/astreintes";
import type { CalendarDay } from "@/lib/calendar";
import {
  formatDayHeading,
  formatDayNumber,
  getWeekdayLabels,
} from "@/lib/calendar";
import { DayAstreintesDisplay } from "@/components/planning-calendar/day-astreintes-display";

type WeekGridProps = {
  days: CalendarDay[];
  astreintesByDate: Record<string, AstreinteListItem[]>;
  showBrouillon?: boolean;
};

export function WeekGrid({
  days,
  astreintesByDate,
  showBrouillon = false,
}: WeekGridProps) {
  const weekdays = getWeekdayLabels();

  return (
    <div className="grid gap-4 md:grid-cols-7">
      {days.map((day, index) => {
        const astreintes = astreintesByDate[day.date] ?? [];

        return (
          <div
            key={day.date}
            className="rounded border border-zinc-200 bg-white p-3"
          >
            <div className="mb-1 text-xs font-medium uppercase text-zinc-500">
              {weekdays[index]}
            </div>
            <div className="mb-3 text-sm font-semibold">
              {formatDayNumber(day.date)}
            </div>
            <p className="mb-3 text-xs text-zinc-600">
              {formatDayHeading(day.date)}
            </p>
            <div className="space-y-2">
              {astreintes.length === 0 ? (
                <p className="text-xs text-zinc-400">Aucune astreinte</p>
              ) : (
                <DayAstreintesDisplay
                  astreintes={astreintes}
                  showBrouillon={showBrouillon}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
