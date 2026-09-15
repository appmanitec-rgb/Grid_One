DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "catalog_items"
    WHERE "legacyCode" IS NOT NULL AND trim("legacyCode") <> ''
    GROUP BY "legacyCode"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel tornar legacyCode unico: existem codigos legados duplicados.';
  END IF;
END $$;

DROP INDEX IF EXISTS "catalog_items_legacyCode_idx";
CREATE UNIQUE INDEX "catalog_items_legacyCode_key" ON "catalog_items"("legacyCode");
