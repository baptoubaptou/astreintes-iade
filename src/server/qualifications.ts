import { Role, StatutAstreinte } from "@prisma/client";
import { prisma } from "@/lib/db";

export type QualificationMatrixData = {
  iades: Array<{ id: string; nom: string; prenom: string }>;
  lignes: Array<{ id: string; nom: string }>;
  qualifications: Array<{ id: string; iadeId: string; ligneId: string }>;
};

export type QualificationInput = {
  iadeId: string;
  ligneId: string;
};

export type QualificationValidationError = {
  error: string;
};

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function validateQualificationInput(
  input: Record<string, unknown>,
): QualificationInput | QualificationValidationError {
  const iadeId = typeof input.iadeId === "string" ? input.iadeId.trim() : "";
  const ligneId = typeof input.ligneId === "string" ? input.ligneId.trim() : "";

  if (!iadeId || !ligneId) {
    return { error: "iadeId et ligneId sont requis." };
  }

  return { iadeId, ligneId };
}

export async function getQualificationMatrix(): Promise<QualificationMatrixData> {
  const [iades, lignes, qualifications] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: Role.IADE, actif: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: { id: true, nom: true, prenom: true },
    }),
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      orderBy: [{ ordrePriorite: "asc" }, { nom: "asc" }],
      select: { id: true, nom: true },
    }),
    prisma.qualification.findMany({
      where: {
        iade: { role: Role.IADE, actif: true },
        ligne: { actif: true },
      },
      select: { id: true, iadeId: true, ligneId: true },
    }),
  ]);

  return { iades, lignes, qualifications };
}

export async function countFutureAstreintesForQualification(
  iadeId: string,
  ligneId: string,
): Promise<number> {
  return prisma.astreinte.count({
    where: {
      iadeId,
      ligneId,
      statut: StatutAstreinte.PLANIFIEE,
      date: { gte: startOfToday() },
    },
  });
}

export async function getUncheckWarning(
  iadeId: string,
  ligneId: string,
): Promise<{ count: number; message: string | null }> {
  const count = await countFutureAstreintesForQualification(iadeId, ligneId);

  if (count === 0) {
    return { count, message: null };
  }

  return {
    count,
    message: `Attention : cet IADE a ${count} astreinte(s) future(s) planifiée(s) sur cette ligne. Retirer la qualification peut impacter la planification.`,
  };
}

async function assertValidIadeAndLigne(
  iadeId: string,
  ligneId: string,
): Promise<
  | { iade: { id: string }; ligne: { id: string } }
  | { error: string }
> {
  const [iade, ligne] = await Promise.all([
    prisma.utilisateur.findFirst({
      where: { id: iadeId, role: Role.IADE, actif: true },
    }),
    prisma.ligneAstreinte.findFirst({
      where: { id: ligneId, actif: true },
    }),
  ]);

  if (!iade) {
    return { error: "IADE introuvable ou inactif." } as const;
  }

  if (!ligne) {
    return { error: "Ligne introuvable ou inactive." } as const;
  }

  return { iade, ligne } as const;
}

export async function createQualification(
  input: QualificationInput,
): Promise<
  { qualification: { id: string; iadeId: string; ligneId: string } } | {
      error: string;
    }
> {
  const validation = await assertValidIadeAndLigne(input.iadeId, input.ligneId);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const qualification = await prisma.qualification.create({
    data: {
      iadeId: input.iadeId,
      ligneId: input.ligneId,
    },
    select: { id: true, iadeId: true, ligneId: true },
  });

  return { qualification };
}

export async function deleteQualification(
  input: QualificationInput,
): Promise<{ success: true } | { error: string }> {
  const existing = await prisma.qualification.findUnique({
    where: {
      iadeId_ligneId: {
        iadeId: input.iadeId,
        ligneId: input.ligneId,
      },
    },
  });

  if (!existing) {
    return { error: "Qualification introuvable." } as const;
  }

  await prisma.qualification.delete({
    where: { id: existing.id },
  });

  return { success: true };
}
