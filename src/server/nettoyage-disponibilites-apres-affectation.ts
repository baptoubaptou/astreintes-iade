import {
  TypeActionAudit,
  TypePreferenceContinuite,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateIso } from "@/server/campagnes";
import { cleanupPreferencesAfterDisponibiliteDelete } from "@/server/disponibilites";
import { LIBELLES_TYPE_CRENEAU_ASTREINTE } from "@/server/astreinte-creneaux";
import { journaliser } from "@/server/audit";
import type { JournaliserParams } from "@/server/audit";

type AstreintePourNettoyage = {
  iadeId: string;
  date: Date;
  typeCreneau: import("@prisma/client").TypeCreneau;
};

function formatDateFrCourt(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export type NettoyageDisponibilitesResult = {
  disponibilitesSupprimees: number;
  preferencesSupprimees: number;
};

export async function nettoyerDisponibilitesApresAffectationLigne(
  params: {
    ligneOrigineId: string;
    ligneOrigineNom: string;
    astreintes: AstreintePourNettoyage[];
    motifJournal: string;
    detailJournal?: Record<string, unknown>;
  },
  tx: Prisma.TransactionClient = prisma,
): Promise<{
  result: NettoyageDisponibilitesResult;
  journals: JournaliserParams[];
}> {
  const pendingJournals: JournaliserParams[] = [];
  let disponibilitesSupprimees = 0;
  let preferencesSupprimees = 0;

  for (const astreinte of params.astreintes) {
    const autresLignes = await tx.qualification.findMany({
      where: {
        iadeId: astreinte.iadeId,
        ligneId: { not: params.ligneOrigineId },
        ligne: { actif: true },
      },
      include: {
        ligne: { select: { id: true, nom: true } },
      },
    });

    if (autresLignes.length === 0) {
      continue;
    }

    const disponibilites = await tx.disponibilite.findMany({
      where: {
        iadeId: astreinte.iadeId,
        date: astreinte.date,
        typeCreneau: astreinte.typeCreneau,
        ligneId: { in: autresLignes.map((entry) => entry.ligneId) },
      },
      include: {
        ligne: { select: { nom: true } },
      },
    });

    for (const disponibilite of disponibilites) {
      await tx.disponibilite.delete({ where: { id: disponibilite.id } });
      disponibilitesSupprimees += 1;

      const creneauLabel =
        LIBELLES_TYPE_CRENEAU_ASTREINTE[astreinte.typeCreneau];
      const dateLabel = formatDateFrCourt(astreinte.date);

      pendingJournals.push({
        typeAction: TypeActionAudit.DISPONIBILITE_SUPPRIMEE_AUTO,
        iadeConcerneId: astreinte.iadeId,
        resume: `Disponibilité retirée sur ${disponibilite.ligne.nom} (${creneauLabel}, ${dateLabel}) ${params.motifJournal}.`,
        detail: {
          ligneOrigineId: params.ligneOrigineId,
          ligneOrigineNom: params.ligneOrigineNom,
          ligneImpacteeId: disponibilite.ligneId,
          ligneImpacteeNom: disponibilite.ligne.nom,
          date: formatDateIso(astreinte.date),
          typeCreneau: astreinte.typeCreneau,
          disponibiliteId: disponibilite.id,
          ...params.detailJournal,
        },
      });

      const prefsSupprimees = await cleanupPreferencesAfterDisponibiliteDelete(
        astreinte.iadeId,
        disponibilite.ligneId,
        disponibilite.date,
        disponibilite.typeCreneau,
        tx,
      );

      for (const preference of prefsSupprimees) {
        preferencesSupprimees += 1;
        const prefLabel =
          preference.type === TypePreferenceContinuite.WEEKEND_48H
            ? "week-end complet (48h)"
            : "24h";

        pendingJournals.push({
          typeAction: TypeActionAudit.PREFERENCE_SUPPRIMEE,
          iadeConcerneId: astreinte.iadeId,
          resume: `Préférence ${prefLabel} retirée sur ${disponibilite.ligne.nom} (${formatDateFrCourt(preference.dateDebut)}) ${params.motifJournal}.`,
          detail: {
            ligneOrigineId: params.ligneOrigineId,
            ligneOrigineNom: params.ligneOrigineNom,
            ligneImpacteeId: preference.ligneId,
            preferenceId: preference.id,
            type: preference.type,
            dateDebut: formatDateIso(preference.dateDebut),
            ...params.detailJournal,
          },
        });
      }
    }
  }

  return {
    result: { disponibilitesSupprimees, preferencesSupprimees },
    journals: pendingJournals,
  };
}
