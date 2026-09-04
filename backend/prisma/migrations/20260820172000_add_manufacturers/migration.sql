CREATE TYPE "ManufacturerType" AS ENUM (
  'GENERATOR',
  'ENGINE',
  'ALTERNATOR',
  'RADIATOR',
  'TRANSFER_SWITCH',
  'BATTERY',
  'CONTROLLER',
  'OTHER'
);

CREATE TABLE "manufacturers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ManufacturerType" NOT NULL DEFAULT 'OTHER',
  "country" TEXT,
  "website" TEXT,
  "supportPhone" TEXT,
  "supportEmail" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manufacturers_type_name_key" ON "manufacturers"("type", "name");
CREATE INDEX "manufacturers_name_idx" ON "manufacturers"("name");
CREATE INDEX "manufacturers_type_isActive_idx" ON "manufacturers"("type", "isActive");

INSERT INTO "manufacturers" ("id", "name", "type", "notes")
SELECT gen_random_uuid()::text, source."name", source."type"::"ManufacturerType", 'Criado a partir dos cadastros existentes.'
FROM (
  SELECT DISTINCT trim("brand") AS "name", 'GENERATOR' AS "type"
  FROM "generators"
  WHERE nullif(trim("brand"), '') IS NOT NULL

  UNION

  SELECT DISTINCT trim("brand") AS "name", 'GENERATOR' AS "type"
  FROM "modelos"
  WHERE nullif(trim("brand"), '') IS NOT NULL

  UNION

  SELECT DISTINCT trim("engineBrand") AS "name", 'ENGINE' AS "type"
  FROM "generators"
  WHERE nullif(trim("engineBrand"), '') IS NOT NULL

  UNION

  SELECT DISTINCT trim("alternatorBrand") AS "name", 'ALTERNATOR' AS "type"
  FROM "generators"
  WHERE nullif(trim("alternatorBrand"), '') IS NOT NULL

  UNION

  SELECT DISTINCT trim("transferSwitchBrand") AS "name", 'TRANSFER_SWITCH' AS "type"
  FROM "generators"
  WHERE nullif(trim("transferSwitchBrand"), '') IS NOT NULL

  UNION

  SELECT DISTINCT trim("brand") AS "name", 'OTHER' AS "type"
  FROM "catalog_items"
  WHERE nullif(trim("brand"), '') IS NOT NULL
) source
WHERE source."name" IS NOT NULL
ON CONFLICT ("type", "name") DO NOTHING;
