CREATE TYPE "CatalogIdentifierType" AS ENUM (
  'INTERNAL_SKU',
  'MANUFACTURER_PART_NUMBER',
  'SUPPLIER_CODE',
  'BARCODE',
  'LEGACY_CODE',
  'PREVIOUS_CODE',
  'CATALOG_CODE',
  'MANUAL_CODE',
  'INTERNAL_ALIAS',
  'OTHER'
);

CREATE TYPE "CatalogOfferStatus" AS ENUM (
  'ACTIVE',
  'SUPERSEDED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE TYPE "PurchaseTaxMode" AS ENUM (
  'AMOUNT',
  'PERCENT'
);

CREATE TABLE "catalog_item_identifiers" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "type" "CatalogIdentifierType" NOT NULL DEFAULT 'OTHER',
  "code" TEXT NOT NULL,
  "normalizedCode" TEXT NOT NULL,
  "source" TEXT,
  "manufacturerId" TEXT,
  "supplierId" TEXT,
  "description" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_item_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_supplier_offers" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplierItemId" TEXT,
  "manufacturerId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "CatalogOfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "supplierSku" TEXT,
  "offeredPartNumber" TEXT,
  "offeredDescription" TEXT,
  "quoteNumber" TEXT,
  "contactName" TEXT,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "priceQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "minPurchaseQty" DOUBLE PRECISION,
  "purchaseMultiple" DOUBLE PRECISION,
  "purchaseUnit" TEXT,
  "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "availability" TEXT,
  "leadTimeDays" INTEGER,
  "paymentTerm" TEXT,
  "freightAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "insuranceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "additionalCostsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseTaxMode" "PurchaseTaxMode" NOT NULL DEFAULT 'AMOUNT',
  "purchaseTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recoverableCreditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "effectiveUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "effectiveTotalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "quotedAt" TIMESTAMP(3),
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "preferenceReason" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "supersededByOfferId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_supplier_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_item_documents" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "offerId" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "version" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "fileName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "storageKey" TEXT,
  "externalUrl" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_item_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_item_identifiers_catalogItemId_type_isActive_idx"
  ON "catalog_item_identifiers"("catalogItemId", "type", "isActive");
CREATE INDEX "catalog_item_identifiers_normalizedCode_idx"
  ON "catalog_item_identifiers"("normalizedCode");
CREATE INDEX "catalog_item_identifiers_supplierId_idx"
  ON "catalog_item_identifiers"("supplierId");
CREATE INDEX "catalog_item_identifiers_manufacturerId_idx"
  ON "catalog_item_identifiers"("manufacturerId");

CREATE INDEX "catalog_supplier_offers_catalogItemId_status_validUntil_idx"
  ON "catalog_supplier_offers"("catalogItemId", "status", "validUntil");
CREATE INDEX "catalog_supplier_offers_supplierId_catalogItemId_idx"
  ON "catalog_supplier_offers"("supplierId", "catalogItemId");
CREATE INDEX "catalog_supplier_offers_supplierItemId_idx"
  ON "catalog_supplier_offers"("supplierItemId");
CREATE INDEX "catalog_supplier_offers_isPreferred_status_idx"
  ON "catalog_supplier_offers"("isPreferred", "status");
CREATE INDEX "catalog_supplier_offers_createdById_createdAt_idx"
  ON "catalog_supplier_offers"("createdById", "createdAt");

CREATE INDEX "catalog_item_documents_catalogItemId_category_status_idx"
  ON "catalog_item_documents"("catalogItemId", "category", "status");
CREATE INDEX "catalog_item_documents_offerId_idx"
  ON "catalog_item_documents"("offerId");
CREATE INDEX "catalog_item_documents_createdById_createdAt_idx"
  ON "catalog_item_documents"("createdById", "createdAt");

ALTER TABLE "catalog_item_identifiers"
  ADD CONSTRAINT "catalog_item_identifiers_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_item_identifiers"
  ADD CONSTRAINT "catalog_item_identifiers_manufacturerId_fkey"
  FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_item_identifiers"
  ADD CONSTRAINT "catalog_item_identifiers_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_supplierItemId_fkey"
  FOREIGN KEY ("supplierItemId") REFERENCES "supplier_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_manufacturerId_fkey"
  FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_supplier_offers"
  ADD CONSTRAINT "catalog_supplier_offers_supersededByOfferId_fkey"
  FOREIGN KEY ("supersededByOfferId") REFERENCES "catalog_supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "catalog_item_documents"
  ADD CONSTRAINT "catalog_item_documents_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_item_documents"
  ADD CONSTRAINT "catalog_item_documents_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "catalog_supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_item_documents"
  ADD CONSTRAINT "catalog_item_documents_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "catalog_item_identifiers" (
  "id",
  "catalogItemId",
  "type",
  "code",
  "normalizedCode",
  "source",
  "isPrimary",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  'INTERNAL_SKU',
  "sku",
  regexp_replace(upper("sku"), '[^A-Z0-9]', '', 'g'),
  'migracao_sku_atual',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items"
WHERE "sku" IS NOT NULL AND trim("sku") <> '';

INSERT INTO "catalog_item_identifiers" (
  "id",
  "catalogItemId",
  "type",
  "code",
  "normalizedCode",
  "source",
  "isPrimary",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  'MANUFACTURER_PART_NUMBER',
  "manufacturerPartNumber",
  regexp_replace(upper("manufacturerPartNumber"), '[^A-Z0-9]', '', 'g'),
  'migracao_part_number_atual',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items"
WHERE "manufacturerPartNumber" IS NOT NULL
  AND trim("manufacturerPartNumber") <> '';
