-- Ciclo 16: perfis de importacao bancaria, divergencias classificadas e fechamento bancario mensal.

ALTER TYPE "BankReconciliationIssueType" ADD VALUE IF NOT EXISTS 'BANK_ENTRY_WITHOUT_MOVEMENT';
ALTER TYPE "BankReconciliationIssueType" ADD VALUE IF NOT EXISTS 'MOVEMENT_WITHOUT_BANK_ENTRY';
ALTER TYPE "BankReconciliationIssueType" ADD VALUE IF NOT EXISTS 'POSSIBLE_MATCH_AMBIGUOUS';
ALTER TYPE "BankReconciliationIssueType" ADD VALUE IF NOT EXISTS 'MANUAL_ADJUSTMENT_REQUIRED';

CREATE TYPE "BankReconciliationClosingStatus" AS ENUM ('OPEN', 'CLOSED', 'REOPENED');

CREATE TABLE "bank_import_profiles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankCode" TEXT,
  "fileType" "BankStatementFileType" NOT NULL,
  "dateFormat" TEXT,
  "decimalSeparator" TEXT,
  "amountMode" TEXT NOT NULL DEFAULT 'SIGNED',
  "columnMapping" JSONB,
  "matchingConfig" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_import_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bank_statement_imports"
  ADD COLUMN "profileId" TEXT;

CREATE TABLE "bank_reconciliation_closings" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "BankReconciliationClosingStatus" NOT NULL DEFAULT 'OPEN',
  "ledgerOpeningBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ledgerClosingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bankStatementOpeningBalance" DOUBLE PRECISION,
  "bankStatementClosingBalance" DOUBLE PRECISION,
  "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unreconciledMovementsCount" INTEGER NOT NULL DEFAULT 0,
  "unreconciledEntriesCount" INTEGER NOT NULL DEFAULT 0,
  "openIssuesCount" INTEGER NOT NULL DEFAULT 0,
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "closeReason" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_reconciliation_closings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_import_profiles_fileType_active_idx"
  ON "bank_import_profiles"("fileType", "active");
CREATE INDEX "bank_import_profiles_bankCode_idx"
  ON "bank_import_profiles"("bankCode");

CREATE INDEX "bank_statement_imports_profileId_idx"
  ON "bank_statement_imports"("profileId");

CREATE UNIQUE INDEX "bank_reconciliation_closings_bankAccountId_year_month_key"
  ON "bank_reconciliation_closings"("bankAccountId", "year", "month");
CREATE INDEX "bank_reconciliation_closings_status_year_month_idx"
  ON "bank_reconciliation_closings"("status", "year", "month");
CREATE INDEX "bank_reconciliation_closings_bankAccountId_status_idx"
  ON "bank_reconciliation_closings"("bankAccountId", "status");

ALTER TABLE "bank_statement_imports"
  ADD CONSTRAINT "bank_statement_imports_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "bank_import_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_closings"
  ADD CONSTRAINT "bank_reconciliation_closings_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_closings_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_closings_reopenedById_fkey"
  FOREIGN KEY ("reopenedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
