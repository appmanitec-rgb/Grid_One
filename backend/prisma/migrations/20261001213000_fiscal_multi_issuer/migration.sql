ALTER TABLE "fiscal_documents" ADD COLUMN "issuerCompanyId" TEXT;

UPDATE "fiscal_documents" AS document
SET "issuerCompanyId" = company."id"
FROM "company_settings" AS company
WHERE document."issuerSnapshot"->>'cnpj' = regexp_replace(COALESCE(company."cnpj", ''), '[^0-9]', '', 'g')
  AND LENGTH(document."issuerSnapshot"->>'cnpj') = 14;

CREATE INDEX "fiscal_documents_issuerCompanyId_status_createdAt_idx" ON "fiscal_documents"("issuerCompanyId", "status", "createdAt");
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "company_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
