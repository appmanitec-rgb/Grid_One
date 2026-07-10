-- Ciclo 5: technical service reports, checklist, evidence metadata and portal release.

ALTER TYPE "AuditDomain" ADD VALUE IF NOT EXISTS 'SERVICE_REPORTS';
ALTER TYPE "DeliveryDocumentType" ADD VALUE IF NOT EXISTS 'SERVICE_REPORT';

CREATE TYPE "ReportStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'RELEASED_TO_CUSTOMER',
  'CANCELED'
);

CREATE TYPE "ChecklistResult" AS ENUM (
  'OK',
  'NOT_OK',
  'NOT_APPLICABLE',
  'PENDING'
);

CREATE TYPE "EvidenceType" AS ENUM (
  'PHOTO',
  'VIDEO',
  'DOCUMENT',
  'MEASUREMENT',
  'SIGNATURE',
  'OTHER'
);

CREATE TABLE "service_reports" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "maintenanceOrderId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "generatorId" TEXT NOT NULL,
  "siteId" TEXT,
  "contractId" TEXT,
  "technicianId" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "diagnosis" TEXT NOT NULL,
  "performedServices" TEXT NOT NULL,
  "recommendations" TEXT,
  "observations" TEXT,
  "safetyNotes" TEXT,
  "customerNotes" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "signedByName" TEXT,
  "signedByDocument" TEXT,
  "signatureData" TEXT,
  "signatureIp" TEXT,
  "signatureUserAgent" TEXT,
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "releasedToCustomerAt" TIMESTAMP(3),
  "releasedByUserId" TEXT,
  "generatedDocumentId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_report_checklist_items" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "result" "ChecklistResult" NOT NULL DEFAULT 'PENDING',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_report_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_report_evidences" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "type" "EvidenceType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "fileUrl" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_report_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_reports_code_key" ON "service_reports"("code");
CREATE UNIQUE INDEX "service_reports_maintenanceOrderId_key" ON "service_reports"("maintenanceOrderId");
CREATE UNIQUE INDEX "service_reports_generatedDocumentId_key" ON "service_reports"("generatedDocumentId");
CREATE INDEX "service_reports_clientId_status_createdAt_idx" ON "service_reports"("clientId", "status", "createdAt");
CREATE INDEX "service_reports_generatorId_createdAt_idx" ON "service_reports"("generatorId", "createdAt");
CREATE INDEX "service_reports_technicianId_createdAt_idx" ON "service_reports"("technicianId", "createdAt");
CREATE INDEX "service_reports_customerVisible_releasedToCustomerAt_idx" ON "service_reports"("customerVisible", "releasedToCustomerAt");
CREATE INDEX "service_report_checklist_items_reportId_sortOrder_idx" ON "service_report_checklist_items"("reportId", "sortOrder");
CREATE INDEX "service_report_evidences_reportId_customerVisible_createdAt_idx" ON "service_report_evidences"("reportId", "customerVisible", "createdAt");
CREATE INDEX "service_report_evidences_uploadedByUserId_createdAt_idx" ON "service_report_evidences"("uploadedByUserId", "createdAt");

ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "document_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_report_checklist_items" ADD CONSTRAINT "service_report_checklist_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_report_evidences" ADD CONSTRAINT "service_report_evidences_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_report_evidences" ADD CONSTRAINT "service_report_evidences_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
