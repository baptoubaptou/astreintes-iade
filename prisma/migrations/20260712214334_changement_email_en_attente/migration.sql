-- CreateTable
CREATE TABLE "ChangementEmailEnAttente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "utilisateurId" TEXT NOT NULL,
    "nouvelEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expireLe" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangementEmailEnAttente_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChangementEmailEnAttente_utilisateurId_idx" ON "ChangementEmailEnAttente"("utilisateurId");

-- CreateIndex
CREATE INDEX "ChangementEmailEnAttente_nouvelEmail_idx" ON "ChangementEmailEnAttente"("nouvelEmail");
