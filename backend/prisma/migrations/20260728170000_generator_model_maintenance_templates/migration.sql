CREATE TYPE "MaintenanceTemplateCategory" AS ENUM (
  'OIL',
  'FILTER',
  'BATTERY',
  'SPARK_PLUG',
  'INSPECTION',
  'TEST',
  'CLEANING',
  'ELECTRICAL',
  'MECHANICAL',
  'OTHER'
);

CREATE TYPE "MaintenanceIntervalUnit" AS ENUM (
  'DAYS',
  'MONTHS',
  'YEARS'
);

ALTER TABLE "modelos"
  ADD COLUMN "frequencyHz" INTEGER,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notes" TEXT;

CREATE TABLE "generator_model_maintenance_templates" (
  "id" TEXT NOT NULL,
  "generatorModelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "MaintenanceTemplateCategory" NOT NULL DEFAULT 'OTHER',
  "intervalValue" INTEGER,
  "intervalUnit" "MaintenanceIntervalUnit",
  "hourMeterInterval" INTEGER,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "generator_model_maintenance_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generator_model_maintenance_templates_generatorModelId_active_sortOrder_idx"
  ON "generator_model_maintenance_templates"("generatorModelId", "active", "sortOrder");

ALTER TABLE "generator_model_maintenance_templates"
  ADD CONSTRAINT "generator_model_maintenance_templates_generatorModelId_fkey"
  FOREIGN KEY ("generatorModelId") REFERENCES "modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
