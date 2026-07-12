-- Ajout du matricule avec valeurs de repli pour les comptes existants.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Utilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Utilisateur" (
    "id",
    "nom",
    "prenom",
    "matricule",
    "email",
    "motDePasseHash",
    "role",
    "actif",
    "createdAt"
)
SELECT
    "id",
    "nom",
    "prenom",
    CASE "email"
        WHEN 'cadre@test.local' THEN 'CADRE001'
        WHEN 'marie.dupont@test.local' THEN 'IADE001'
        WHEN 'thomas.bernard@test.local' THEN 'IADE002'
        WHEN 'sophie.martin@test.local' THEN 'IADE003'
        WHEN 'lucas.petit@test.local' THEN 'IADE004'
        WHEN 'camille.rousseau@test.local' THEN 'IADE005'
        WHEN 'antoine.moreau@test.local' THEN 'IADE006'
        ELSE 'MAT-' || substr("id", 1, 8)
    END,
    "email",
    "motDePasseHash",
    "role",
    "actif",
    "createdAt"
FROM "Utilisateur";
DROP TABLE "Utilisateur";
ALTER TABLE "new_Utilisateur" RENAME TO "Utilisateur";
CREATE UNIQUE INDEX "Utilisateur_matricule_key" ON "Utilisateur"("matricule");
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
