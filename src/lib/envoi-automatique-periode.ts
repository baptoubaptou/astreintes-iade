import { JourSemaine } from "@prisma/client";
import { formatDateParam } from "@/lib/calendar";
import { LIBELLES_JOUR_SEMAINE } from "@/lib/jour-semaine";

export type ApercuEnvoiAutomatique = {
  dateEnvoi: string;
  periodeDebut: string;
  periodeFin: string;
  libelle: string;
};

const JOUR_ENVOI_VERS_UTC_DAY: Record<JourSemaine, number> = {
  [JourSemaine.DIMANCHE]: 0,
  [JourSemaine.LUNDI]: 1,
  [JourSemaine.MARDI]: 2,
  [JourSemaine.MERCREDI]: 3,
  [JourSemaine.JEUDI]: 4,
  [JourSemaine.VENDREDI]: 5,
  [JourSemaine.SAMEDI]: 6,
};

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function formatDateFrLong(date: Date): string {
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return label.charAt(0).toLowerCase() + label.slice(1);
}

function formatDateFrCourt(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function calculerPeriodeEnvoi(dateEnvoi: Date): {
  debut: Date;
  fin: Date;
} {
  const date = new Date(
    Date.UTC(
      dateEnvoi.getUTCFullYear(),
      dateEnvoi.getUTCMonth(),
      dateEnvoi.getUTCDate(),
    ),
  );
  const day = date.getUTCDay();
  const daysUntilNextMonday = day === 1 ? 7 : day === 0 ? 1 : 8 - day;
  const debut = addDaysUtc(date, daysUntilNextMonday);
  const fin = addDaysUtc(debut, 6);

  return { debut, fin };
}

export function calculerProchainEnvoiEtPeriode(
  jourEnvoi: JourSemaine,
  referenceDate: Date = startOfTodayUtc(),
): {
  dateEnvoi: Date;
  periodeDebut: Date;
  periodeFin: Date;
} {
  const reference = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const targetDay = JOUR_ENVOI_VERS_UTC_DAY[jourEnvoi];
  const currentDay = reference.getUTCDay();
  const daysAhead = (targetDay - currentDay + 7) % 7;
  const dateEnvoi = addDaysUtc(reference, daysAhead);
  const { debut, fin } = calculerPeriodeEnvoi(dateEnvoi);

  return { dateEnvoi, periodeDebut: debut, periodeFin: fin };
}

export function formaterApercuEnvoiAutomatique(
  jourEnvoi: JourSemaine,
  referenceDate?: Date,
): ApercuEnvoiAutomatique {
  const { dateEnvoi, periodeDebut, periodeFin } =
    calculerProchainEnvoiEtPeriode(jourEnvoi, referenceDate);

  const jourLabel = LIBELLES_JOUR_SEMAINE[jourEnvoi].toLowerCase();

  return {
    dateEnvoi: formatDateParam(dateEnvoi),
    periodeDebut: formatDateParam(periodeDebut),
    periodeFin: formatDateParam(periodeFin),
    libelle: `Prochain envoi : ${jourLabel} ${formatDateFrCourt(dateEnvoi)}, pour la période du ${formatDateFrLong(periodeDebut)} au ${formatDateFrLong(periodeFin)}`,
  };
}
