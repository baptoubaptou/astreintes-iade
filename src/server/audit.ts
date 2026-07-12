import { Prisma, TypeActionAudit } from "@prisma/client";
import { prisma } from "@/lib/db";

export type JournaliserParams = {
  acteurId?: string;
  typeAction: TypeActionAudit;
  iadeConcerneId?: string;
  resume: string;
  detail?: object;
};

export async function journaliser(params: JournaliserParams): Promise<void> {
  await prisma.journalAudit.create({
    data: {
      acteurId: params.acteurId ?? null,
      typeAction: params.typeAction,
      iadeConcerneId: params.iadeConcerneId ?? null,
      resume: params.resume,
      detail:
        params.detail === undefined
          ? undefined
          : (params.detail as Prisma.InputJsonValue),
    },
  });
}
