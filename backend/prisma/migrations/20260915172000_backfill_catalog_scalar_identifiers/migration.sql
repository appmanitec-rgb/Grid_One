-- Mantem a tabela de busca de identificadores alinhada aos campos escalares do
-- catalogo. A operacao e idempotente e tambem cobre itens corrigidos por migracoes
-- anteriores que nao possuíam todos os identificadores auxiliares.
UPDATE "catalog_item_identifiers" identifier
SET
  "normalizedCode" = upper(regexp_replace(identifier."code", '[^a-zA-Z0-9]', '', 'g')),
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "catalog_items" item
WHERE identifier."catalogItemId" = item."id"
  AND (
    (identifier."type" = 'INTERNAL_SKU' AND identifier."code" = item."sku")
    OR (identifier."type" = 'LEGACY_CODE' AND identifier."code" = item."legacyCode")
    OR (identifier."source" = 'sequencia_legada' AND identifier."code" = item."legacySequence")
    OR (identifier."source" = 'codigo_radar' AND identifier."code" = item."radarCode")
  );

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  item."id",
  'INTERNAL_SKU',
  item."sku",
  upper(regexp_replace(item."sku", '[^a-zA-Z0-9]', '', 'g')),
  'sku_gerado',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items" item
WHERE item."sku" IS NOT NULL
  AND trim(item."sku") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = item."id"
      AND identifier."type" = 'INTERNAL_SKU'
      AND identifier."code" = item."sku"
  );

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  item."id",
  'LEGACY_CODE',
  item."legacyCode",
  upper(regexp_replace(item."legacyCode", '[^a-zA-Z0-9]', '', 'g')),
  'codigo_legado',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items" item
WHERE item."legacyCode" IS NOT NULL
  AND trim(item."legacyCode") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = item."id"
      AND identifier."type" = 'LEGACY_CODE'
      AND identifier."code" = item."legacyCode"
  );

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "description", "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  item."id",
  'OTHER',
  item."legacySequence",
  upper(regexp_replace(item."legacySequence", '[^a-zA-Z0-9]', '', 'g')),
  'sequencia_legada',
  'Sequencia do sistema anterior',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items" item
WHERE item."legacySequence" IS NOT NULL
  AND trim(item."legacySequence") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = item."id"
      AND identifier."source" = 'sequencia_legada'
      AND identifier."code" = item."legacySequence"
  );

INSERT INTO "catalog_item_identifiers" (
  "id", "catalogItemId", "type", "code", "normalizedCode", "source",
  "description", "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  item."id",
  'CATALOG_CODE',
  item."radarCode",
  upper(regexp_replace(item."radarCode", '[^a-zA-Z0-9]', '', 'g')),
  'codigo_radar',
  'Codigo Radar do sistema anterior',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "catalog_items" item
WHERE item."radarCode" IS NOT NULL
  AND trim(item."radarCode") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_item_identifiers" identifier
    WHERE identifier."catalogItemId" = item."id"
      AND identifier."source" = 'codigo_radar'
      AND identifier."code" = item."radarCode"
  );
