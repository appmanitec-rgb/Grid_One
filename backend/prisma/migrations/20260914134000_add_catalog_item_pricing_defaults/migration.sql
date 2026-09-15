ALTER TABLE "catalog_items"
ADD COLUMN "legacyCode" TEXT,
ADD COLUMN "itemClassification" TEXT,
ADD COLUMN "acquisitionOrigin" TEXT,
ADD COLUMN "icmsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pisPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "cofinsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "ipiPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "issPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "irpjPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "csllPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "cppPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "operationalCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pricingPolicyId" TEXT;

UPDATE "catalog_items" AS item
SET
  "legacyCode" = COALESCE(
    item."technicalSpecs"->>'codigoSecundario',
    (
      SELECT identifier."code"
      FROM "catalog_item_identifiers" AS identifier
      WHERE identifier."catalogItemId" = item."id"
        AND identifier."type" = 'LEGACY_CODE'
        AND identifier."isActive" = true
      ORDER BY identifier."createdAt" ASC
      LIMIT 1
    )
  ),
  "itemClassification" = CASE
    WHEN item."type" = 'SERVICE' THEN 'Servico'
    ELSE COALESCE(item."technicalSpecs"->>'tipoDoItem', 'Acabado')
  END,
  "acquisitionOrigin" = COALESCE(item."technicalSpecs"->>'origem', 'Comprado');

WITH selected_policy AS (
  SELECT item."id" AS "itemId", pricing.*
  FROM "catalog_items" AS item
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM "catalog_pricing_policies" AS candidate
    WHERE candidate."itemType" = item."type"
      AND candidate."isActive" = true
    ORDER BY candidate."isDefault" DESC, candidate."name" ASC
    LIMIT 1
  ) AS pricing ON true
)
UPDATE "catalog_items" AS item
SET
  "pricingPolicyId" = policy."id",
  "icmsPercent" = COALESCE(NULLIF(item."taxProfile"->>'icmsPercent', '')::DOUBLE PRECISION, policy."icmsPercent", 0),
  "pisPercent" = COALESCE(NULLIF(item."taxProfile"->>'pisPercent', '')::DOUBLE PRECISION, policy."pisPercent", 0),
  "cofinsPercent" = COALESCE(NULLIF(item."taxProfile"->>'cofinsPercent', '')::DOUBLE PRECISION, policy."cofinsPercent", 0),
  "ipiPercent" = COALESCE(NULLIF(item."taxProfile"->>'ipiPercent', '')::DOUBLE PRECISION, policy."ipiPercent", 0),
  "issPercent" = COALESCE(NULLIF(item."taxProfile"->>'issPercent', '')::DOUBLE PRECISION, policy."issPercent", 0),
  "irpjPercent" = COALESCE(NULLIF(item."taxProfile"->>'irpjPercent', '')::DOUBLE PRECISION, policy."irpjPercent", 0),
  "csllPercent" = COALESCE(NULLIF(item."taxProfile"->>'csllPercent', '')::DOUBLE PRECISION, policy."csllPercent", 0),
  "cppPercent" = COALESCE(NULLIF(item."taxProfile"->>'cppPercent', '')::DOUBLE PRECISION, policy."cppPercent", 0),
  "commissionPercent" = COALESCE(NULLIF(item."taxProfile"->>'commissionPercent', '')::DOUBLE PRECISION, policy."commissionPercent", 0),
  "operationalCostPercent" = COALESCE(NULLIF(item."taxProfile"->>'operationalCostPercent', '')::DOUBLE PRECISION, policy."operationalCostPercent", 0),
  "profitMargin" = COALESCE(NULLIF(item."taxProfile"->>'profitMarginPercent', '')::DOUBLE PRECISION, policy."profitMarginPercent", item."profitMargin", 0),
  "taxPercentage" = COALESCE(NULLIF(item."taxProfile"->>'salesTaxPercent', '')::DOUBLE PRECISION, policy."salesTaxPercent", item."taxPercentage", 0)
FROM selected_policy AS policy
WHERE policy."itemId" = item."id";

ALTER TABLE "catalog_items"
ADD CONSTRAINT "catalog_items_pricingPolicyId_fkey"
FOREIGN KEY ("pricingPolicyId") REFERENCES "catalog_pricing_policies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "catalog_items_legacyCode_idx" ON "catalog_items"("legacyCode");
CREATE INDEX "catalog_items_pricingPolicyId_idx" ON "catalog_items"("pricingPolicyId");
