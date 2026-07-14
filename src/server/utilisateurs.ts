import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

const DEFAULT_MOT_DE_PASSE = "password123";
const BCRYPT_ROUNDS = 10;

export type UtilisateurListItem = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  role: Role;
  actif: boolean;
};

export type UpdateUtilisateurInput = {
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  role: Role;
};

export type UtilisateurValidationError = {
  error: string;
  field?: string;
};

const utilisateurSelect = {
  id: true,
  nom: true,
  prenom: true,
  matricule: true,
  email: true,
  role: true,
  actif: true,
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUpdateUtilisateurInput(
  input: Record<string, unknown>,
): UpdateUtilisateurInput | UtilisateurValidationError {
  const nom = typeof input.nom === "string" ? input.nom.trim() : "";
  const prenom = typeof input.prenom === "string" ? input.prenom.trim() : "";
  const matricule =
    typeof input.matricule === "string" ? input.matricule.trim() : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";

  if (!nom) {
    return { error: "Le nom est requis.", field: "nom" };
  }

  if (!prenom) {
    return { error: "Le prénom est requis.", field: "prenom" };
  }

  if (!matricule) {
    return { error: "Le matricule est requis.", field: "matricule" };
  }

  if (!email || !isValidEmail(email)) {
    return { error: "L'adresse e-mail est invalide.", field: "email" };
  }

  const role =
    input.role === Role.CADRE || input.role === "CADRE"
      ? Role.CADRE
      : input.role === Role.IADE || input.role === "IADE"
        ? Role.IADE
        : null;

  if (!role) {
    return { error: "Le rôle est invalide.", field: "role" };
  }

  return { nom, prenom, matricule, email, role };
}

export function validateCreateUtilisateurInput(
  input: Record<string, unknown>,
): UpdateUtilisateurInput | UtilisateurValidationError {
  const base = validateUpdateUtilisateurInput({
    ...input,
    role:
      input.role === Role.CADRE || input.role === "CADRE"
        ? Role.CADRE
        : Role.IADE,
  });

  return base;
}

export async function createUtilisateur(
  input: UpdateUtilisateurInput,
  role: Role = Role.IADE,
): Promise<UtilisateurListItem> {
  const motDePasseHash = await bcrypt.hash(DEFAULT_MOT_DE_PASSE, BCRYPT_ROUNDS);

  return prisma.utilisateur.create({
    data: {
      ...input,
      role,
      motDePasseHash,
    },
    select: utilisateurSelect,
  });
}

export async function listUtilisateurs(): Promise<UtilisateurListItem[]> {
  return prisma.utilisateur.findMany({
    select: utilisateurSelect,
    orderBy: [{ role: "asc" }, { nom: "asc" }, { prenom: "asc" }],
  });
}

export async function getUtilisateurById(
  id: string,
): Promise<UtilisateurListItem | null> {
  return prisma.utilisateur.findUnique({
    where: { id },
    select: utilisateurSelect,
  });
}

export async function updateUtilisateur(
  id: string,
  input: UpdateUtilisateurInput,
): Promise<UtilisateurListItem | { error: string }> {
  const existing = await getUtilisateurById(id);

  if (!existing) {
    return { error: "Utilisateur introuvable." };
  }

  if (existing.role === Role.CADRE && input.role === Role.IADE) {
    const autresCadres = await prisma.utilisateur.count({
      where: { role: Role.CADRE, id: { not: id }, actif: true },
    });

    if (autresCadres === 0) {
      return {
        error: "Impossible de rétrograder le dernier compte cadre actif.",
      };
    }
  }

  const utilisateur = await prisma.utilisateur.update({
    where: { id },
    data: input,
    select: utilisateurSelect,
  });

  return utilisateur;
}

export async function deleteUtilisateur(
  id: string,
  acteurId: string,
): Promise<{ success: true } | { error: string }> {
  if (id === acteurId) {
    return {
      error: "Vous ne pouvez pas supprimer votre propre compte.",
    };
  }

  const utilisateur = await getUtilisateurById(id);

  if (!utilisateur) {
    return { error: "Utilisateur introuvable." };
  }

  if (utilisateur.role === Role.CADRE) {
    const autresCadres = await prisma.utilisateur.count({
      where: { role: Role.CADRE, id: { not: id }, actif: true },
    });

    if (autresCadres === 0) {
      return {
        error: "Impossible de supprimer le dernier compte cadre actif.",
      };
    }
  }

  await prisma.utilisateur.delete({ where: { id } });

  return { success: true };
}

export function mapUtilisateurPrismaError(
  error: unknown,
): { error: string; status: number } | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(", ")
      : String(error.meta?.target ?? "");

    if (target.includes("email")) {
      return { error: "Cette adresse e-mail est déjà utilisée.", status: 409 };
    }

    if (target.includes("matricule")) {
      return { error: "Ce matricule est déjà utilisé.", status: 409 };
    }

    return { error: "Conflit avec un enregistrement existant.", status: 409 };
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return { error: "Utilisateur introuvable.", status: 404 };
  }

  return null;
}
