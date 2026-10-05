ALTER TABLE "bank_collection_agreements"
  ADD COLUMN "issuerCompanyId" TEXT,
  ADD COLUMN "homologationReference" TEXT,
  ADD COLUMN "homologatedAt" TIMESTAMP(3),
  ADD COLUMN "homologatedById" TEXT;

-- Existing checkbox values had no bank validation evidence.
UPDATE "bank_collection_agreements" SET "homologated" = false;

CREATE INDEX "bank_collection_agreements_issuerCompanyId_idx"
  ON "bank_collection_agreements"("issuerCompanyId");
ALTER TABLE "bank_collection_agreements"
  ADD CONSTRAINT "bank_collection_agreements_issuerCompanyId_fkey"
  FOREIGN KEY ("issuerCompanyId") REFERENCES "company_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
