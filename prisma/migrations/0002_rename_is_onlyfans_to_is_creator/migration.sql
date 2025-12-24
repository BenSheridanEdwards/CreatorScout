-- AlterTable: Rename is_patreon to is_creator
ALTER TABLE "profiles" RENAME COLUMN "is_patreon" TO "is_creator";

-- Drop old index
DROP INDEX IF EXISTS "idx_is_patreon";

-- Create new index
CREATE INDEX "idx_is_creator" ON "profiles"("is_creator");

