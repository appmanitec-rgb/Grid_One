CREATE TYPE "ExecutionBillingCategory" AS ENUM ('PARTS', 'SERVICES');

ALTER TABLE "accounts_receivable"
  ADD COLUMN "executionBillingCategory" "ExecutionBillingCategory",
  ADD COLUMN "executionBillingKey" TEXT,
  ADD COLUMN "installmentCount" INTEGER,
  ADD COLUMN "installmentNumber" INTEGER;

ALTER TABLE "maintenance_orders" ADD COLUMN "sourceProposalId" TEXT;

CREATE UNIQUE INDEX "accounts_receivable_executionBillingKey_key" ON "accounts_receivable"("executionBillingKey");
CREATE UNIQUE INDEX "maintenance_orders_sourceProposalId_key" ON "maintenance_orders"("sourceProposalId");

ALTER TABLE "maintenance_orders"
  ADD CONSTRAINT "maintenance_orders_sourceProposalId_fkey"
  FOREIGN KEY ("sourceProposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accounts_receivable"
  ADD CONSTRAINT "accounts_receivable_installment_positive"
  CHECK ("installmentNumber" IS NULL OR "installmentNumber" > 0),
  ADD CONSTRAINT "accounts_receivable_installment_count_positive"
  CHECK ("installmentCount" IS NULL OR "installmentCount" > 0);
