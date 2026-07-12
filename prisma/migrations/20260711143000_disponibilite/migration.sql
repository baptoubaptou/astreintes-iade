-- Rename Indisponibilite to Disponibilite (positive availability model)
CREATE TABLE "Disponibilite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iadeId" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL,
    "dateFin" DATETIME NOT NULL,
    CONSTRAINT "Disponibilite_iadeId_fkey" FOREIGN KEY ("iadeId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Disponibilite" ("id", "iadeId", "dateDebut", "dateFin")
SELECT "id", "iadeId", "dateDebut", "dateFin" FROM "Indisponibilite";

DROP TABLE "Indisponibilite";
