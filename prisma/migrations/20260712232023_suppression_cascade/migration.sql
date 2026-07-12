-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Astreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "ligneId" TEXT NOT NULL,
    "typeCreneau" TEXT NOT NULL DEFAULT 'NUIT_SEMAINE',
    "iadeId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "pointsAttribues" INTEGER NOT NULL,
    "publie" BOOLEAN NOT NULL DEFAULT false,
    "datePublication" DATETIME,
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Astreinte" ("date", "datePublication", "iadeId", "id", "ligneId", "pointsAttribues", "publie", "statut", "typeCreneau") SELECT "date", "datePublication", "iadeId", "id", "ligneId", "pointsAttribues", "publie", "statut", "typeCreneau" FROM "Astreinte";
DROP TABLE "Astreinte";
ALTER TABLE "new_Astreinte" RENAME TO "Astreinte";
CREATE UNIQUE INDEX "Astreinte_date_ligneId_typeCreneau_key" ON "Astreinte"("date", "ligneId", "typeCreneau");
CREATE TABLE "new_Candidature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offreId" TEXT NOT NULL,
    "iadeId" TEXT NOT NULL,
    "dateCandidature" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candidature_offreId_fkey" FOREIGN KEY ("offreId") REFERENCES "OffreAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Candidature_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Candidature" ("dateCandidature", "iadeId", "id", "offreId") SELECT "dateCandidature", "iadeId", "id", "offreId" FROM "Candidature";
DROP TABLE "Candidature";
ALTER TABLE "new_Candidature" RENAME TO "Candidature";
CREATE UNIQUE INDEX "Candidature_offreId_iadeId_key" ON "Candidature"("offreId", "iadeId");
CREATE TABLE "new_DemandeEchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astreinteId" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "remplacantId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateTraitement" DATETIME,
    CONSTRAINT "DemandeEchange_astreinteId_fkey" FOREIGN KEY ("astreinteId") REFERENCES "Astreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemandeEchange_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemandeEchange_remplacantId_fkey" FOREIGN KEY ("remplacantId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DemandeEchange" ("astreinteId", "createdAt", "dateTraitement", "demandeurId", "id", "remplacantId", "statut") SELECT "astreinteId", "createdAt", "dateTraitement", "demandeurId", "id", "remplacantId", "statut" FROM "DemandeEchange";
DROP TABLE "DemandeEchange";
ALTER TABLE "new_DemandeEchange" RENAME TO "DemandeEchange";
CREATE TABLE "new_JournalAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateAction" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acteurId" TEXT,
    "typeAction" TEXT NOT NULL,
    "iadeConcerneId" TEXT,
    "resume" TEXT NOT NULL,
    "detail" JSONB,
    CONSTRAINT "JournalAudit_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalAudit_iadeConcerneId_fkey" FOREIGN KEY ("iadeConcerneId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JournalAudit" ("acteurId", "dateAction", "detail", "iadeConcerneId", "id", "resume", "typeAction") SELECT "acteurId", "dateAction", "detail", "iadeConcerneId", "id", "resume", "typeAction" FROM "JournalAudit";
DROP TABLE "JournalAudit";
ALTER TABLE "new_JournalAudit" RENAME TO "JournalAudit";
CREATE TABLE "new_OffreAstreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "astreinteId" TEXT NOT NULL,
    "proposantId" TEXT NOT NULL,
    "dateOuverture" DATETIME NOT NULL,
    "dateFermeture" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'OUVERTE',
    CONSTRAINT "OffreAstreinte_astreinteId_fkey" FOREIGN KEY ("astreinteId") REFERENCES "Astreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OffreAstreinte_proposantId_fkey" FOREIGN KEY ("proposantId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OffreAstreinte" ("astreinteId", "dateFermeture", "dateOuverture", "id", "proposantId", "statut") SELECT "astreinteId", "dateFermeture", "dateOuverture", "id", "proposantId", "statut" FROM "OffreAstreinte";
DROP TABLE "OffreAstreinte";
ALTER TABLE "new_OffreAstreinte" RENAME TO "OffreAstreinte";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
