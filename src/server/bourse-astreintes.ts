import {
  Role,
  StatutAstreinte,
  StatutOffreAstreinte,
  TypeCreneau,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { isIadeEligiblePourCreneau } from "@/server/astreinte-creneaux";
import {
  calculerDateFermetureOffre,
  calculerFenetreBourse,
  MESSAGE_BOURSE_FERMEE,
  normalizeUtcDay,
  type FenetreBourseCalculee,
} from "@/server/bourse-fenetres";
import {
  creerNotification,
  listerCadresActifs,
  notifierPlusieurs,
} from "@/server/notifications";
import { calculerPointsCumules } from "@/server/points";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";

export type BourseEligibiliteAstreinte = {
  peutDonner: boolean;
  message?: string;
  dureeFenetreHeures?: number;
  palier?: string;
  offreOuverteId?: string;
};

export type OffreBourseItem = {
  id: string;
  astreinteId: string;
  date: string;
  ligneNom: string;
  typeCreneau: TypeCreneau;
  proposantNom: string;
  dateOuverture: string;
  dateFermeture: string;
  candidatureEnvoyee: boolean;
};

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatIadeNom(iade: { prenom: string; nom: string }): string {
  return `${iade.prenom} ${iade.nom}`;
}

function tirageAuSort<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function evaluerEligibiliteDonBourse(
  maintenant: Date,
  dateAstreinte: Date,
  options?: { offreOuverteId?: string },
): BourseEligibiliteAstreinte {
  const fenetre = calculerFenetreBourse(maintenant, dateAstreinte);

  if (!fenetre.ouverte) {
    return {
      peutDonner: false,
      message: fenetre.message,
      palier: fenetre.palier,
    };
  }

  if (options?.offreOuverteId) {
    return {
      peutDonner: false,
      message: "Une offre est déjà ouverte pour cette astreinte.",
      offreOuverteId: options.offreOuverteId,
      dureeFenetreHeures: fenetre.dureeHeures,
      palier: fenetre.palier,
    };
  }

  return {
    peutDonner: true,
    dureeFenetreHeures: fenetre.dureeHeures,
    palier: fenetre.palier,
  };
}

async function notifierAttributionBourse(input: {
  repreneur: { id: string; email: string; prenom: string; nom: string };
  donneur: { id: string; email: string; prenom: string; nom: string };
  astreinte: {
    date: Date;
    ligneNom: string;
    typeCreneau: TypeCreneau;
  };
}): Promise<void> {
  const dateLabel = formatDateFr(normalizeUtcDay(input.astreinte.date));
  const creneauLabel =
    LIBELLES_TYPE_CRENEAU_ASTREINTE[input.astreinte.typeCreneau];
  const resume = `${input.astreinte.ligneNom} — ${dateLabel} (${creneauLabel})`;

  const cadres = await listerCadresActifs();

  await notifierPlusieurs([
    {
      utilisateurId: input.repreneur.id,
      type: "BOURSE_ATTRIBUTION_REPRENEUR",
      message: `Vous avez repris l'astreinte : ${resume}.`,
      email: {
        to: input.repreneur.email,
        subject: "Nouvelle affectation (bourse aux astreintes)",
        body: `Bonjour ${input.repreneur.prenom},\n\nVous avez été attribué(e) à l'astreinte suivante : ${resume}.\n\nCordialement,\nAstreintes IADE`,
      },
    },
    {
      utilisateurId: input.donneur.id,
      type: "BOURSE_ATTRIBUTION_DONNEUR",
      message: `Votre astreinte a été reprise : ${resume}.`,
      email: {
        to: input.donneur.email,
        subject: "Confirmation — votre astreinte a été reprise",
        body: `Bonjour ${input.donneur.prenom},\n\nVotre astreinte du ${dateLabel} (${input.astreinte.ligneNom}) a été reprise via la bourse aux astreintes.\n\nCordialement,\nAstreintes IADE`,
      },
    },
    ...cadres.map((cadre) => ({
      utilisateurId: cadre.id,
      type: "BOURSE_ATTRIBUTION_CADRE",
      message: `Bourse clôturée — ${formatIadeNom(input.repreneur)} reprend ${resume}.`,
      email: {
        to: cadre.email,
        subject: "Information — attribution bourse aux astreintes",
        body: `Bonjour ${cadre.prenom},\n\n${formatIadeNom(input.repreneur)} a repris l'astreinte de ${formatIadeNom(input.donneur)} : ${resume}.\n\nCordialement,\nAstreintes IADE`,
      },
    })),
  ]);
}

async function notifierSansCandidatBourse(input: {
  donneur: { id: string; email: string; prenom: string; nom: string };
  astreinte: {
    date: Date;
    ligneNom: string;
    typeCreneau: TypeCreneau;
  };
}): Promise<void> {
  const dateLabel = formatDateFr(normalizeUtcDay(input.astreinte.date));
  const creneauLabel =
    LIBELLES_TYPE_CRENEAU_ASTREINTE[input.astreinte.typeCreneau];
  const resume = `${input.astreinte.ligneNom} — ${dateLabel} (${creneauLabel})`;

  const cadres = await listerCadresActifs();
  if (cadres.length === 0) {
    throw new Error(
      "Aucun cadre actif : impossible d'envoyer l'alerte bourse sans candidat.",
    );
  }

  await notifierPlusieurs(
    cadres.map((cadre) => ({
      utilisateurId: cadre.id,
      type: "BOURSE_SANS_CANDIDAT",
      message: `Bourse sans candidat — ${formatIadeNom(input.donneur)} / ${resume}. L'astreinte reste au planning initial.`,
      email: {
        to: cadre.email,
        subject: "Alerte — bourse aux astreintes sans candidat",
        body: `Bonjour ${cadre.prenom},\n\nLa bourse pour l'astreinte de ${formatIadeNom(input.donneur)} (${resume}) s'est clôturée sans candidat. L'astreinte reste au planning initial.\n\nCordialement,\nAstreintes IADE`,
      },
    })),
  );
}

async function selectionnerRepreneur(
  candidatures: Array<{ iadeId: string }>,
  annee: number,
): Promise<string> {
  const pointsEntries = await Promise.all(
    candidatures.map(async (candidature) => ({
      iadeId: candidature.iadeId,
      points: await calculerPointsCumules(candidature.iadeId, annee),
    })),
  );

  const minPoints = Math.min(...pointsEntries.map((entry) => entry.points));
  const exAequo = pointsEntries
    .filter((entry) => entry.points === minPoints)
    .map((entry) => entry.iadeId);

  return exAequo.length === 1 ? exAequo[0]! : tirageAuSort(exAequo);
}

export async function traiterOffresBourseExpirees(
  maintenant: Date = new Date(),
): Promise<{ traitees: number }> {
  const offres = await prisma.offreAstreinte.findMany({
    where: {
      statut: StatutOffreAstreinte.OUVERTE,
      dateFermeture: { lte: maintenant },
    },
    include: {
      astreinte: {
        include: {
          ligne: { select: { nom: true } },
          iade: {
            select: { id: true, email: true, prenom: true, nom: true },
          },
        },
      },
      proposant: {
        select: { id: true, email: true, prenom: true, nom: true },
      },
      candidatures: { select: { iadeId: true } },
    },
  });

  for (const offre of offres) {
    if (offre.candidatures.length === 0) {
      await prisma.offreAstreinte.update({
        where: { id: offre.id },
        data: { statut: StatutOffreAstreinte.SANS_CANDIDAT },
      });
      await notifierSansCandidatBourse({
        donneur: offre.proposant,
        astreinte: {
          date: offre.astreinte.date,
          ligneNom: offre.astreinte.ligne.nom,
          typeCreneau: offre.astreinte.typeCreneau,
        },
      });
      continue;
    }

    const annee = normalizeUtcDay(offre.astreinte.date).getUTCFullYear();
    const repreneurId = await selectionnerRepreneur(
      offre.candidatures,
      annee,
    );

    const repreneur = await prisma.utilisateur.findUniqueOrThrow({
      where: { id: repreneurId },
      select: { id: true, email: true, prenom: true, nom: true },
    });

    await prisma.$transaction([
      prisma.astreinte.update({
        where: { id: offre.astreinteId },
        data: { iadeId: repreneurId },
      }),
      prisma.offreAstreinte.update({
        where: { id: offre.id },
        data: { statut: StatutOffreAstreinte.ATTRIBUEE },
      }),
    ]);

    await notifierAttributionBourse({
      repreneur,
      donneur: offre.proposant,
      astreinte: {
        date: offre.astreinte.date,
        ligneNom: offre.astreinte.ligne.nom,
        typeCreneau: offre.astreinte.typeCreneau,
      },
    });
  }

  return { traitees: offres.length };
}

export async function creerOffreBourse(
  astreinteId: string,
  proposantId: string,
): Promise<
  | { offre: { id: string; dateFermeture: Date; dureeFenetreHeures: number } }
  | { error: string }
> {
  const maintenant = new Date();

  const astreinte = await prisma.astreinte.findUnique({
    where: { id: astreinteId },
    include: {
      ligne: { select: { nom: true } },
      offresAstreinte: {
        where: { statut: StatutOffreAstreinte.OUVERTE },
        select: { id: true },
      },
    },
  });

  if (!astreinte || astreinte.statut === StatutAstreinte.ANNULEE) {
    return { error: "Astreinte introuvable." };
  }

  if (astreinte.iadeId !== proposantId) {
    return { error: "Vous n'êtes pas l'IADE affecté à cette astreinte." };
  }

  if (astreinte.offresAstreinte.length > 0) {
    return { error: "Une offre est déjà ouverte pour cette astreinte." };
  }

  const fenetre = calculerFenetreBourse(maintenant, astreinte.date);
  if (!fenetre.ouverte) {
    return { error: fenetre.message };
  }

  const dateFermeture = calculerDateFermetureOffre(
    maintenant,
    astreinte.date,
    fenetre,
  );

  const offre = await prisma.offreAstreinte.create({
    data: {
      astreinteId,
      proposantId,
      dateOuverture: maintenant,
      dateFermeture,
      statut: StatutOffreAstreinte.OUVERTE,
    },
  });

  return {
    offre: {
      id: offre.id,
      dateFermeture: offre.dateFermeture,
      dureeFenetreHeures: fenetre.dureeHeures,
    },
  };
}

export async function postulerOffreBourse(
  offreId: string,
  iadeId: string,
): Promise<{ success: true } | { error: string }> {
  await traiterOffresBourseExpirees();

  const offre = await prisma.offreAstreinte.findUnique({
    where: { id: offreId },
    include: {
      astreinte: true,
      candidatures: { where: { iadeId }, select: { id: true } },
    },
  });

  if (!offre || offre.statut !== StatutOffreAstreinte.OUVERTE) {
    return { error: "Offre introuvable ou déjà clôturée." };
  }

  if (offre.proposantId === iadeId) {
    return { error: "Vous ne pouvez pas postuler à votre propre offre." };
  }

  if (offre.candidatures.length > 0) {
    return { error: "Vous avez déjà postulé à cette offre." };
  }

  const eligible = await isIadeEligiblePourCreneau(
    iadeId,
    offre.astreinte.ligneId,
    offre.astreinte.date,
    offre.astreinte.typeCreneau,
  );

  if (!eligible) {
    return {
      error:
        "Vous devez être qualifié et disponible sur cette ligne et ce créneau.",
    };
  }

  await prisma.candidature.create({
    data: {
      offreId,
      iadeId,
    },
  });

  return { success: true };
}

export async function getOffresBoursePourIade(
  iadeId: string,
): Promise<OffreBourseItem[]> {
  await traiterOffresBourseExpirees();

  const offres = await prisma.offreAstreinte.findMany({
    where: {
      statut: StatutOffreAstreinte.OUVERTE,
      proposantId: { not: iadeId },
      astreinte: {
        statut: { not: StatutAstreinte.ANNULEE },
      },
    },
    include: {
      astreinte: {
        include: {
          ligne: { select: { nom: true } },
        },
      },
      proposant: { select: { prenom: true, nom: true } },
      candidatures: {
        where: { iadeId },
        select: { id: true },
      },
    },
    orderBy: { dateFermeture: "asc" },
  });

  const items: OffreBourseItem[] = [];

  for (const offre of offres) {
    const eligible = await isIadeEligiblePourCreneau(
      iadeId,
      offre.astreinte.ligneId,
      offre.astreinte.date,
      offre.astreinte.typeCreneau,
    );

    if (!eligible) {
      continue;
    }

    items.push({
      id: offre.id,
      astreinteId: offre.astreinteId,
      date: offre.astreinte.date.toISOString().slice(0, 10),
      ligneNom: offre.astreinte.ligne.nom,
      typeCreneau: offre.astreinte.typeCreneau,
      proposantNom: formatIadeNom(offre.proposant),
      dateOuverture: offre.dateOuverture.toISOString(),
      dateFermeture: offre.dateFermeture.toISOString(),
      candidatureEnvoyee: offre.candidatures.length > 0,
    });
  }

  return items;
}

export async function enrichirAstreintesBourseEligibilite<
  T extends { id: string; date: string },
>(
  astreintes: T[],
  offresOuvertesParAstreinte: Map<string, string>,
): Promise<Array<T & { bourse: BourseEligibiliteAstreinte }>> {
  const maintenant = new Date();

  return astreintes.map((astreinte) => {
    const [year, month, day] = astreinte.date.split("-").map(Number);
    const dateAstreinte = new Date(Date.UTC(year, month - 1, day));

    return {
      ...astreinte,
      bourse: evaluerEligibiliteDonBourse(maintenant, dateAstreinte, {
        offreOuverteId: offresOuvertesParAstreinte.get(astreinte.id),
      }),
    };
  });
}

export async function getOffresOuvertesParAstreinte(
  astreinteIds: string[],
): Promise<Map<string, string>> {
  if (astreinteIds.length === 0) {
    return new Map();
  }

  const offres = await prisma.offreAstreinte.findMany({
    where: {
      astreinteId: { in: astreinteIds },
      statut: StatutOffreAstreinte.OUVERTE,
    },
    select: { id: true, astreinteId: true },
  });

  return new Map(offres.map((offre) => [offre.astreinteId, offre.id]));
}

export { MESSAGE_BOURSE_FERMEE, calculerFenetreBourse };
