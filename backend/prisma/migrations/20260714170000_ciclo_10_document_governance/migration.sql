-- CreateEnum
CREATE TYPE "DocumentAccessType" AS ENUM ('PDF_DOWNLOAD', 'EVIDENCE_DOWNLOAD', 'SHARE_OPEN', 'VERIFY');

-- CreateEnum
CREATE TYPE "DocumentAccessChannel" AS ENUM ('INTERNAL', 'CUSTOMER_PORTAL', 'PUBLIC_LINK', 'VERIFY');

-- CreateEnum
CREATE TYPE "DocumentAccessResult" AS ENUM ('SUCCESS', 'DENIED', 'EXPIRED', 'REVOKED', 'NOT_FOUND');

-- AlterTable
ALTER TABLE "service_reports"
  ADD COLUMN "signerRole" TEXT,
  ADD COLUMN "signerEmail" TEXT,
  ADD COLUMN "acceptanceText" TEXT,
  ADD COLUMN "evidenceHash" TEXT,
  ADD COLUMN "signatureHash" TEXT,
  ADD COLUMN "signatureVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "retentionUntil" TIMESTAMP(3),
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "customerAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "customerAcceptedByUserId" TEXT,
  ADD COLUMN "customerAcceptanceText" TEXT,
  ADD COLUMN "customerAcceptanceIp" TEXT,
  ADD COLUMN "customerAcceptanceUserAgent" TEXT,
  ADD COLUMN "customerAcceptanceHash" TEXT,
  ADD COLUMN "customerAcceptanceDocumentHash" TEXT;

-- CreateTable
CREATE TABLE "document_access_logs" (
  "id" TEXT NOT NULL,
  "documentType" "DeliveryDocumentType" NOT NULL,
  "documentId" TEXT,
  "documentDeliveryId" TEXT,
  "serviceReportId" TEXT,
  "evidenceId" TEXT,
  "userId" TEXT,
  "clientId" TEXT,
  "shareLinkId" TEXT,
  "accessType" "DocumentAccessType" NOT NULL,
  "channel" "DocumentAccessChannel" NOT NULL,
  "result" "DocumentAccessResult" NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_reports_revokedAt_idx" ON "service_reports"("revokedAt");
CREATE INDEX "service_reports_retentionUntil_idx" ON "service_reports"("retentionUntil");
CREATE INDEX "service_reports_customerAcceptedAt_idx" ON "service_reports"("customerAcceptedAt");
CREATE INDEX "document_access_logs_documentType_documentId_createdAt_idx" ON "document_access_logs"("documentType", "documentId", "createdAt");
CREATE INDEX "document_access_logs_serviceReportId_createdAt_idx" ON "document_access_logs"("serviceReportId", "createdAt");
CREATE INDEX "document_access_logs_documentDeliveryId_createdAt_idx" ON "document_access_logs"("documentDeliveryId", "createdAt");
CREATE INDEX "document_access_logs_evidenceId_createdAt_idx" ON "document_access_logs"("evidenceId", "createdAt");
CREATE INDEX "document_access_logs_userId_createdAt_idx" ON "document_access_logs"("userId", "createdAt");
CREATE INDEX "document_access_logs_clientId_createdAt_idx" ON "document_access_logs"("clientId", "createdAt");
CREATE INDEX "document_access_logs_shareLinkId_createdAt_idx" ON "document_access_logs"("shareLinkId", "createdAt");
CREATE INDEX "document_access_logs_accessType_result_createdAt_idx" ON "document_access_logs"("accessType", "result", "createdAt");

-- AddForeignKey
ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_customerAcceptedByUserId_fkey"
  FOREIGN KEY ("customerAcceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_documentDeliveryId_fkey"
  FOREIGN KEY ("documentDeliveryId") REFERENCES "document_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_serviceReportId_fkey"
  FOREIGN KEY ("serviceReportId") REFERENCES "service_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "service_report_evidences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "service_report_share_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
