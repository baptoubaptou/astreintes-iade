import type { TypeCreneau } from "@prisma/client";
import type {
  BlocContinuiteCasse,
  EchangeReoptimisation,
  JournalReoptimisationLisse,
} from "@/server/algorithme-lisse";

export type AjustementLisseAffichage = {
  type: "echange" | "bloc_casse";
  message: string;
};

function formatDateCourt(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function libelleTypeCreneauCourt(typeCreneau: TypeCreneau): string {
  return typeCreneau;
}

function formaterEchange(echange: EchangeReoptimisation): AjustementLisseAffichage[] {
  const raison =
    echange.passe === 2
      ? "pour réduire l'écart de points"
      : "pour lisser la répartition";

  const lignes: AjustementLisseAffichage[] = [];

  for (const creneau of echange.creneauxA) {
    lignes.push({
      type: "echange",
      message: `Créneau du ${formatDateCourt(creneau.date)} (${libelleTypeCreneauCourt(creneau.typeCreneau)}) : ${echange.iadeANom} → ${echange.iadeBNom}, ${raison}`,
    });
  }

  for (const creneau of echange.creneauxB) {
    lignes.push({
      type: "echange",
      message: `Créneau du ${formatDateCourt(creneau.date)} (${libelleTypeCreneauCourt(creneau.typeCreneau)}) : ${echange.iadeBNom} → ${echange.iadeANom}, ${raison}`,
    });
  }

  return lignes;
}

function formaterBlocCasse(bloc: BlocContinuiteCasse): AjustementLisseAffichage {
  const dateRef = bloc.creneaux[0]?.date ?? "";
  const libellePreference =
    bloc.type === "WEEKEND_48H" ? "Préférence 48h" : "Préférence 24h";

  return {
    type: "bloc_casse",
    message: `${libellePreference} du ${formatDateCourt(dateRef)} non honorée pour rééquilibrer un écart important`,
  };
}

export function formaterAjustementsLisse(
  journal: JournalReoptimisationLisse | undefined,
): AjustementLisseAffichage[] {
  if (!journal) {
    return [];
  }

  const resultat: AjustementLisseAffichage[] = [];

  for (const echange of journal.echanges) {
    resultat.push(...formaterEchange(echange));
  }

  for (const bloc of journal.blocsCasses) {
    resultat.push(formaterBlocCasse(bloc));
  }

  return resultat;
}
