import { TypeCreneau, TypePreferenceContinuite } from "@prisma/client";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { LIBELLES_DISPONIBILITE_CRENEAU } from "@/server/disponibilites";

export function formatDateFrAudit(date: string | Date): string {
  const value =
    typeof date === "string"
      ? (() => {
          const [year, month, day] = date.split("-").map(Number);
          return new Date(Date.UTC(year, month - 1, day));
        })()
      : new Date(
          Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
          ),
        );

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function libelleCreneauDisponibilite(type: TypeCreneau): string {
  return (
    LIBELLES_DISPONIBILITE_CRENEAU[type] ??
    LIBELLES_TYPE_CRENEAU_ASTREINTE[type]
  );
}

export function libellePreference(type: TypePreferenceContinuite): string {
  return type === TypePreferenceContinuite.WEEKEND_48H
    ? "week-end complet (48h)"
    : "24h (jour + nuit)";
}

export function resumeDisponibiliteAjoutee(input: {
  ligneNom: string;
  date: string;
  typeCreneau: TypeCreneau;
  duplicationMultiLignes?: boolean;
}): string {
  const prefix = input.duplicationMultiLignes
    ? "Disponibilité ajoutée (duplication multi-lignes)"
    : "Disponibilité ajoutée";
  return `${prefix} : ${input.ligneNom}, ${formatDateFrAudit(input.date)} (${libelleCreneauDisponibilite(input.typeCreneau)}).`;
}

export function resumeDisponibiliteSupprimeeManuelle(input: {
  ligneNom: string;
  date: string;
  typeCreneau: TypeCreneau;
}): string {
  return `Disponibilité retirée : ${input.ligneNom}, ${formatDateFrAudit(input.date)} (${libelleCreneauDisponibilite(input.typeCreneau)}).`;
}

export function resumeAstreinteCreee(input: {
  iadePrenom: string;
  iadeNom: string;
  ligneNom: string;
  date: string;
  typeCreneau: TypeCreneau;
}): string {
  return `Astreinte créée : ${input.iadePrenom} ${input.iadeNom} — ${input.ligneNom}, ${formatDateFrAudit(input.date)} (${LIBELLES_TYPE_CRENEAU_ASTREINTE[input.typeCreneau]}).`;
}

export function resumeAstreinteModifiee(input: {
  iadePrenom: string;
  iadeNom: string;
  ligneNom: string;
  date: string;
  typeCreneau: TypeCreneau;
  campagneConfirmee?: boolean;
}): string {
  const prefix = input.campagneConfirmee
    ? "Astreinte modifiée (campagne confirmée)"
    : "Astreinte modifiée";
  return `${prefix} : ${input.iadePrenom} ${input.iadeNom} — ${input.ligneNom}, ${formatDateFrAudit(input.date)} (${LIBELLES_TYPE_CRENEAU_ASTREINTE[input.typeCreneau]}).`;
}

export function resumeAstreinteAnnulee(input: {
  iadePrenom: string;
  iadeNom: string;
  ligneNom: string;
  date: string;
  typeCreneau: TypeCreneau;
  campagneConfirmee?: boolean;
}): string {
  const prefix = input.campagneConfirmee
    ? "Astreinte annulée (campagne confirmée)"
    : "Astreinte annulée";
  return `${prefix} : ${input.iadePrenom} ${input.iadeNom} — ${input.ligneNom}, ${formatDateFrAudit(input.date)} (${LIBELLES_TYPE_CRENEAU_ASTREINTE[input.typeCreneau]}).`;
}

export function resumePreferenceAjoutee(input: {
  ligneNom: string;
  dateDebut: string;
  type: TypePreferenceContinuite;
  duplicationMultiLignes?: boolean;
}): string {
  const prefix = input.duplicationMultiLignes
    ? "Préférence de continuité ajoutée (duplication multi-lignes)"
    : "Préférence de continuité ajoutée";
  return `${prefix} : ${libellePreference(input.type)} sur ${input.ligneNom}, à partir du ${formatDateFrAudit(input.dateDebut)}.`;
}

export function resumePreferenceSupprimee(input: {
  ligneNom: string;
  dateDebut: string;
  type: TypePreferenceContinuite;
}): string {
  return `Préférence de continuité retirée : ${libellePreference(input.type)} sur ${input.ligneNom}, à partir du ${formatDateFrAudit(input.dateDebut)}.`;
}
