/*
  Warnings:

  - You are about to alter the column `detail` on the `JournalAudit` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JournalAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateAction" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acteurId" TEXT,
    "typeAction" TEXT NOT NULL,
    "iadeConcerneId" TEXT,
    "resume" TEXT NOT NULL,
    "detail" JSONB,
    CONSTRAINT "JournalAudit_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalAudit_iadeConcerneId_fkey" FOREIGN KEY ("iadeConcerneId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalAudit" ("acteurId", "dateAction", "detail", "iadeConcerneId", "id", "resume", "typeAction") SELECT "acteurId", "dateAction", "detail", "iadeConcerneId", "id", "resume", "typeAction" FROM "JournalAudit";
DROP TABLE "JournalAudit";
ALTER TABLE "new_JournalAudit" RENAME TO "JournalAudit";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
