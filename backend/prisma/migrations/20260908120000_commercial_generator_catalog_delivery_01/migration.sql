CREATE TYPE "CommercialGeneratorFuel" AS ENUM (
  'DIESEL',
  'NATURAL_GAS',
  'LPG'
);

CREATE TYPE "CommercialGeneratorConstruction" AS ENUM (
  'OPEN',
  'CANOPIED',
  'SOUND_ATTENUATED'
);

CREATE TYPE "CommercialGeneratorAvailability" AS ENUM (
  'IN_STOCK',
  'AVAILABLE_TO_ORDER',
  'ON_REQUEST',
  'UNAVAILABLE'
);

CREATE TABLE "commercial_generators" (
  "id" TEXT NOT NULL,
  "internalCode" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL DEFAULT 'Generac',
  "line" TEXT,
  "model" TEXT NOT NULL,
  "shortDescription" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "standbyPowerKw" DOUBLE PRECISION,
  "standbyPowerKva" DOUBLE PRECISION,
  "primePowerKw" DOUBLE PRECISION,
  "primePowerKva" DOUBLE PRECISION,
  "continuousPowerKw" DOUBLE PRECISION,
  "continuousPowerKva" DOUBLE PRECISION,
  "powerFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "frequencyHz" INTEGER NOT NULL DEFAULT 60,
  "availableVoltages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availablePhaseConfigs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fuelType" "CommercialGeneratorFuel" NOT NULL,
  "construction" "CommercialGeneratorConstruction" NOT NULL,
  "supportsIndoor" BOOLEAN NOT NULL DEFAULT false,
  "supportsOutdoor" BOOLEAN NOT NULL DEFAULT true,
  "availability" "CommercialGeneratorAvailability" NOT NULL DEFAULT 'ON_REQUEST',
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "leadTimeDays" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "suggestedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minimumPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "engineDescription" TEXT,
  "alternatorDescription" TEXT,
  "controllerDescription" TEXT,
  "enclosureDescription" TEXT,
  "standardAccessories" TEXT,
  "commercialNotes" TEXT,
  "technicalNotes" TEXT,
  "catalogItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_generators_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_generators_internal_code_check" CHECK (length(trim("internalCode")) > 0),
  CONSTRAINT "commercial_generators_model_check" CHECK (length(trim("model")) > 0),
  CONSTRAINT "commercial_generators_manufacturer_check" CHECK (lower("manufacturer") = 'generac'),
  CONSTRAINT "commercial_generators_active_power_check" CHECK (
    NOT "isActive" OR COALESCE("standbyPowerKw", 0) > 0 OR COALESCE("standbyPowerKva", 0) > 0
  ),
  CONSTRAINT "commercial_generators_power_factor_check" CHECK ("powerFactor" > 0 AND "powerFactor" <= 1),
  CONSTRAINT "commercial_generators_frequency_check" CHECK ("frequencyHz" > 0),
  CONSTRAINT "commercial_generators_stock_check" CHECK ("stockQuantity" >= 0),
  CONSTRAINT "commercial_generators_lead_time_check" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0),
  CONSTRAINT "commercial_generators_prices_check" CHECK (
    "costPrice" >= 0 AND "basePrice" >= 0 AND "suggestedPrice" >= 0 AND "minimumPrice" >= 0
  ),
  CONSTRAINT "commercial_generators_tax_check" CHECK ("taxPercentage" >= 0 AND "taxPercentage" <= 100)
);

CREATE UNIQUE INDEX "commercial_generators_internalCode_key"
  ON "commercial_generators"("internalCode");
CREATE UNIQUE INDEX "commercial_generators_catalogItemId_key"
  ON "commercial_generators"("catalogItemId");
CREATE INDEX "commercial_generators_isActive_availability_idx"
  ON "commercial_generators"("isActive", "availability");
CREATE INDEX "commercial_generators_fuelType_construction_idx"
  ON "commercial_generators"("fuelType", "construction");
CREATE INDEX "commercial_generators_standbyPowerKw_idx"
  ON "commercial_generators"("standbyPowerKw");

ALTER TABLE "commercial_generators"
  ADD CONSTRAINT "commercial_generators_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "commercial_sizing_policies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "standardMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "resistiveMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "motorsMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "pumpsMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "airConditioningMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "elevatorsMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 35,
  "electronicsMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "mixedLoadMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 25,
  "unknownLoadMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "idealReserveMinPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "idealReserveMaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 35,
  "engineeringReviewAboveKw" DOUBLE PRECISION,
  "requireEngineeringSpecialLoads" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_sizing_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_sizing_policies_version_check" CHECK ("version" > 0),
  CONSTRAINT "commercial_sizing_policies_margins_check" CHECK (
    "standardMarginPercent" >= 0 AND
    "resistiveMarginPercent" >= 0 AND
    "motorsMarginPercent" >= 0 AND
    "pumpsMarginPercent" >= 0 AND
    "airConditioningMarginPercent" >= 0 AND
    "elevatorsMarginPercent" >= 0 AND
    "electronicsMarginPercent" >= 0 AND
    "mixedLoadMarginPercent" >= 0 AND
    "unknownLoadMarginPercent" >= 0
  ),
  CONSTRAINT "commercial_sizing_policies_reserve_check" CHECK (
    "idealReserveMinPercent" >= 0 AND
    "idealReserveMaxPercent" >= "idealReserveMinPercent"
  ),
  CONSTRAINT "commercial_sizing_policies_engineering_limit_check" CHECK (
    "engineeringReviewAboveKw" IS NULL OR "engineeringReviewAboveKw" > 0
  )
);

CREATE UNIQUE INDEX "commercial_sizing_policies_name_version_key"
  ON "commercial_sizing_policies"("name", "version");
CREATE INDEX "commercial_sizing_policies_isActive_isDefault_idx"
  ON "commercial_sizing_policies"("isActive", "isDefault");

CREATE UNIQUE INDEX "commercial_sizing_policies_one_default_active_idx"
  ON "commercial_sizing_policies"("isDefault")
  WHERE "isDefault" = true AND "isActive" = true;

INSERT INTO "commercial_sizing_policies" (
  "id",
  "name",
  "version",
  "isDefault",
  "isActive",
  "notes",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'Politica comercial padrao',
  1,
  true,
  true,
  'Valores iniciais editaveis no Manitec Studio. Validar com a engenharia antes da Entrega 02.',
  CURRENT_TIMESTAMP
);
