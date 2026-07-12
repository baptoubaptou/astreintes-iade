import bcrypt from "bcrypt";
import {
  validateConfirmationMotDePasse,
  validateMotDePasse,
} from "@/lib/mot-de-passe-validation";

export const BCRYPT_ROUNDS = 10;

export { validateConfirmationMotDePasse, validateMotDePasse };

export async function hasherMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, BCRYPT_ROUNDS);
}

export async function verifierMotDePasse(
  motDePasse: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}
