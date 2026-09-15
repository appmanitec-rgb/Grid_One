WITH updated_policy AS (
  UPDATE "catalog_pricing_policies"
  SET
    "icmsPercent" = 18,
    "pisPercent" = 1.65,
    "cofinsPercent" = 7.6,
    "salesTaxPercent" = 27.25,
    "profitMarginPercent" = 50,
    "commissionPercent" = 2,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "itemType" = 'PART'
    AND "isDefault" = true
    AND "isActive" = true
  RETURNING "id"
)
UPDATE "catalog_items" AS item
SET
  "icmsPercent" = 18,
  "pisPercent" = 1.65,
  "cofinsPercent" = 7.6,
  "taxPercentage" = 27.25,
  "profitMargin" = 50,
  "commissionPercent" = 2
FROM updated_policy AS policy
WHERE item."pricingPolicyId" = policy."id"
  AND item."taxProfile"->>'lastPricingApprovalId' IS NULL;
