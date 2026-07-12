const MS_HEURE = 60 * 60 * 1000;
const MS_JOUR = 24 * MS_HEURE;

export const MESSAGE_BOURSE_FERMEE =
  "Délai trop court pour la bourse, contactez le cadre.";

export type PalierFenetreBourse =
  | ">7j"
  | "3-7j"
  | "2-3j"
  | "1-2j"
  | "fermee";

export type FenetreBourseCalculee =
  | {
      ouverte: true;
      dureeMs: number;
      dureeHeures: number;
      palier: PalierFenetreBourse;
      delaiRestantMs: number;
    }
  | {
      ouverte: false;
      palier: "fermee";
      message: string;
      delaiRestantMs: number;
    };

export function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Grille CDC §3.5 :
 * >7j → 72h | 3-7j → 48h | 2-3j → 24h | 1-2j → 12h | <24h → fermée
 */
export function calculerFenetreBourse(
  maintenant: Date,
  dateAstreinte: Date,
): FenetreBourseCalculee {
  const debutAstreinte = normalizeUtcDay(dateAstreinte);
  const delaiRestantMs = debutAstreinte.getTime() - maintenant.getTime();

  if (delaiRestantMs < MS_JOUR) {
    return {
      ouverte: false,
      palier: "fermee",
      message: MESSAGE_BOURSE_FERMEE,
      delaiRestantMs,
    };
  }

  if (delaiRestantMs > 7 * MS_JOUR) {
    return {
      ouverte: true,
      dureeMs: 72 * MS_HEURE,
      dureeHeures: 72,
      palier: ">7j",
      delaiRestantMs,
    };
  }

  if (delaiRestantMs >= 3 * MS_JOUR) {
    return {
      ouverte: true,
      dureeMs: 48 * MS_HEURE,
      dureeHeures: 48,
      palier: "3-7j",
      delaiRestantMs,
    };
  }

  if (delaiRestantMs >= 2 * MS_JOUR) {
    return {
      ouverte: true,
      dureeMs: 24 * MS_HEURE,
      dureeHeures: 24,
      palier: "2-3j",
      delaiRestantMs,
    };
  }

  return {
    ouverte: true,
    dureeMs: 12 * MS_HEURE,
    dureeHeures: 12,
    palier: "1-2j",
    delaiRestantMs,
  };
}

export function calculerDateFermetureOffre(
  dateOuverture: Date,
  dateAstreinte: Date,
  fenetre: Extract<FenetreBourseCalculee, { ouverte: true }>,
): Date {
  const debutAstreinte = normalizeUtcDay(dateAstreinte);
  const fermetureTheorique = new Date(
    dateOuverture.getTime() + fenetre.dureeMs,
  );

  return fermetureTheorique.getTime() < debutAstreinte.getTime()
    ? fermetureTheorique
    : debutAstreinte;
}
