import type { AstreinteListItem } from "@/server/astreintes";
import type { CalendarDay } from "@/lib/calendar";
import { formatDayNumber, getWeekdayLabels } from "@/lib/calendar";
import { DayAstreintesDisplay } from "@/components/planning-calendar/day-astreintes-display";

type MonthGridProps = {
  days: CalendarDay[];
  astreintesByDate: Record<string, AstreinteListItem[]>;
  showBrouillon?: boolean;
};

export function MonthGrid({
  days,
  astreintesByDate,
  showBrouillon = false,
}: MonthGridProps) {
  const weekdays = getWeekdayLabels();

  return (
    <div>
      <div className="grid grid-cols-7 gap-px rounded-t border border-zinc-200 bg-zinc-200 text-center text-xs font-medium">
        {weekdays.map((label) => (
          <div key={label} className="bg-zinc-50 px-2 py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px rounded-b border border-t-0 border-zinc-200 bg-zinc-200">
        {days.map((day) => {
          const astreintes = astreintesByDate[day.date] ?? [];

          return (
            <div
              key={day.date}
              className={`min-h-28 bg-white p-2 ${
                day.inMonth ? "" : "bg-zinc-50 text-zinc-400"
              }`}
            >
              <div className="mb-2 text-sm font-medium">
                {formatDayNumber(day.date)}
              </div>
              <div className="space-y-1">
                <DayAstreintesDisplay
                  astreintes={astreintes}
                  compact
                  showBrouillon={showBrouillon}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
