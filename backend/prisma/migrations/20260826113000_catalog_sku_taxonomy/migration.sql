CREATE SEQUENCE IF NOT EXISTS "catalog_sku_number_seq"
  AS INTEGER
  START WITH 123456789
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE "catalog_sku_areas" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_sku_areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_sku_areas_code_format_chk" CHECK (char_length("code") = 1 AND "code" ~ '^[A-Z]$')
);

CREATE TABLE "catalog_sku_families" (
  "id" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_sku_families_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_sku_families_code_format_chk" CHECK (char_length("code") = 1 AND "code" ~ '^[A-Z]$')
);

CREATE TABLE "catalog_sku_applications" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_sku_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_sku_applications_code_format_chk" CHECK (char_length("code") = 1 AND "code" ~ '^[A-Z]$')
);

CREATE TABLE "catalog_sku_rules" (
  "id" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_sku_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "catalog_items"
  ADD COLUMN "skuNumber" INTEGER,
  ADD COLUMN "skuAreaId" TEXT,
  ADD COLUMN "skuFamilyId" TEXT,
  ADD COLUMN "skuApplicationId" TEXT;

CREATE UNIQUE INDEX "catalog_sku_areas_code_key" ON "catalog_sku_areas"("code");
CREATE INDEX "catalog_sku_areas_isActive_sortOrder_idx" ON "catalog_sku_areas"("isActive", "sortOrder");

CREATE UNIQUE INDEX "catalog_sku_families_areaId_code_key" ON "catalog_sku_families"("areaId", "code");
CREATE INDEX "catalog_sku_families_areaId_isActive_sortOrder_idx" ON "catalog_sku_families"("areaId", "isActive", "sortOrder");

CREATE UNIQUE INDEX "catalog_sku_applications_code_key" ON "catalog_sku_applications"("code");
CREATE INDEX "catalog_sku_applications_isActive_sortOrder_idx" ON "catalog_sku_applications"("isActive", "sortOrder");

CREATE UNIQUE INDEX "catalog_sku_rules_areaId_familyId_applicationId_key" ON "catalog_sku_rules"("areaId", "familyId", "applicationId");
CREATE INDEX "catalog_sku_rules_areaId_familyId_isActive_sortOrder_idx" ON "catalog_sku_rules"("areaId", "familyId", "isActive", "sortOrder");
CREATE INDEX "catalog_sku_rules_applicationId_idx" ON "catalog_sku_rules"("applicationId");

CREATE UNIQUE INDEX "catalog_items_skuNumber_key" ON "catalog_items"("skuNumber");
CREATE INDEX "catalog_items_skuAreaId_idx" ON "catalog_items"("skuAreaId");
CREATE INDEX "catalog_items_skuFamilyId_idx" ON "catalog_items"("skuFamilyId");
CREATE INDEX "catalog_items_skuApplicationId_idx" ON "catalog_items"("skuApplicationId");

ALTER TABLE "catalog_sku_families"
  ADD CONSTRAINT "catalog_sku_families_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "catalog_sku_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_sku_rules"
  ADD CONSTRAINT "catalog_sku_rules_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "catalog_sku_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_sku_rules"
  ADD CONSTRAINT "catalog_sku_rules_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "catalog_sku_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_sku_rules"
  ADD CONSTRAINT "catalog_sku_rules_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "catalog_sku_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_skuAreaId_fkey"
  FOREIGN KEY ("skuAreaId") REFERENCES "catalog_sku_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_skuFamilyId_fkey"
  FOREIGN KEY ("skuFamilyId") REFERENCES "catalog_sku_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_skuApplicationId_fkey"
  FOREIGN KEY ("skuApplicationId") REFERENCES "catalog_sku_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "catalog_sku_areas" ("id", "code", "name", "description", "sortOrder") VALUES
  (gen_random_uuid()::text, 'M', 'Mecanica', 'Componentes mecanicos de geradores, motores e conjuntos auxiliares.', 10),
  (gen_random_uuid()::text, 'E', 'Eletrica', 'Componentes eletricos, protecao e conexoes.', 20),
  (gen_random_uuid()::text, 'A', 'Automacao', 'Controladores, sensores, comunicacao e comandos.', 30),
  (gen_random_uuid()::text, 'F', 'Fluidos e quimicos', 'Aditivos, lubrificantes, combustiveis, graxas e arrefecimento.', 40),
  (gen_random_uuid()::text, 'C', 'Consumiveis gerais', 'Materiais de uso interno, EPIs, limpeza e itens administrativos.', 50),
  (gen_random_uuid()::text, 'S', 'Servicos', 'Servicos cadastrados para propostas, compras e execucao tecnica.', 60),
  (gen_random_uuid()::text, 'O', 'Outros', 'Classificacao provisoria ou nao enquadrada nas demais areas.', 90);

INSERT INTO "catalog_sku_families" ("id", "areaId", "code", "name", "sortOrder")
SELECT gen_random_uuid()::text, a."id", v."code", v."name", v."sortOrder"
FROM "catalog_sku_areas" a
JOIN (VALUES
  ('M','F','Filtros',10), ('M','M','Mangueiras',20), ('M','V','Valvulas',30),
  ('M','J','Juntas e vedacoes',40), ('M','P','Bombas',50), ('M','R','Rolamentos',60),
  ('M','C','Correias',70), ('M','A','Acoplamentos',80), ('M','O','Outros',90),
  ('E','B','Baterias',10), ('E','R','Reles',20), ('E','C','Cabos e conexoes',30),
  ('E','D','Disjuntores',40), ('E','F','Fusiveis',50), ('E','M','Motores eletricos',60),
  ('E','T','Transformadores',70), ('E','O','Outros',90),
  ('A','C','Controladores',10), ('A','S','Sensores',20), ('A','M','Modulos de comunicacao',30),
  ('A','I','Interfaces',40), ('A','O','Outros',90),
  ('F','A','Aditivos',10), ('F','L','Lubrificantes',20), ('F','C','Combustiveis',30),
  ('F','G','Graxas',40), ('F','R','Refrigerantes e arrefecimento',50), ('F','O','Outros',90),
  ('C','E','EPIs',10), ('C','F','Ferramentas de uso interno',20), ('C','A','Administrativo',30),
  ('C','L','Limpeza',40), ('C','P','Papelaria',50), ('C','O','Outros',90),
  ('S','M','Manutencao',10), ('S','I','Instalacao',20), ('S','E','Engenharia',30),
  ('S','T','Treinamento',40), ('S','O','Outros',90),
  ('O','O','Outros',90)
) AS v("areaCode", "code", "name", "sortOrder") ON v."areaCode" = a."code";

INSERT INTO "catalog_sku_applications" ("id", "code", "name", "description", "sortOrder") VALUES
  (gen_random_uuid()::text, 'D', 'Diesel', 'Aplicacao em motores, combustivel ou sistemas diesel.', 10),
  (gen_random_uuid()::text, 'G', 'Gas', 'Aplicacao real em sistemas a gas.', 20),
  (gen_random_uuid()::text, 'M', 'Multiplas aplicacoes', 'Usado quando a aplicacao cobre mais de uma matriz tecnica.', 30),
  (gen_random_uuid()::text, 'U', 'Universal', 'Uso universal sem restricao tecnica principal.', 40),
  (gen_random_uuid()::text, 'I', 'Industrial geral', 'Uso industrial geral.', 50),
  (gen_random_uuid()::text, 'A', 'Administrativo', 'Uso administrativo ou de escritorio.', 60),
  (gen_random_uuid()::text, 'T', 'Tecnico operacional', 'Uso tecnico de campo ou oficina.', 70),
  (gen_random_uuid()::text, 'O', 'Outra', 'Aplicacao nao enquadrada nas opcoes principais.', 90);

INSERT INTO "catalog_sku_rules" ("id", "areaId", "familyId", "applicationId", "sortOrder")
SELECT gen_random_uuid()::text, a."id", f."id", app."id", v."sortOrder"
FROM (VALUES
  ('M','F','D',10), ('M','F','G',20), ('M','F','M',30), ('M','F','U',40), ('M','F','I',50), ('M','F','O',90),
  ('M','M','D',10), ('M','M','G',20), ('M','M','M',30), ('M','M','U',40), ('M','M','I',50), ('M','M','O',90),
  ('M','V','D',10), ('M','V','G',20), ('M','V','M',30), ('M','V','U',40), ('M','V','I',50), ('M','V','O',90),
  ('M','J','D',10), ('M','J','G',20), ('M','J','M',30), ('M','J','U',40), ('M','J','I',50), ('M','J','O',90),
  ('M','P','D',10), ('M','P','G',20), ('M','P','M',30), ('M','P','U',40), ('M','P','I',50), ('M','P','O',90),
  ('M','R','D',10), ('M','R','G',20), ('M','R','M',30), ('M','R','U',40), ('M','R','I',50), ('M','R','O',90),
  ('M','C','D',10), ('M','C','G',20), ('M','C','M',30), ('M','C','U',40), ('M','C','I',50), ('M','C','O',90),
  ('M','A','D',10), ('M','A','G',20), ('M','A','M',30), ('M','A','U',40), ('M','A','I',50), ('M','A','O',90),
  ('M','O','D',10), ('M','O','G',20), ('M','O','M',30), ('M','O','U',40), ('M','O','I',50), ('M','O','O',90),
  ('F','A','D',10), ('F','A','M',30), ('F','A','U',40), ('F','A','I',50), ('F','A','O',90),
  ('F','L','D',10), ('F','L','G',20), ('F','L','M',30), ('F','L','U',40), ('F','L','I',50), ('F','L','O',90),
  ('F','C','D',10), ('F','C','G',20), ('F','C','M',30), ('F','C','O',90),
  ('F','G','D',10), ('F','G','G',20), ('F','G','M',30), ('F','G','U',40), ('F','G','I',50), ('F','G','O',90),
  ('F','R','D',10), ('F','R','G',20), ('F','R','M',30), ('F','R','U',40), ('F','R','I',50), ('F','R','O',90),
  ('F','O','D',10), ('F','O','G',20), ('F','O','M',30), ('F','O','U',40), ('F','O','I',50), ('F','O','O',90),
  ('E','B','D',10), ('E','B','G',20), ('E','B','M',30), ('E','B','U',40), ('E','B','I',50), ('E','B','O',90),
  ('E','R','D',10), ('E','R','G',20), ('E','R','M',30), ('E','R','U',40), ('E','R','I',50), ('E','R','O',90),
  ('E','C','D',10), ('E','C','G',20), ('E','C','M',30), ('E','C','U',40), ('E','C','I',50), ('E','C','O',90),
  ('E','D','D',10), ('E','D','G',20), ('E','D','M',30), ('E','D','U',40), ('E','D','I',50), ('E','D','O',90),
  ('E','F','D',10), ('E','F','G',20), ('E','F','M',30), ('E','F','U',40), ('E','F','I',50), ('E','F','O',90),
  ('E','M','D',10), ('E','M','G',20), ('E','M','M',30), ('E','M','U',40), ('E','M','I',50), ('E','M','O',90),
  ('E','T','D',10), ('E','T','G',20), ('E','T','M',30), ('E','T','U',40), ('E','T','I',50), ('E','T','O',90),
  ('E','O','D',10), ('E','O','G',20), ('E','O','M',30), ('E','O','U',40), ('E','O','I',50), ('E','O','O',90),
  ('A','C','D',10), ('A','C','G',20), ('A','C','M',30), ('A','C','U',40), ('A','C','I',50), ('A','C','O',90),
  ('A','S','D',10), ('A','S','G',20), ('A','S','M',30), ('A','S','U',40), ('A','S','I',50), ('A','S','O',90),
  ('A','M','D',10), ('A','M','G',20), ('A','M','M',30), ('A','M','U',40), ('A','M','I',50), ('A','M','O',90),
  ('A','I','D',10), ('A','I','G',20), ('A','I','M',30), ('A','I','U',40), ('A','I','I',50), ('A','I','O',90),
  ('A','O','D',10), ('A','O','G',20), ('A','O','M',30), ('A','O','U',40), ('A','O','I',50), ('A','O','O',90),
  ('C','E','T',10), ('C','E','U',40), ('C','E','O',90),
  ('C','F','T',10), ('C','F','U',40), ('C','F','I',50), ('C','F','O',90),
  ('C','A','A',10), ('C','A','U',40), ('C','A','O',90),
  ('C','L','A',10), ('C','L','T',20), ('C','L','U',40), ('C','L','O',90),
  ('C','P','A',10), ('C','P','U',40), ('C','P','O',90),
  ('C','O','A',10), ('C','O','T',20), ('C','O','U',40), ('C','O','O',90),
  ('S','M','D',10), ('S','M','G',20), ('S','M','M',30), ('S','M','U',40), ('S','M','I',50), ('S','M','O',90),
  ('S','I','D',10), ('S','I','G',20), ('S','I','M',30), ('S','I','U',40), ('S','I','I',50), ('S','I','O',90),
  ('S','E','D',10), ('S','E','G',20), ('S','E','M',30), ('S','E','U',40), ('S','E','I',50), ('S','E','O',90),
  ('S','T','D',10), ('S','T','G',20), ('S','T','M',30), ('S','T','U',40), ('S','T','I',50), ('S','T','O',90),
  ('S','O','D',10), ('S','O','G',20), ('S','O','M',30), ('S','O','U',40), ('S','O','I',50), ('S','O','O',90),
  ('O','O','O',90), ('O','O','U',40)
) AS v("areaCode", "familyCode", "applicationCode", "sortOrder")
JOIN "catalog_sku_areas" a ON a."code" = v."areaCode"
JOIN "catalog_sku_families" f ON f."areaId" = a."id" AND f."code" = v."familyCode"
JOIN "catalog_sku_applications" app ON app."code" = v."applicationCode";

WITH existing_numbers AS (
  SELECT
    "id",
    substring("sku" from '^[0-9]{9}')::integer AS "skuNumber"
  FROM "catalog_items"
  WHERE "sku" ~ '^[0-9]{9}[A-Z]{3}$'
),
unique_existing_numbers AS (
  SELECT "skuNumber"
  FROM existing_numbers
  GROUP BY "skuNumber"
  HAVING COUNT(*) = 1
)
UPDATE "catalog_items" c
SET "skuNumber" = e."skuNumber"
FROM existing_numbers e
JOIN unique_existing_numbers u ON u."skuNumber" = e."skuNumber"
WHERE c."id" = e."id";

SELECT setval(
  'catalog_sku_number_seq',
  GREATEST(
    123456788,
    COALESCE((SELECT MAX("skuNumber") FROM "catalog_items"), 123456788)
  ),
  true
);
