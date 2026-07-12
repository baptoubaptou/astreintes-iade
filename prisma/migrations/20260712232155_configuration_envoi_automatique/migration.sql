-- CreateTable
CREATE TABLE "ConfigurationEnvoiAutomatique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailDestinataire" TEXT NOT NULL DEFAULT '',
    "jourEnvoi" TEXT NOT NULL DEFAULT 'JEUDI',
    "actif" BOOLEAN NOT NULL DEFAULT false
);
