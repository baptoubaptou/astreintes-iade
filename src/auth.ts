import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : null;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : null;

        if (!email || !password) {
          return null;
        }

        const utilisateur = await prisma.utilisateur.findUnique({
          where: { email },
        });

        if (!utilisateur || !utilisateur.actif) {
          return null;
        }

        const motDePasseValide = await bcrypt.compare(
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
