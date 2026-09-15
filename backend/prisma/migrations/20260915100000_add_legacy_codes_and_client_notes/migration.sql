ALTER TABLE "clients"
  ADD COLUMN "legacyCode" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "suppliers"
  ADD COLUMN "legacyCode" TEXT;

ALTER TABLE "generators"
  ADD COLUMN "legacyCode" TEXT;

CREATE UNIQUE INDEX "clients_legacyCode_key" ON "clients"("legacyCode");
CREATE UNIQUE INDEX "suppliers_legacyCode_key" ON "suppliers"("legacyCode");
CREATE UNIQUE INDEX "generators_legacyCode_key" ON "generators"("legacyCode");
