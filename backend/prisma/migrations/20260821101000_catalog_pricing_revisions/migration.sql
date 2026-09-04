ALTER TABLE "supplier_catalog_items"
  ADD COLUMN "priceValidFrom" TIMESTAMP(3),
  ADD COLUMN "priceValidUntil" TIMESTAMP(3),
  ADD COLUMN "lastQuotedAt" TIMESTAMP(3),
  ADD COLUMN "priceNotes" TEXT;

CREATE TABLE "catalog_price_revisions" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "supplierId" TEXT,
  "previousCostPrice" DOUBLE PRECISION,
  "previousBasePrice" DOUBLE PRECISION,
  "purchaseInvoiceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freightAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "otherPurchaseCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "calculatedPurchaseCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "profitMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "operationalCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finalSalePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_price_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_price_revisions_catalogItemId_createdAt_idx" ON "catalog_price_revisions"("catalogItemId", "createdAt");
CREATE INDEX "catalog_price_revisions_supplierId_createdAt_idx" ON "catalog_price_revisions"("supplierId", "createdAt");

ALTER TABLE "catalog_price_revisions"
  ADD CONSTRAINT "catalog_price_revisions_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_price_revisions"
  ADD CONSTRAINT "catalog_price_revisions_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "catalog_price_revisions"
  ADD CONSTRAINT "catalog_price_revisions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
