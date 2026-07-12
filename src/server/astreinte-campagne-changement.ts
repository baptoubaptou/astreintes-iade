import {
  StatutFenetreGeneration,
  TypeCreneau,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateFrAudit } from "@/server/audit-resumes";
import { parseDateInput } from "@/server/astreintes";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { creerNotification } from "@/server/notifications";
import { notifierNouvelleAffectationPlanning } from "@/server/publication-planning";

export type CampagneConfirmeeContext = {
  id: string;
  ligneNom: string;
};

function normalizeUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function trouverCampagneConfirmeePourAstreinte(
  ligneId: string,
  date: Date,
): Promise<CampagneConfirmeeContext | null> {
  const jour = normalizeUtcDay(date);

  const fenetre = await prisma.fenetreGeneration.findFirst({
    where: {
      ligneId,
      statut: StatutFenetreGeneration.CONFIRMEE,
      periodeDebut: { lte: jour },
      periodeFin: { gte: jour },
    },
    include: { ligne: { select: { nom: true } } },
  });

  if (!fenetre) {
    return null;
  }

  return {
    id: fenetre.id,
    ligneNom: fenetre.ligne.nom,
  };
}

type AstreinteAvantChangement = {
  id: string;
  date: Date;
  typeCreneau: TypeCreneau;
  ligne: { id: string; nom: string };
  iade: { id: string; nom: string; prenom: string };
};

type AstreinteApresModification = {
  date: string;
  typeCreneau: TypeCreneau;
  ligne: { id: string; nom: string };
  iade: { id: string; nom: string; prenom: string };
};

function libelleCreneau(typeCreneau: TypeCreneau): string {
  return LIBELLES_TYPE_CRENEAU_ASTREINTE[typeCreneau];
}

function resumeAstreinte(input: {
  ligneNom: string;
  date: string | Date;
  typeCreneau: TypeCreneau;
}): string {
  const dateLabel = formatDateFrAudit(input.date);
  return `${input.ligneNom}, ${dateLabel} (${libelleCreneau(input.typeCreneau)})`;
}

async function chargerUtilisateurEmail(
  utilisateurId: string,
): Promise<{ email: string; prenom: string; nom: string } | null> {
  return prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { email: true, prenom: true, nom: true },
  });
}

export async function notifierChangementAstreinteCampagneConfirmee(options: {
  type: "modification" | "annulation";
  avant: AstreinteAvantChangement;
  apres?: AstreinteApresModification;
  acteurId: string;
  campagne: CampagneConfirmeeContext;
}): Promise<void> {
  const { type, avant, apres, acteurId, campagne } = options;
  const avantResume = resumeAstreinte({
    ligneNom: avant.ligne.nom,
    date: avant.date,
    typeCreneau: avant.typeCreneau,
  });

  const iadeCibleId = avant.iade.id;
  const iade = await chargerUtilisateurEmail(iadeCibleId);
  const cadre = await chargerUtilisateurEmail(acteurId);

  if (iade) {
    const detailModification =
      type === "modification" && apres
        ? apres.iade.id !== avant.iade.id ||
            apres.ligne.id !== avant.ligne.id ||
            apres.date !== avant.date.toISOString().slice(0, 10)
          ? ` Nouvelle affectation : ${resumeAstreinte({
              ligneNom: apres.ligne.nom,
              date: apres.date,
              typeCreneau: apres.typeCreneau,
            })}.`
          : ""
        : "";

    const messageIade =
      type === "annulation"
        ? `Votre astreinte ${avantResume} a été annulée (campagne confirmée ${campagne.ligneNom}).`
        : `Votre astreinte ${avantResume} a été modifiée (campagne confirmée ${campagne.ligneNom}).${detailModification}`;

    await creerNotification(
      iadeCibleId,
      type === "annulation"
        ? "ASTREINTE_ANNULEE_CAMPAGNE"
        : "ASTREINTE_MODIFIEE_CAMPAGNE",
      `${messageIade} Vous pouvez redéclarer vos disponibilités sur d'autres lignes si vous le souhaitez ; elles ne sont pas restaurées automatiquement.`,
      {
        to: iade.email,
        subject:
          type === "annulation"
            ? "Astreinte annulée — campagne confirmée"
            : "Astreinte modifiée — campagne confirmée",
        body: `Bonjour ${iade.prenom},\n\n${messageIade}\n\nLes disponibilités retirées automatiquement sur d'autres lignes lors de la confirmation de la campagne ne sont pas restaurées. Vous pouvez les redéclarer dans l'application si vous le souhaitez.\n\nCordialement,\nAstreintes IADE`,
      },
    );
  }

  if (cadre) {
    const iadeLabel = `${avant.iade.prenom} ${avant.iade.nom}`;
    const actionLabel =
      type === "annulation" ? "Annulation effectuée" : "Modification effectuée";

    const messageCadre = `${actionLabel} : ${iadeLabel} — ${avantResume} (campagne confirmée ${campagne.ligneNom}). Les disponibilités supprimées sur les autres lignes ne sont pas restaurées automatiquement.`;

    await creerNotification(
      acteurId,
      type === "annulation"
        ? "ASTREINTE_ANNULEE_CADRE"
        : "ASTREINTE_MODIFIEE_CADRE",
      messageCadre,
      {
        to: cadre.email,
        subject:
          type === "annulation"
            ? "Confirmation : astreinte annulée"
            : "Confirmation : astreinte modifiée",
        body: `Bonjour ${cadre.prenom},\n\n${messageCadre}\n\nCordialement,\nAstreintes IADE`,
      },
    );
  }

  if (
    type === "modification" &&
    apres &&
    apres.iade.id !== avant.iade.id
  ) {
    const nouvelIade = await prisma.utilisateur.findUnique({
      where: { id: apres.iade.id },
      select: {
        id: true,
        email: true,
        prenom: true,
        nom: true,
      },
    });

    if (nouvelIade) {
      const date = parseDateInput(apres.date);
      if (date) {
        await notifierNouvelleAffectationPlanning({
          date,
          typeCreneau: apres.typeCreneau,
          ligne: { nom: apres.ligne.nom },
          iade: nouvelIade,
        });
      }
    }
  }
}
