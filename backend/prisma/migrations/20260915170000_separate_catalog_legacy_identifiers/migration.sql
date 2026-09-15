ALTER TABLE "catalog_items"
  ADD COLUMN "legacySequence" TEXT,
  ADD COLUMN "radarCode" TEXT;

CREATE INDEX "catalog_items_legacySequence_idx" ON "catalog_items"("legacySequence");
CREATE INDEX "catalog_items_radarCode_idx" ON "catalog_items"("radarCode");

-- Corrige itens trazidos pelo importador anterior, que guardava identificadores
-- legados no JSON tecnico e usava o CODIGO antigo como SKU interno.
UPDATE "catalog_item_identifiers" identifier
SET
  "code" = item."sku",
  "normalizedCode" = upper(regexp_replace(item."sku", '[^a-zA-Z0-9]', '', 'g')),
  "source" = 'codigo_legado'
FROM "catalog_items" item
WHERE identifier."catalogItemId" = item."id"
  AND identifier."type" = 'LEGACY_CODE'
  AND item."technicalSpecs" IS NOT NULL
  AND item."technicalSpecs" ? 'sequencia';

WITH affected AS MATERIALIZED (
  SELECT
    item."id",
    item."sku" AS "oldSku",
    nextval('catalog_sku_number_seq')::integer AS "newNumber",
    CASE WHEN item."type" = 'SERVICE' THEN 'S' ELSE 'O' END AS "areaCode",
    'O'::text AS "familyCode",
    'O'::text AS "applicationCode"
  FROM "catalog_items" item
  WHERE item."technicalSpecs" IS NOT NULL
    AND item."technicalSpecs" ? 'sequencia'
)
UPDATE "catalog_items" item
SET
  "sku" = affected."newNumber"::text || affected."areaCode" || affected."familyCode" || affected."applicationCode",
  "skuNumber" = affected."newNumber",
  "skuAreaId" = area."id",
  "skuFamilyId" = family."id",
  "skuApplicationId" = application."id",
  "legacyCode" = affected."oldSku",
  "legacySequence" = item."technicalSpecs"->>'sequencia',
  "radarCode" = item."technicalSpecs"->>'codigoRadar',
  "ncm" = COALESCE(
    item."ncm",
    CASE
      WHEN item."technicalSpecs"->>'codigoSecundario' ~ '^[0-9]{8}$'
      THEN item."technicalSpecs"->>'codigoSecundario'
      ELSE NULL
    END
  ),
  "technicalSpecs" = item."technicalSpecs"
    - 'sequencia'
    - 'origem'
    - 'tipoDoItem'
    - 'descricaoComplementar'
    - 'codigoSecundario'
    - 'codigoRadar'
    - 'codigoAlternativo'
FROM affected
JOIN "catalog_sku_areas" area ON area."code" = affected."areaCode"
JOIN "catalog_sku_families" family
  ON family."areaId" = area."id" AND family."code" = affected."familyCode"
JOIN "catalog_sku_applications" application
  ON application."code" = affected."applicationCode"
WHERE item."id" = affected."id";

UPDATE "catalog_item_identifiers" identifier
SET
  "code" = item."sku",
  "normalizedCode" = upper(regexp_replace(item."sku", '[^a-zA-Z0-9]', '', 'g'))
FROM "catalog_items" item
WHERE identifier."catalogItemId" = item."id"
  AND identifier."type" = 'INTERNAL_SKU'
  AND item."legacySequence" IS NOT NULL;
