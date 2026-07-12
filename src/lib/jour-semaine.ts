import { JourSemaine } from "@prisma/client";

export const JOURS_SEMAINE: JourSemaine[] = [
  JourSemaine.LUNDI,
  JourSemaine.MARDI,
  JourSemaine.MERCREDI,
  JourSemaine.JEUDI,
  JourSemaine.VENDREDI,
  JourSemaine.SAMEDI,
  JourSemaine.DIMANCHE,
];

export const LIBELLES_JOUR_SEMAINE: Record<JourSemaine, string> = {
  [JourSemaine.LUNDI]: "Lundi",
  [JourSemaine.MARDI]: "Mardi",
  [JourSemaine.MERCREDI]: "Mercredi",
  [JourSemaine.JEUDI]: "Jeudi",
  [JourSemaine.VENDREDI]: "Vendredi",
  [JourSemaine.SAMEDI]: "Samedi",
  [JourSemaine.DIMANCHE]: "Dimanche",
};
