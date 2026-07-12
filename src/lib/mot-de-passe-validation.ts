export function validateMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < 6) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }

  if (!/\d/.test(motDePasse)) {
    return "Le mot de passe doit contenir au moins un chiffre.";
  }

  return null;
}

export function validateConfirmationMotDePasse(
  motDePasse: string,
  confirmation: string,
): string | null {
  if (motDePasse !== confirmation) {
    return "Les mots de passe ne correspondent pas.";
  }

  return validateMotDePasse(motDePasse);
}

export function motsDePasseConcordent(
  motDePasse: string,
  confirmation: string,
): boolean {
  return motDePasse.length > 0 && motDePasse === confirmation;
}
