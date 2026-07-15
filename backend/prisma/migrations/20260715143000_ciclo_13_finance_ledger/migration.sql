CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "FinancialPaymentStatus" AS ENUM ('POSTED', 'REVERSED', 'REVERSAL');
CREATE TYPE "BankMovementType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "BankMovementOriginType" AS ENUM (
  'ACCOUNTS_RECEIVABLE_PAYMENT',
  'ACCOUNTS_PAYABLE_PAYMENT',
  'REVERSAL',
  'MANUAL_ADJUSTMENT',
  'OPENING_BALANCE'
);
CREATE TYPE "BankMovementStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "FinancialPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CommissionRuleTrigger" AS ENUM (
  'PROPOSAL_APPROVED',
  'CONTRACT_CREATED',
  'RECEIVABLE_PAID'
);

ALTER TABLE "accounts_receivable_payments"
  ADD COLUMN "status" "FinancialPaymentStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "originalPaymentId" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "originalMovementId" TEXT,
  ADD COLUMN "reversalMovementId" TEXT;

ALTER TABLE "accounts_payable_payments"
  ADD COLUMN "status" "FinancialPaymentStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "originalPaymentId" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "originalMovementId" TEXT,
  ADD COLUMN "reversalMovementId" TEXT;

ALTER TABLE "accounts_receivable_payments"
  ADD CONSTRAINT "accounts_receivable_payments_originalPaymentId_fkey"
  FOREIGN KEY ("originalPaymentId") REFERENCES "accounts_receivable_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "accounts_receivable_payments_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accounts_payable_payments"
  ADD CONSTRAINT "accounts_payable_payments_originalPaymentId_fkey"
  FOREIGN KEY ("originalPaymentId") REFERENCES "accounts_payable_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "accounts_payable_payments_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "accounts_receivable_payments_originalPaymentId_idx"
  ON "accounts_receivable_payments"("originalPaymentId");
CREATE INDEX "accounts_receivable_payments_status_paidAt_idx"
  ON "accounts_receivable_payments"("status", "paidAt");
CREATE INDEX "accounts_payable_payments_originalPaymentId_idx"
  ON "accounts_payable_payments"("originalPaymentId");
CREATE INDEX "accounts_payable_payments_status_paidAt_idx"
  ON "accounts_payable_payments"("status", "paidAt");

CREATE TABLE "bank_movements" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "type" "BankMovementType" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "movementDate" TIMESTAMP(3) NOT NULL,
  "competenceDate" TIMESTAMP(3),
  "description" TEXT NOT NULL,
  "originType" "BankMovementOriginType" NOT NULL,
  "originId" TEXT NOT NULL,
  "receivableId" TEXT,
  "payableId" TEXT,
  "receivablePaymentId" TEXT,
  "payablePaymentId" TEXT,
  "reversalOfMovementId" TEXT,
  "status" "BankMovementStatus" NOT NULL DEFAULT 'POSTED',
  "createdById" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconciledById" TEXT,
  "reconciliationReference" TEXT,
  "reconciliationNote" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_movements_originType_originId_key"
  ON "bank_movements"("originType", "originId");
CREATE UNIQUE INDEX "bank_movements_reversalOfMovementId_key"
  ON "bank_movements"("reversalOfMovementId");
CREATE INDEX "bank_movements_bankAccountId_movementDate_idx"
  ON "bank_movements"("bankAccountId", "movementDate");
CREATE INDEX "bank_movements_type_movementDate_idx"
  ON "bank_movements"("type", "movementDate");
CREATE INDEX "bank_movements_originType_originId_idx"
  ON "bank_movements"("originType", "originId");
CREATE INDEX "bank_movements_receivableId_idx"
  ON "bank_movements"("receivableId");
CREATE INDEX "bank_movements_payableId_idx"
  ON "bank_movements"("payableId");
CREATE INDEX "bank_movements_status_movementDate_idx"
  ON "bank_movements"("status", "movementDate");

ALTER TABLE "bank_movements"
  ADD CONSTRAINT "bank_movements_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "accounts_payable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_receivablePaymentId_fkey"
  FOREIGN KEY ("receivablePaymentId") REFERENCES "accounts_receivable_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_payablePaymentId_fkey"
  FOREIGN KEY ("payablePaymentId") REFERENCES "accounts_payable_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_reversalOfMovementId_fkey"
  FOREIGN KEY ("reversalOfMovementId") REFERENCES "bank_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_movements_reconciledById_fkey"
  FOREIGN KEY ("reconciledById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "financial_period_closings" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "closeReason" TEXT,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_period_closings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_period_closings_year_month_key"
  ON "financial_period_closings"("year", "month");
CREATE INDEX "financial_period_closings_status_year_month_idx"
  ON "financial_period_closings"("status", "year", "month");

ALTER TABLE "financial_period_closings"
  ADD CONSTRAINT "financial_period_closings_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_period_closings_reopenedById_fkey"
  FOREIGN KEY ("reopenedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "commission_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sellerId" TEXT,
  "role" "UserRole",
  "percentage" DOUBLE PRECISION NOT NULL,
  "trigger" "CommissionRuleTrigger" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_rules_active_trigger_idx"
  ON "commission_rules"("active", "trigger");
CREATE INDEX "commission_rules_sellerId_trigger_active_idx"
  ON "commission_rules"("sellerId", "trigger", "active");
CREATE INDEX "commission_rules_role_trigger_active_idx"
  ON "commission_rules"("role", "trigger", "active");

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "bank_movements" (
  "id",
  "bankAccountId",
  "type",
  "amount",
  "movementDate",
  "competenceDate",
  "description",
  "originType",
  "originId",
  "receivableId",
  "receivablePaymentId",
  "status",
  "createdById",
  "metadata"
)
SELECT
  gen_random_uuid()::text,
  p."bankAccountId",
  CASE WHEN p."amount" >= 0 THEN 'CREDIT'::"BankMovementType" ELSE 'DEBIT'::"BankMovementType" END,
  ABS(p."amount"),
  p."paidAt",
  ar."competenceDate",
  CASE
    WHEN p."amount" >= 0 THEN 'Backfill recebimento: ' || ar."description"
    ELSE 'Backfill estorno recebimento: ' || ar."description"
  END,
  CASE
    WHEN p."amount" >= 0 THEN 'ACCOUNTS_RECEIVABLE_PAYMENT'::"BankMovementOriginType"
    ELSE 'REVERSAL'::"BankMovementOriginType"
  END,
  p."id",
  p."receivableId",
  p."id",
  'POSTED'::"BankMovementStatus",
  p."actorUserId",
  jsonb_build_object('backfill', true)
FROM "accounts_receivable_payments" p
JOIN "accounts_receivable" ar ON ar."id" = p."receivableId"
WHERE p."bankAccountId" IS NOT NULL
ON CONFLICT ("originType", "originId") DO NOTHING;

INSERT INTO "bank_movements" (
  "id",
  "bankAccountId",
  "type",
  "amount",
  "movementDate",
  "competenceDate",
  "description",
  "originType",
  "originId",
  "payableId",
  "payablePaymentId",
  "status",
  "createdById",
  "metadata"
)
SELECT
  gen_random_uuid()::text,
  p."bankAccountId",
  CASE WHEN p."amount" >= 0 THEN 'DEBIT'::"BankMovementType" ELSE 'CREDIT'::"BankMovementType" END,
  ABS(p."amount"),
  p."paidAt",
  COALESCE(ap."competenceDate", ap."dueDate"),
  CASE
    WHEN p."amount" >= 0 THEN 'Backfill pagamento: ' || ap."description"
    ELSE 'Backfill estorno pagamento: ' || ap."description"
  END,
  CASE
    WHEN p."amount" >= 0 THEN 'ACCOUNTS_PAYABLE_PAYMENT'::"BankMovementOriginType"
    ELSE 'REVERSAL'::"BankMovementOriginType"
  END,
  p."id",
  p."payableId",
  p."id",
  'POSTED'::"BankMovementStatus",
  p."actorUserId",
  jsonb_build_object('backfill', true)
FROM "accounts_payable_payments" p
JOIN "accounts_payable" ap ON ap."id" = p."payableId"
WHERE p."bankAccountId" IS NOT NULL
ON CONFLICT ("originType", "originId") DO NOTHING;

UPDATE "accounts_receivable_payments" p
SET "originalMovementId" = m."id"
FROM "bank_movements" m
WHERE m."originType" = 'ACCOUNTS_RECEIVABLE_PAYMENT'
  AND m."originId" = p."id";

UPDATE "accounts_receivable_payments" p
SET "reversalMovementId" = m."id",
    "status" = 'REVERSAL'
FROM "bank_movements" m
WHERE m."originType" = 'REVERSAL'
  AND m."receivablePaymentId" = p."id"
  AND p."amount" < 0;

UPDATE "accounts_payable_payments" p
SET "originalMovementId" = m."id"
FROM "bank_movements" m
WHERE m."originType" = 'ACCOUNTS_PAYABLE_PAYMENT'
  AND m."originId" = p."id";

UPDATE "accounts_payable_payments" p
SET "reversalMovementId" = m."id",
    "status" = 'REVERSAL'
FROM "bank_movements" m
WHERE m."originType" = 'REVERSAL'
  AND m."payablePaymentId" = p."id"
  AND p."amount" < 0;
