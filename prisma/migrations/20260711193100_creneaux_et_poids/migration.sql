-- Migration creneaux_et_poids
-- Note: Disponibilite est recréée (4 lignes seed supprimées — acceptable, UI jamais en service)

PRAGMA foreign_keys=OFF;

-- PoidsCreneau
CREATE TABLE "PoidsCreneau" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ligneId" TEXT NOT NULL,
    "typeCreneau" TEXT NOT NULL,
    "poids" INTEGER NOT NULL,
    CONSTRAINT "PoidsCreneau_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PoidsCreneau_ligneId_typeCreneau_key" ON "PoidsCreneau"("ligneId", "typeCreneau");

-- JourFerie
CREATE TABLE "JourFerie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "nom" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX "JourFerie_date_key" ON "JourFerie"("date");

-- PreferenceContinuite
CREATE TABLE "PreferenceContinuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "PreferenceContinuite_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreferenceContinuite_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PreferenceContinuite_iadeId_ligneId_dateDebut_type_key" ON "PreferenceContinuite"("iadeId", "ligneId", "dateDebut", "type");

-- Astreinte : ajout dateFin + typeCreneau, nouvelle contrainte unique
CREATE TABLE "new_Astreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "dateFin" DATETIME,
    "ligneId" TEXT NOT NULL,
    "typeCreneau" TEXT NOT NULL DEFAULT 'JOURNEE',
    "iadeId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "pointsAttribues" INTEGER NOT NULL,
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Astreinte" ("id", "date", "dateFin", "ligneId", "typeCreneau", "iadeId", "statut", "pointsAttribues")
SELECT "id", "date", NULL, "ligneId", 'JOURNEE', "iadeId", "statut", "pointsAttribues"
FROM "Astreinte";

DROP TABLE "Astreinte";
ALTER TABLE "new_Astreinte" RENAME TO "Astreinte";

CREATE UNIQUE INDEX "Astreinte_date_ligneId_typeCreneau_key" ON "Astreinte"("date", "ligneId", "typeCreneau");

-- Disponibilite : recréation complète (structure dateDebut/dateFin abandonnée)
DROP TABLE "Disponibilite";

CREATE TABLE "Disponibilite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "typeCreneau" TEXT NOT NULL,
    CONSTRAINT "Disponibilite_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Disponibilite_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Disponibilite_iadeId_ligneId_date_typeCreneau_key" ON "Disponibilite"("iadeId", "ligneId", "date", "typeCreneau");

-- LigneAstreinte : suppression du champ poids (remplacé par PoidsCreneau)
CREATE TABLE "new_LigneAstreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordrePriorite" INTEGER NOT NULL
);

INSERT INTO "new_LigneAstreinte" ("id", "nom", "actif", "ordrePriorite")
SELECT "id", "nom", "actif", "ordrePriorite" FROM "LigneAstreinte";

DROP TABLE "LigneAstreinte";
ALTER TABLE "new_LigneAstreinte" RENAME TO "LigneAstreinte";

CREATE UNIQUE INDEX "LigneAstreinte_nom_key" ON "LigneAstreinte"("nom");

PRAGMA foreign_keys=ON;
