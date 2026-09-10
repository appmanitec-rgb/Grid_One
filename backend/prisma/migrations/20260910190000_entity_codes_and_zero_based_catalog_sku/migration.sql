-- Codigos legiveis, independentes por entidade, iniciando em zero.
CREATE SEQUENCE "client_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;
CREATE SEQUENCE "equipment_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;
CREATE SEQUENCE "agent_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;

ALTER TABLE "clients"
  ADD COLUMN "code" TEXT DEFAULT (nextval('client_code_number_seq')::text || 'CLI');
ALTER TABLE "generators"
  ADD COLUMN "code" TEXT DEFAULT (nextval('equipment_code_number_seq')::text || 'EQP');
ALTER TABLE "users"
  ADD COLUMN "code" TEXT DEFAULT (nextval('agent_code_number_seq')::text || 'AGT');

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") - 1 AS number
  FROM "clients"
)
UPDATE "clients" target
SET "code" = ordered.number::text || 'CLI'
FROM ordered
WHERE target."id" = ordered."id";

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") - 1 AS number
  FROM "generators"
)
UPDATE "generators" target
SET "code" = ordered.number::text || 'EQP'
FROM ordered
WHERE target."id" = ordered."id";

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") - 1 AS number
  FROM "users"
)
UPDATE "users" target
SET "code" = ordered.number::text || 'AGT'
FROM ordered
WHERE target."id" = ordered."id";

SELECT setval('client_code_number_seq', COALESCE((SELECT COUNT(*) FROM "clients"), 0), false);
SELECT setval('equipment_code_number_seq', COALESCE((SELECT COUNT(*) FROM "generators"), 0), false);
SELECT setval('agent_code_number_seq', COALESCE((SELECT COUNT(*) FROM "users"), 0), false);

ALTER TABLE "clients" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "generators" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");
CREATE UNIQUE INDEX "generators_code_key" ON "generators"("code");
CREATE UNIQUE INDEX "users_code_key" ON "users"("code");

-- Renumera somente SKUs automaticos, conservando as letras da classificacao.
CREATE TEMPORARY TABLE "catalog_sku_renumber" ON COMMIT DROP AS
SELECT
  item."id",
  row_number() OVER (ORDER BY item."skuNumber" NULLS LAST, item."createdAt", item."id") - 1 AS "newNumber",
  COALESCE(
    area."code" || family."code" || application."code",
    CASE WHEN item."sku" ~* '[A-Z]{3}$' THEN upper(right(item."sku", 3)) END,
    'OOO'
  ) AS "suffix"
FROM "catalog_items" item
LEFT JOIN "catalog_sku_areas" area ON area."id" = item."skuAreaId"
LEFT JOIN "catalog_sku_families" family ON family."id" = item."skuFamilyId"
LEFT JOIN "catalog_sku_applications" application ON application."id" = item."skuApplicationId"
WHERE item."skuNumber" IS NOT NULL;

UPDATE "catalog_items" item
SET
  "sku" = '__RENUMBER__' || item."id",
  "skuNumber" = -(renumber."newNumber" + 1)
FROM "catalog_sku_renumber" renumber
WHERE item."id" = renumber."id";

UPDATE "catalog_items" item
SET
  "sku" = renumber."newNumber"::text || renumber."suffix",
  "skuNumber" = renumber."newNumber"
FROM "catalog_sku_renumber" renumber
WHERE item."id" = renumber."id";

ALTER SEQUENCE "catalog_sku_number_seq" MINVALUE 0 START WITH 0 RESTART WITH 0;
SELECT setval(
  'catalog_sku_number_seq',
  COALESCE((SELECT COUNT(*) FROM "catalog_sku_renumber"), 0),
  false
);
