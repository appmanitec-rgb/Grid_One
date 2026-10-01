CREATE TYPE "FiscalDocumentKind" AS ENUM ('NFE', 'NFSE');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AUTHORIZED', 'REJECTED', 'CANCELLED');

CREATE TABLE "fiscal_documents" (
  "id" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "kind" "FiscalDocumentKind" NOT NULL,
  "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "issuerSnapshot" JSONB NOT NULL,
  "recipientSnapshot" JSONB NOT NULL,
  "items" JSONB NOT NULL,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "fiscalNotes" TEXT,
  "provider" TEXT,
  "providerReference" TEXT,
  "number" TEXT,
  "series" TEXT,
  "accessKey" TEXT,
  "issuedAt" TIMESTAMP(3),
  "authorizedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "xml" BYTEA,
  "pdf" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_documents_providerReference_key" ON "fiscal_documents"("providerReference");
CREATE UNIQUE INDEX "fiscal_documents_accessKey_key" ON "fiscal_documents"("accessKey");
CREATE INDEX "fiscal_documents_receivableId_kind_status_idx" ON "fiscal_documents"("receivableId", "kind", "status");
CREATE INDEX "fiscal_documents_status_createdAt_idx" ON "fiscal_documents"("status", "createdAt");
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
