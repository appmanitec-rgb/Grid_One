-- A sequencia identifica unicamente o produto no sistema legado. O codigo
-- legado pode se repetir para produtos diferentes e deve permanecer pesquisavel.
DROP INDEX IF EXISTS "catalog_items_legacyCode_key";

CREATE INDEX IF NOT EXISTS "catalog_items_legacyCode_idx"
  ON "catalog_items"("legacyCode");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "catalog_items"
    WHERE "legacySequence" IS NOT NULL
    GROUP BY "legacySequence"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel tornar legacySequence unica: existem sequencias duplicadas.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_items_legacySequence_key"
  ON "catalog_items"("legacySequence");

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "legacyData" JSONB;

ALTER TABLE "clients"
  ALTER COLUMN "cnpj" DROP NOT NULL;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "isProvisional" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "legacyData" JSONB;

ALTER TABLE "generators"
  ADD COLUMN IF NOT EXISTS "legacyTechnicalData" JSONB;
