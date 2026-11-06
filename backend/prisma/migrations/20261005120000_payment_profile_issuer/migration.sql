ALTER TABLE "proposal_payment_profiles"
ADD COLUMN "issuerCompanyId" TEXT;

CREATE INDEX "proposal_payment_profiles_issuerCompanyId_idx"
ON "proposal_payment_profiles"("issuerCompanyId");

ALTER TABLE "proposal_payment_profiles"
ADD CONSTRAINT "proposal_payment_profiles_issuerCompanyId_fkey"
FOREIGN KEY ("issuerCompanyId") REFERENCES "company_settings"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
