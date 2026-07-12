-- CreateTable
CREATE TABLE "BonusContinuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ligneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bonus" INTEGER NOT NULL,
    CONSTRAINT "BonusContinuite_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParametreAlgorithme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cle" TEXT NOT NULL,
    "valeur" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FenetreGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ligneId" TEXT NOT NULL,
    "periodeDebut" DATETIME NOT NULL,
    "periodeFin" DATETIME NOT NULL,
    "dateGenerationPrevue" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "dateConfirmation" DATETIME,
    CONSTRAINT "FenetreGeneration_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateAction" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acteurId" TEXT,
    "typeAction" TEXT NOT NULL,
    "iadeConcerneId" TEXT,
    "resume" TEXT NOT NULL,
    "detail" TEXT,
    CONSTRAINT "JournalAudit_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalAudit_iadeConcerneId_fkey" FOREIGN KEY ("iadeConcerneId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Astreinte" ("date", "iadeId", "id", "ligneId", "pointsAttribues", "statut", "typeCreneau") SELECT "date", "iadeId", "id", "ligneId", "pointsAttribues", "statut", "typeCreneau" FROM "Astreinte";
DROP TABLE "Astreinte";
ALTER TABLE "new_Astreinte" RENAME TO "Astreinte";
CREATE UNIQUE INDEX "Astreinte_date_ligneId_typeCreneau_key" ON "Astreinte"("date", "ligneId", "typeCreneau");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BonusContinuite_ligneId_type_key" ON "BonusContinuite"("ligneId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ParametreAlgorithme_cle_key" ON "ParametreAlgorithme"("cle");
