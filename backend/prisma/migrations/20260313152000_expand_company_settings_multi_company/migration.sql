ALTER TABLE "company_settings"
ADD COLUMN     "stateRegistration" TEXT,
ADD COLUMN     "municipalRegistration" TEXT,
ADD COLUMN     "taxRegime" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactRole" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "company_settings"
SET "cnpj" = NULL
WHERE "cnpj" = '';

UPDATE "company_settings"
SET "isPrimary" = false;

WITH preferred_company AS (
  SELECT "id"
  FROM "company_settings"
  ORDER BY
    CASE WHEN "key" = 'default' THEN 0 ELSE 1 END,
    "createdAt" ASC
  LIMIT 1
)
UPDATE "company_settings"
SET "isPrimary" = true
WHERE "id" IN (SELECT "id" FROM preferred_company);

CREATE INDEX "company_settings_cnpj_idx" ON "company_settings"("cnpj");
CREATE INDEX "company_settings_isPrimary_idx" ON "company_settings"("isPrimary");
