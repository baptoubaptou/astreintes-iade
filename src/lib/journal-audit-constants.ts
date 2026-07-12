import { TypeActionAudit } from "@prisma/client";

export const ACTEUR_SYSTEME_VALUE = "systeme";

export const LIBELLES_TYPE_ACTION_AUDIT: Record<TypeActionAudit, string> = {
  [TypeActionAudit.DISPONIBILITE_AJOUTEE]: "Disponibilité ajoutée",
  [TypeActionAudit.DISPONIBILITE_SUPPRIMEE_MANUELLE]:
    "Disponibilité supprimée (manuelle)",
  [TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO]:
    "Disponibilité supprimée (automatique)",
  [TypeActionAudit.ASTREINTE_CREEE]: "Astreinte créée",
  [TypeActionAudit.ASTREINTE_MODIFIEE]: "Astreinte modifiée",
  [TypeActionAudit.ASTREINTE_ANNULEE]: "Astreinte annulée",
  [TypeActionAudit.PREFERENCE_AJOUTEE]: "Préférence ajoutée",
  [TypeActionAudit.PREFERENCE_SUPPRIMEE]: "Préférence supprimée",
  [TypeActionAudit.CAMPAGNE_CONFIRMEE]: "Campagne confirmée",
  [TypeActionAudit.PLANNING_PUBLIE]: "Planning publié",
};

export const TYPES_ACTION_AUDIT = Object.values(TypeActionAudit);
