CREATE TABLE "catalog_pricing_policies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemType" "ItemType" NOT NULL,
  "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "profitMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "operationalCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "serviceCalculationMode" TEXT NOT NULL DEFAULT 'FIXED_PRICE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_pricing_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_pricing_policies_itemType_isActive_isDefault_idx"
  ON "catalog_pricing_policies"("itemType", "isActive", "isDefault");

INSERT INTO "catalog_pricing_policies" (
  "id",
  "name",
  "itemType",
  "salesTaxPercent",
  "commissionPercent",
  "profitMarginPercent",
  "operationalCostPercent",
  "serviceCalculationMode",
  "isDefault",
  "isActive",
  "notes"
) VALUES
  (
    gen_random_uuid()::text,
    'Padrao pecas e produtos',
    'PART',
    0,
    0,
    30,
    0,
    'SUPPLIER_COST_MARKUP',
    true,
    true,
    'Politica editavel no Manitec Studio. Usada para calcular preco de venda a partir do custo efetivo da cotacao.'
  ),
  (
    gen_random_uuid()::text,
    'Padrao servicos',
    'SERVICE',
    0,
    0,
    0,
    0,
    'FIXED_PRICE',
    true,
    true,
    'Servico usa preco informado no cadastro/proposta, sem fornecedor obrigatorio.'
  );
