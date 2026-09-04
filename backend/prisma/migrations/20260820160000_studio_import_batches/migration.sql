-- CreateEnum
CREATE TYPE "StudioImportMode" AS ENUM ('CREATE_ONLY', 'UPSERT', 'UPDATE_ONLY');

-- CreateEnum
CREATE TYPE "StudioImportBatchStatus" AS ENUM ('PREVIEW', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "StudioImportRowStatus" AS ENUM ('VALID', 'WARNING', 'INVALID', 'DUPLICATE', 'CREATED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "studio_import_batches" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mode" "StudioImportMode" NOT NULL DEFAULT 'CREATE_ONLY',
    "status" "StudioImportBatchStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "studio_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_import_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "status" "StudioImportRowStatus" NOT NULL,
    "errors" JSONB,
    "warnings" JSONB,
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_import_batches_resource_status_createdAt_idx" ON "studio_import_batches"("resource", "status", "createdAt");

-- CreateIndex
CREATE INDEX "studio_import_batches_createdById_createdAt_idx" ON "studio_import_batches"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "studio_import_rows_batchId_rowNumber_idx" ON "studio_import_rows"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "studio_import_rows_status_idx" ON "studio_import_rows"("status");

-- AddForeignKey
ALTER TABLE "studio_import_batches" ADD CONSTRAINT "studio_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_import_rows" ADD CONSTRAINT "studio_import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "studio_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
