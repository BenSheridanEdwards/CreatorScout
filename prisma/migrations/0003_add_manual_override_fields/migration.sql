-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "manual_override" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "manually_marked_creator" BOOLEAN;
ALTER TABLE "profiles" ADD COLUMN "manual_override_reason" TEXT;
ALTER TABLE "profiles" ADD COLUMN "manual_override_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_manual_override" ON "profiles"("manual_override");

