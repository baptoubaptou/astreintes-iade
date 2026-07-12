-- Migration creneaux_types_par_jour
-- Remplace l'enum TypeCreneau (5 → 7 valeurs) et supprime dateFin sur Astreinte.

PRAGMA foreign_keys=OFF;

-- PoidsCreneau : les 5 anciennes entrées par ligne ne sont plus compatibles → vidage (re-seed).
DELETE FROM "PoidsCreneau";

-- Disponibilite : conversion des types selon le jour de la semaine.
CREATE TABLE "new_Disponibilite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "typeCreneau" TEXT NOT NULL,
    CONSTRAINT "Disponibilite_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Disponibilite_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Disponibilite" ("id", "iadeId", "ligneId", "date", "typeCreneau")
SELECT
    "id",
    "iadeId",
    "ligneId",
    "date",
    CASE
        WHEN "typeCreneau" = 'JOURNEE' THEN 'NUIT_SEMAINE'
        WHEN "typeCreneau" IN ('JOUR_NUIT', 'WEEKEND_48H') THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'JOUR_SAMEDI'
                WHEN 0 THEN 'JOUR_DIMANCHE'
                ELSE 'NUIT_SEMAINE'
            END
        WHEN "typeCreneau" = 'JOUR' THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'JOUR_SAMEDI'
                WHEN 0 THEN 'JOUR_DIMANCHE'
                ELSE 'JOUR_FERIE'
            END
        WHEN "typeCreneau" = 'NUIT' THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'NUIT_SAMEDI'
                WHEN 0 THEN 'NUIT_DIMANCHE'
                ELSE 'NUIT_FERIE'
            END
        ELSE 'NUIT_SEMAINE'
    END
FROM "Disponibilite";

DROP TABLE "Disponibilite";
ALTER TABLE "new_Disponibilite" RENAME TO "Disponibilite";
CREATE UNIQUE INDEX "Disponibilite_iadeId_ligneId_date_typeCreneau_key" ON "Disponibilite"("iadeId", "ligneId", "date", "typeCreneau");

-- Astreinte : suppression de dateFin + conversion des types.
CREATE TABLE "new_Astreinte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "ligneId" TEXT NOT NULL,
    "typeCreneau" TEXT NOT NULL DEFAULT 'NUIT_SEMAINE',
    "iadeId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIEE',
    "pointsAttribues" INTEGER NOT NULL,
    CONSTRAINT "Astreinte_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneAstreinte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Astreinte_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Astreinte" ("id", "date", "ligneId", "typeCreneau", "iadeId", "statut", "pointsAttribues")
SELECT
    "id",
    "date",
    "ligneId",
    CASE
        WHEN "typeCreneau" = 'JOURNEE' THEN 'NUIT_SEMAINE'
        WHEN "typeCreneau" IN ('JOUR_NUIT', 'WEEKEND_48H') THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'JOUR_SAMEDI'
                WHEN 0 THEN 'JOUR_DIMANCHE'
                ELSE 'NUIT_SEMAINE'
            END
        WHEN "typeCreneau" = 'JOUR' THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'JOUR_SAMEDI'
                WHEN 0 THEN 'JOUR_DIMANCHE'
                ELSE 'JOUR_FERIE'
            END
        WHEN "typeCreneau" = 'NUIT' THEN
            CASE CAST(strftime('%w', "date") AS INTEGER)
                WHEN 6 THEN 'NUIT_SAMEDI'
                WHEN 0 THEN 'NUIT_DIMANCHE'
                ELSE 'NUIT_FERIE'
            END
        ELSE 'NUIT_SEMAINE'
    END,
    "iadeId",
    "statut",
    "pointsAttribues"
FROM "Astreinte";

DROP TABLE "Astreinte";
ALTER TABLE "new_Astreinte" RENAME TO "Astreinte";
CREATE UNIQUE INDEX "Astreinte_date_ligneId_typeCreneau_key" ON "Astreinte"("date", "ligneId", "typeCreneau");

PRAGMA foreign_keys=ON;
