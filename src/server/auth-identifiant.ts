import type { Utilisateur } from "@prisma/client";
import { prisma } from "@/lib/db";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseIdentifiant(
  identifiant: string,
): { type: "email"; value: string } | { type: "matricule"; value: string } {
  const trimmed = identifiant.trim();

  if (trimmed.includes("@")) {
    return { type: "email", value: normalizeEmail(trimmed) };
  }

  return { type: "matricule", value: trimmed };
}

export async function findUtilisateurByIdentifiant(
  identifiant: string,
): Promise<Utilisateur | null> {
  const parsed = parseIdentifiant(identifiant);

  if (parsed.type === "email") {
    return prisma.utilisateur.findUnique({
      where: { email: parsed.value },
    });
  }

  return prisma.utilisateur.findUnique({
    where: { matricule: parsed.value },
  });
}
