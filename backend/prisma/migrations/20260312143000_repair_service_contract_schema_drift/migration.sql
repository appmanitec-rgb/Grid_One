ALTER TABLE "service_contracts"
ADD COLUMN IF NOT EXISTS "includesFuelManagement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "costCenterId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'service_contracts_costCenterId_key'
  ) THEN
    CREATE UNIQUE INDEX "service_contracts_costCenterId_key"
      ON "service_contracts"("costCenterId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'service_contracts'
      AND constraint_name = 'service_contracts_costCenterId_fkey'
  ) THEN
    ALTER TABLE "service_contracts"
      ADD CONSTRAINT "service_contracts_costCenterId_fkey"
      FOREIGN KEY ("costCenterId")
      REFERENCES "cost_centers"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
