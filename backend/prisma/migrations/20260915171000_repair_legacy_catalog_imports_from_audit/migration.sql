-- Alguns itens importados antes da separacao dos identificadores tiveram o JSON
-- tecnico limpo manualmente. Nesses casos, o log imutavel da importacao e a fonte
-- mais segura para recuperar CODIGO, SEQUENCIA, CODIGORADAR e CODIGO_1.
CREATE TEMP TABLE "_catalog_legacy_import_repair" AS
SELECT DISTINCT ON (item."id")
  item."id" AS "catalogItemId",
  item."sku" AS "oldSku",
  NULLIF(trim(log."afterPayload" #>> '{value,legacySequence}'), '') AS "legacySequence",
  NULLIF(trim(log."afterPayload" #>> '{value,radarCode}'), '') AS "radarCode",
  NULLIF(trim(log."afterPayload" #>> '{value,legacyCode}'), '') AS "secondaryCode",
  nextval('catalog_sku_number_seq')::integer AS "newNumber",
  CASE WHEN item."type" = 'SERVICE' THEN 'S' ELSE 'O' END AS "areaCode",
  'O'::text AS "familyCode",
  'O'::text AS "applicationCode"
FROM "catalog_items" item
JOIN "system_audit_logs" log
  ON log."entityType" = 'CatalogItem'
  AND log."entityId" = item."id"
  AND log."action" = 'IMPORT_CREATE'
WHERE log."afterPayload" #>> '{resource}' = 'catalog'
  AND item."legacySequence" IS NULL
  AND item."sku" ~ '^[0-9]+$'
  AND log."afterPayload" #>> '{value,sku}' = item."sku"
ORDER BY item."id", log."createdAt" DESC;

UPDATE "catalog_item_identifiers" identifier
SET
  "code" = repair."oldSku",
  "normalizedCode" = upper(regexp_replace(repair."oldSku", '[^a-zA-Z0-9]', '', 'g')),
  "source" = 'codigo_legado',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
WHERE identifier."catalogItemId" = repair."catalogItemId"
  AND identifier."type" = 'LEGACY_CODE';

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  repair."catalogItemId",
  'LEGACY_CODE',
  repair."oldSku",
  upper(regexp_replace(repair."oldSku", '[^a-zA-Z0-9]', '', 'g')),
  'codigo_legado',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
WHERE NOT EXISTS (
  SELECT 1
  FROM "catalog_item_identifiers" identifier
  WHERE identifier."catalogItemId" = repair."catalogItemId"
    AND identifier."type" = 'LEGACY_CODE'
);

UPDATE "catalog_item_identifiers" identifier
SET
  "code" = repair."radarCode",
  "normalizedCode" = upper(regexp_replace(repair."radarCode", '[^a-zA-Z0-9]', '', 'g')),
  "source" = 'codigo_radar',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
WHERE identifier."catalogItemId" = repair."catalogItemId"
  AND identifier."type" = 'CATALOG_CODE'
  AND repair."radarCode" IS NOT NULL;

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  repair."catalogItemId",
  'CATALOG_CODE',
  repair."radarCode",
  upper(regexp_replace(repair."radarCode", '[^a-zA-Z0-9]', '', 'g')),
  'codigo_radar',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
WHERE repair."radarCode" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = repair."catalogItemId"
      AND identifier."type" = 'CATALOG_CODE'
  );

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "description", "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  repair."catalogItemId",
  'OTHER',
  repair."legacySequence",
  upper(regexp_replace(repair."legacySequence", '[^a-zA-Z0-9]', '', 'g')),
  'sequencia_legada',
  'Sequencia do sistema anterior',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
WHERE repair."legacySequence" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = repair."catalogItemId"
      AND identifier."source" = 'sequencia_legada'
  );

UPDATE "catalog_items" item
SET
  "sku" = repair."newNumber"::text || repair."areaCode" || repair."familyCode" || repair."applicationCode",
  "skuNumber" = repair."newNumber",
  "skuAreaId" = area."id",
  "skuFamilyId" = family."id",
  "skuApplicationId" = application."id",
  "legacyCode" = repair."oldSku",
  "legacySequence" = repair."legacySequence",
  "radarCode" = repair."radarCode",
  "ncm" = COALESCE(
    item."ncm",
    CASE WHEN repair."secondaryCode" ~ '^[0-9]{8}$' THEN repair."secondaryCode" ELSE NULL END
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_catalog_legacy_import_repair" repair
JOIN "catalog_sku_areas" area ON area."code" = repair."areaCode"
JOIN "catalog_sku_families" family
  ON family."areaId" = area."id" AND family."code" = repair."familyCode"
JOIN "catalog_sku_applications" application
  ON application."code" = repair."applicationCode"
WHERE item."id" = repair."catalogItemId";

UPDATE "catalog_item_identifiers" identifier
SET
  "code" = item."sku",
  "normalizedCode" = upper(regexp_replace(item."sku", '[^a-zA-Z0-9]', '', 'g')),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "catalog_items" item
JOIN "_catalog_legacy_import_repair" repair ON repair."catalogItemId" = item."id"
WHERE identifier."catalogItemId" = item."id"
  AND identifier."type" = 'INTERNAL_SKU';

DROP TABLE "_catalog_legacy_import_repair";
