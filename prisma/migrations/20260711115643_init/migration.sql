-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LigneAstreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "poids" INTEGER NOT NULL,
    "ordrePriorite" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    CONSTRAINT "Qualification_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Qualification_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Astreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "ligneId" TEXT NOT NULL,
    "iadeId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "pointsAttribues" INTEGER NOT NULL,
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DemandeEchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astreinteId" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "remplacantId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateTraitement" DATETIME,
    CONSTRAINT "DemandeEchange_astreinteId_fkey" FOREIGN KEY ("astreinteId") REFERENCES "Astreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DemandeEchange_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DemandeEchange_remplacantId_fkey" FOREIGN KEY ("remplacantId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OffreAstreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astreinteId" TEXT NOT NULL,
    "proposantId" TEXT NOT NULL,
    "dateOuverture" DATETIME NOT NULL,
    "dateFermeture" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'OUVERTE',
    CONSTRAINT "OffreAstreinte_astreinteId_fkey" FOREIGN KEY ("astreinteId") REFERENCES "Astreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OffreAstreinte_proposantId_fkey" FOREIGN KEY ("proposantId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Candidature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offreId" TEXT NOT NULL,
    "iadeId" TEXT NOT NULL,
    "dateCandidature" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candidature_offreId_fkey" FOREIGN KEY ("offreId") REFERENCES "OffreAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Candidature_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Indisponibilite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL,
    "dateFin" DATETIME NOT NULL,
    "motif" TEXT,
    CONSTRAINT "Indisponibilite_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "utilisateurId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LigneAstreinte_nom_key" ON "LigneAstreinte"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_iadeId_ligneId_key" ON "Qualification"("iadeId", "ligneId");

-- CreateIndex
CREATE UNIQUE INDEX "Astreinte_date_ligneId_key" ON "Astreinte"("date", "ligneId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidature_offreId_iadeId_key" ON "Candidature"("offreId", "iadeId");
