import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { findUtilisateurByIdentifiant } from "@/server/auth-identifiant";
import { verifierMotDePasse } from "@/server/mot-de-passe";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifiant: { label: "Email ou matricule", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const identifiant =
          typeof credentials?.identifiant === "string"
            ? credentials.identifiant
            : null;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : null;

        if (!identifiant || !password) {
          return null;
        }

        const utilisateur = await findUtilisateurByIdentifiant(identifiant);

        if (!utilisateur || !utilisateur.actif) {
          return null;
        }

        const motDePasseValide = await verifierMotDePasse(
          password,
          utilisateur.motDePasseHash,
        );

        if (!motDePasseValide) {
          return null;
        }

        return {
          id: utilisateur.id,
          email: utilisateur.email,
          name: `${utilisateur.prenom} ${utilisateur.nom}`,
          role: utilisateur.role,
        };
      },
    }),
  ],
});
