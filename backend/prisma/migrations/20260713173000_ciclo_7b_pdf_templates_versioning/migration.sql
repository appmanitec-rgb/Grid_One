-- Ciclo 7B: PDF real de laudos, flags de download publico e metadados de storage.

ALTER TABLE "document_deliveries"
  ADD COLUMN "fileStorageKey" TEXT,
  ADD COLUMN "fileName" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "storedAt" TIMESTAMP(3);

ALTER TABLE "service_report_share_links"
  ADD COLUMN "allowPdfDownload" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowEvidenceDownload" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "document_deliveries_fileStorageKey_key" ON "document_deliveries"("fileStorageKey");
CREATE INDEX "document_deliveries_checksumSha256_idx" ON "document_deliveries"("checksumSha256");
