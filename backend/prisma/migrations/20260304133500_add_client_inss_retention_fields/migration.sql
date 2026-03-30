-- AlterTable
ALTER TABLE "clients"
ADD COLUMN "withholdsInss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasTaxRetention" BOOLEAN NOT NULL DEFAULT false;
