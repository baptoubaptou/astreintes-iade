export type CalendarDay = {
  date: string;
  inMonth: boolean;
};

export type CalendarView = "mois" | "semaine";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function formatDateParam(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateParam(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function getMonthLabel(mois: string): string {
  const date = parseDateParam(`${mois}-01`);
  if (!date) {
    return mois;
  }

  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(mois: string, delta: number): string {
  const date = parseDateParam(`${mois}-01`);
  if (!date) {
    return mois;
  }

  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1),
  );
  return formatDateParam(shifted).slice(0, 7);
}

export function getMondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + diff,
    ),
  );
}

export function getDefaultSemaine(mois: string): string {
  const now = new Date();
  const currentMois = formatDateParam(now).slice(0, 7);

  if (currentMois === mois) {
    return formatDateParam(getMondayUtc(now));
  }

  const firstOfMonth = parseDateParam(`${mois}-01`);
  if (!firstOfMonth) {
    return `${mois}-01`;
  }

  return formatDateParam(getMondayUtc(firstOfMonth));
}

export function shiftSemaine(semaine: string, deltaWeeks: number): string {
  const monday = parseDateParam(semaine);
  if (!monday) {
    return semaine;
  }

  return formatDateParam(
    new Date(
      Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + deltaWeeks * 7,
      ),
    ),
  );
}

export function getWeekDays(semaine: string): CalendarDay[] {
  const monday = parseDateParam(semaine);
  if (!monday) {
    return [];
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + index,
      ),
    );

    return {
      date: formatDateParam(date),
      inMonth: true,
    };
  });
}

export function getMonthGridDays(mois: string): CalendarDay[] {
  const firstOfMonth = parseDateParam(`${mois}-01`);
  if (!firstOfMonth) {
    return [];
  }

  const year = firstOfMonth.getUTCFullYear();
  const month = firstOfMonth.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingDays = (firstOfMonth.getUTCDay() + 6) % 7;

  const cells: CalendarDay[] = [];

  for (let index = 0; index < leadingDays; index += 1) {
    const date = new Date(Date.UTC(year, month, index - leadingDays + 1));
    cells.push({ date: formatDateParam(date), inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    cells.push({ date: formatDateParam(date), inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const last = parseDateParam(cells[cells.length - 1].date);
    if (!last) {
      break;
    }
    const next = new Date(
      Date.UTC(
        last.getUTCFullYear(),
        last.getUTCMonth(),
        last.getUTCDate() + 1,
      ),
    );
    cells.push({ date: formatDateParam(next), inMonth: false });
  }

  return cells;
}

export function getWeekRange(semaine: string): { start: Date; end: Date } {
  const monday = parseDateParam(semaine);
  if (!monday) {
    const fallback = new Date();
    return { start: fallback, end: fallback };
  }

  const end = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() + 7,
    ),
  );

  return { start: monday, end };
}

export function getWeekLabel(semaine: string): string {
  const days = getWeekDays(semaine);
  if (days.length === 0) {
    return semaine;
  }

  const start = parseDateParam(days[0].date);
  const end = parseDateParam(days[6].date);
  if (!start || !end) {
    return semaine;
  }

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${formatter.format(start)} — ${formatter.format(end)}`;
}

export function getWeekdayLabels(): string[] {
  return WEEKDAY_LABELS;
}

export function formatDayNumber(date: string): string {
  const parsed = parseDateParam(date);
  if (!parsed) {
    return date;
  }

  return String(parsed.getUTCDate());
}

export function formatDayHeading(date: string): string {
  const parsed = parseDateParam(date);
  if (!parsed) {
    return date;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parsed);
}
