import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isValidEmail,
  normalizeEmail,
} from "@/server/auth-identifiant";
import { envoyerCodeChangementEmail } from "@/server/auth-emails";
import {
  CODE_VALIDITE_MS,
  genererCodeVerification,
} from "@/lib/verification-code";
import {
  hasherMotDePasse,
  validateConfirmationMotDePasse,
  verifierMotDePasse,
} from "@/server/mot-de-passe";

export type MonCompteProfil = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  role: Role;
  qualifications: string[];
};

export type MonCompteState = {
  error?: string;
  field?: string;
  success?: boolean;
  message?: string;
  demandeId?: string;
  nouvelEmail?: string;
};

export async function getMonCompteProfil(
  utilisateurId: string,
): Promise<MonCompteProfil | null> {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId, actif: true },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      email: true,
      role: true,
      qualifications: {
        select: {
          ligne: {
            select: { nom: true },
          },
        },
        orderBy: {
          ligne: { ordrePriorite: "asc" },
        },
      },
    },
  });

  if (!utilisateur) {
    return null;
  }

  return {
    id: utilisateur.id,
    nom: utilisateur.nom,
    prenom: utilisateur.prenom,
    matricule: utilisateur.matricule,
    email: utilisateur.email,
    role: utilisateur.role,
    qualifications: utilisateur.qualifications.map(
      (qualification) => qualification.ligne.nom,
    ),
  };
}

export async function changerMotDePasseMonCompte(
  utilisateurId: string,
  input: {
    motDePasseActuel: string;
    motDePasse: string;
    confirmationMotDePasse: string;
  },
): Promise<MonCompteState> {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId, actif: true },
  });

  if (!utilisateur) {
    return { error: "Compte introuvable." };
  }

  const motDePasseActuelValide = await verifierMotDePasse(
    input.motDePasseActuel,
    utilisateur.motDePasseHash,
  );

  if (!motDePasseActuelValide) {
    return {
      error: "Le mot de passe actuel est incorrect.",
      field: "motDePasseActuel",
    };
  }

  const motDePasseError = validateConfirmationMotDePasse(
    input.motDePasse,
    input.confirmationMotDePasse,
  );

  if (motDePasseError) {
    return { error: motDePasseError, field: "motDePasse" };
  }

  const motDePasseHash = await hasherMotDePasse(input.motDePasse);

  await prisma.utilisateur.update({
    where: { id: utilisateurId },
    data: { motDePasseHash },
  });

  return {
    success: true,
    message: "Mot de passe mis à jour.",
  };
}

export async function demarrerChangementEmail(
  utilisateurId: string,
  nouvelEmailBrut: string,
): Promise<MonCompteState> {
  const nouvelEmail = normalizeEmail(nouvelEmailBrut);

  if (!nouvelEmail || !isValidEmail(nouvelEmail)) {
    return {
      error: "L'adresse e-mail est invalide.",
      field: "nouvelEmail",
    };
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId, actif: true },
  });

  if (!utilisateur) {
    return { error: "Compte introuvable." };
  }

  if (nouvelEmail === utilisateur.email) {
    return {
      error: "Cette adresse e-mail est déjà celle de votre compte.",
      field: "nouvelEmail",
    };
  }

  const emailExistant = await prisma.utilisateur.findUnique({
    where: { email: nouvelEmail },
  });

  if (emailExistant) {
    return {
      error: "Cette adresse e-mail est déjà utilisée.",
      field: "nouvelEmail",
    };
  }

  const code = genererCodeVerification();
  const codeHash = await hasherMotDePasse(code);

  await prisma.changementEmailEnAttente.deleteMany({
    where: { utilisateurId },
  });

  const demande = await prisma.changementEmailEnAttente.create({
    data: {
      utilisateurId,
      nouvelEmail,
      codeHash,
      expireLe: new Date(Date.now() + CODE_VALIDITE_MS),
    },
  });

  const emailResult = await envoyerCodeChangementEmail({
    to: nouvelEmail,
    prenom: utilisateur.prenom,
    code,
    demandeId: demande.id,
  });

  if (!emailResult.ok) {
    await prisma.changementEmailEnAttente.delete({ where: { id: demande.id } });
    return {
      error: `Impossible d'envoyer l'e-mail de vérification : ${emailResult.error}`,
    };
  }

  return {
    success: true,
    demandeId: demande.id,
    nouvelEmail,
    message: "Un code de vérification a été envoyé à la nouvelle adresse.",
  };
}

export async function finaliserChangementEmail(
  utilisateurId: string,
  input: { demandeId: string; code: string },
): Promise<MonCompteState> {
  const code = input.code.trim();

  if (!/^\d{5}$/.test(code)) {
    return {
      error: "Le code doit contenir exactement 5 chiffres.",
      field: "code",
    };
  }

  const demande = await prisma.changementEmailEnAttente.findUnique({
    where: { id: input.demandeId },
  });

  if (!demande || demande.utilisateurId !== utilisateurId) {
    return {
      error: "Demande de changement introuvable. Recommencez le processus.",
    };
  }

  if (demande.expireLe < new Date()) {
    await prisma.changementEmailEnAttente.delete({ where: { id: demande.id } });
    return {
      error: "Le code a expiré. Recommencez le changement d'e-mail.",
    };
  }

  const codeValide = await verifierMotDePasse(code, demande.codeHash);

  if (!codeValide) {
    return {
      error: "Code de vérification incorrect.",
      field: "code",
    };
  }

  const emailExistant = await prisma.utilisateur.findUnique({
    where: { email: demande.nouvelEmail },
  });

  if (emailExistant && emailExistant.id !== utilisateurId) {
    await prisma.changementEmailEnAttente.delete({ where: { id: demande.id } });
    return {
      error: "Cette adresse e-mail est déjà utilisée.",
    };
  }

  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { email: demande.nouvelEmail },
    }),
    prisma.changementEmailEnAttente.delete({ where: { id: demande.id } }),
  ]);

  return {
    success: true,
    message: "Adresse e-mail mise à jour.",
    nouvelEmail: demande.nouvelEmail,
  };
}
