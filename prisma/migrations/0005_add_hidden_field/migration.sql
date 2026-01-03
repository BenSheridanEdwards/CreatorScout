-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "hidden_at" TIMESTAMPTZ(6);





