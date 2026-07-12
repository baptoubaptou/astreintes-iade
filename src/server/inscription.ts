import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  CODE_VALIDITE_MS,
  genererCodeVerification,
} from "@/lib/verification-code";
import {
  isValidEmail,
  normalizeEmail,
} from "@/server/auth-identifiant";
import { envoyerCodeVerificationEmail } from "@/server/auth-emails";
import {
  hasherMotDePasse,
  validateConfirmationMotDePasse,
  verifierMotDePasse,
} from "@/server/mot-de-passe";

export type InscriptionFormInput = {
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  motDePasse: string;
  confirmationMotDePasse: string;
  ligneIds: string[];
};

export type InscriptionState = {
  error?: string;
  field?: string;
  inscriptionId?: string;
  email?: string;
  success?: boolean;
};

function parseLigneIds(values: FormDataEntryValue[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseInscriptionFormData(
  formData: FormData,
): InscriptionFormInput | { error: string; field?: string } {
  const nom = getFormString(formData, "nom");
  const prenom = getFormString(formData, "prenom");
  const matricule = getFormString(formData, "matricule");
  const email = getFormString(formData, "email")
    ? normalizeEmail(getFormString(formData, "email"))
    : "";
  const motDePasse =
    typeof formData.get("motDePasse") === "string"
      ? (formData.get("motDePasse") as string)
      : "";
  const confirmationMotDePasse =
    typeof formData.get("confirmationMotDePasse") === "string"
      ? (formData.get("confirmationMotDePasse") as string)
      : "";
  const ligneIds = parseLigneIds(formData.getAll("ligneIds"));

  if (!nom) {
    return { error: "Le nom est requis.", field: "nom" };
  }

  if (!prenom) {
    return { error: "Le prénom est requis.", field: "prenom" };
  }

  if (!matricule) {
    return { error: "Le matricule est requis.", field: "matricule" };
  }

  if (!/^\d+$/.test(matricule)) {
    return {
      error: "Le matricule ne doit contenir que des chiffres.",
      field: "matricule",
    };
  }

  if (!email || !isValidEmail(email)) {
    return { error: "L'adresse e-mail est invalide.", field: "email" };
  }

  const motDePasseError = validateConfirmationMotDePasse(
    motDePasse,
    confirmationMotDePasse,
  );

  if (motDePasseError) {
    return { error: motDePasseError, field: "motDePasse" };
  }

  if (ligneIds.length === 0) {
    return {
      error: "Sélectionnez au moins une ligne d'astreinte.",
      field: "ligneIds",
    };
  }

  return {
    nom,
    prenom,
    matricule,
    email,
    motDePasse,
    confirmationMotDePasse,
    ligneIds,
  };
}

export async function demarrerInscription(
  input: InscriptionFormInput,
): Promise<InscriptionState> {
  const [emailExistant, matriculeExistant, lignesActives] = await Promise.all([
    prisma.utilisateur.findUnique({ where: { email: input.email } }),
    prisma.utilisateur.findUnique({ where: { matricule: input.matricule } }),
    prisma.ligneAstreinte.findMany({
      where: { actif: true },
      select: { id: true },
    }),
  ]);

  if (emailExistant) {
    return {
      error: "Cette adresse e-mail est déjà utilisée.",
      field: "email",
    };
  }

  if (matriculeExistant) {
    return {
      error: "Ce matricule est déjà utilisé.",
      field: "matricule",
    };
  }

  const lignesActivesIds = new Set(lignesActives.map((ligne) => ligne.id));
  const ligneIdsValides = input.ligneIds.filter((id) => lignesActivesIds.has(id));

  if (ligneIdsValides.length === 0) {
    return {
      error: "Sélectionnez au moins une ligne d'astreinte valide.",
      field: "ligneIds",
    };
  }

  const code = genererCodeVerification();
  const [motDePasseHash, codeHash] = await Promise.all([
    hasherMotDePasse(input.motDePasse),
    hasherMotDePasse(code),
  ]);

  await prisma.inscriptionEnAttente.deleteMany({
    where: {
      OR: [{ email: input.email }, { matricule: input.matricule }],
    },
  });

  const inscription = await prisma.inscriptionEnAttente.create({
    data: {
      nom: input.nom,
      prenom: input.prenom,
      matricule: input.matricule,
      email: input.email,
      motDePasseHash,
      ligneIds: JSON.stringify(ligneIdsValides),
      codeHash,
      expireLe: new Date(Date.now() + CODE_VALIDITE_MS),
    },
  });

  const emailResult = await envoyerCodeVerificationEmail({
    to: input.email,
    prenom: input.prenom,
    code,
    inscriptionId: inscription.id,
  });

  if (!emailResult.ok) {
    await prisma.inscriptionEnAttente.delete({ where: { id: inscription.id } });
    return {
      error: `Impossible d'envoyer l'e-mail de vérification : ${emailResult.error}`,
    };
  }

  return {
    success: true,
    inscriptionId: inscription.id,
    email: input.email,
  };
}

export async function finaliserInscription(input: {
  inscriptionId: string;
  code: string;
  motDePasse: string;
}): Promise<
  | { ok: true; email: string; motDePasse: string }
  | { ok: false; error: string; field?: string }
> {
  const code = input.code.trim();

  if (!/^\d{5}$/.test(code)) {
    return {
      ok: false,
      error: "Le code doit contenir exactement 5 chiffres.",
      field: "code",
    };
  }

  const inscription = await prisma.inscriptionEnAttente.findUnique({
    where: { id: input.inscriptionId },
  });

  if (!inscription) {
    return {
      ok: false,
      error: "Inscription introuvable. Recommencez le processus.",
    };
  }

  if (inscription.expireLe < new Date()) {
    await prisma.inscriptionEnAttente.delete({ where: { id: inscription.id } });
    return {
      ok: false,
      error: "Le code a expiré. Recommencez le processus d'inscription.",
    };
  }

  const codeValide = await verifierMotDePasse(code, inscription.codeHash);

  if (!codeValide) {
    return {
      ok: false,
      error: "Code de vérification incorrect.",
      field: "code",
    };
  }

  const motDePasseError = validateConfirmationMotDePasse(
    input.motDePasse,
    input.motDePasse,
  );

  if (motDePasseError) {
    return { ok: false, error: motDePasseError, field: "motDePasse" };
  }

  const motDePasseHash = await hasherMotDePasse(input.motDePasse);
  const ligneIds = JSON.parse(inscription.ligneIds) as string[];

  const [emailExistant, matriculeExistant] = await Promise.all([
    prisma.utilisateur.findUnique({ where: { email: inscription.email } }),
    prisma.utilisateur.findUnique({ where: { matricule: inscription.matricule } }),
  ]);

  if (emailExistant || matriculeExistant) {
    await prisma.inscriptionEnAttente.delete({ where: { id: inscription.id } });
    return {
      ok: false,
      error: "Un compte existe déjà avec cet e-mail ou ce matricule.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const utilisateur = await tx.utilisateur.create({
      data: {
        nom: inscription.nom,
        prenom: inscription.prenom,
        matricule: inscription.matricule,
        email: inscription.email,
        motDePasseHash,
        role: Role.IADE,
        actif: true,
      },
    });

    await tx.qualification.createMany({
      data: ligneIds.map((ligneId) => ({
        iadeId: utilisateur.id,
        ligneId,
      })),
    });

    await tx.inscriptionEnAttente.delete({ where: { id: inscription.id } });
  });

  return {
    ok: true,
    email: inscription.email,
    motDePasse: input.motDePasse,
  };
}
