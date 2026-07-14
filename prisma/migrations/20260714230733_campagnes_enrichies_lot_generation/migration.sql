/*
  Warnings:

  - Added the required column `dateLimiteSaisieDispos` to the `FenetreGeneration` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "LotGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ligneId" TEXT NOT NULL,
    "periodeDebut" DATETIME NOT NULL,
    "periodeFin" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE_PUBLICATION',
    "fenetreGenerationId" TEXT,
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datePublication" DATETIME,
    CONSTRAINT "LotGeneration_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LotGeneration_fenetreGenerationId_fkey" FOREIGN KEY ("fenetreGenerationId") REFERENCES "FenetreGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "lotGenerationId" TEXT,
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_lotGenerationId_fkey" FOREIGN KEY ("lotGenerationId") REFERENCES "LotGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Astreinte" ("date", "datePublication", "iadeId", "id", "ligneId", "pointsAttribues", "publie", "statut", "typeCreneau") SELECT "date", "datePublication", "iadeId", "id", "ligneId", "pointsAttribues", "publie", "statut", "typeCreneau" FROM "Astreinte";
DROP TABLE "Astreinte";
ALTER TABLE "new_Astreinte" RENAME TO "Astreinte";
CREATE UNIQUE INDEX "Astreinte_date_ligneId_typeCreneau_key" ON "Astreinte"("date", "ligneId", "typeCreneau");
CREATE TABLE "new_FenetreGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ligneId" TEXT NOT NULL,
    "periodeDebut" DATETIME NOT NULL,
    "periodeFin" DATETIME NOT NULL,
    "dateLimiteSaisieDispos" DATETIME NOT NULL,
    "dateGenerationPrevue" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "dateConfirmation" DATETIME,
    "archivee" BOOLEAN NOT NULL DEFAULT false,
    "dateArchivage" DATETIME,
    CONSTRAINT "FenetreGeneration_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FenetreGeneration" ("dateConfirmation", "dateGenerationPrevue", "dateLimiteSaisieDispos", "id", "ligneId", "periodeDebut", "periodeFin", "statut", "archivee") SELECT "dateConfirmation", "dateGenerationPrevue", "dateGenerationPrevue", "id", "ligneId", "periodeDebut", "periodeFin", "statut", false FROM "FenetreGeneration";
DROP TABLE "FenetreGeneration";
ALTER TABLE "new_FenetreGeneration" RENAME TO "FenetreGeneration";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LotGeneration_ligneId_statut_idx" ON "LotGeneration"("ligneId", "statut");
