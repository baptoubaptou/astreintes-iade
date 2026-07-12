-- CreateTable
CREATE TABLE "InscriptionEnAttente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "ligneIds" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expireLe" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TokenReinitialisationMotDePasse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "utilisateurId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expireLe" DATETIME NOT NULL,
    "utilise" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenReinitialisationMotDePasse_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InscriptionEnAttente_email_idx" ON "InscriptionEnAttente"("email");

-- CreateIndex
CREATE INDEX "InscriptionEnAttente_matricule_idx" ON "InscriptionEnAttente"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "TokenReinitialisationMotDePasse_tokenHash_key" ON "TokenReinitialisationMotDePasse"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenReinitialisationMotDePasse_utilisateurId_idx" ON "TokenReinitialisationMotDePasse"("utilisateurId");
