CREATE TYPE "BankStatementFileType" AS ENUM ('OFX', 'CNAB', 'CSV');
CREATE TYPE "BankStatementImportStatus" AS ENUM (
  'IMPORTED',
  'PARTIALLY_RECONCILED',
  'RECONCILED',
  'CANCELLED'
);
CREATE TYPE "BankStatementEntryMatchStatus" AS ENUM (
  'UNMATCHED',
  'AUTO_MATCHED',
  'MANUAL_MATCHED',
  'IGNORED'
);
CREATE TYPE "BankReconciliationIssueType" AS ENUM (
  'MISSING_MOVEMENT',
  'MISSING_STATEMENT_ENTRY',
  'AMOUNT_MISMATCH',
  'DATE_MISMATCH',
  'DUPLICATE_BANK_ENTRY',
  'IGNORED_ENTRY',
  'MANUAL_ADJUSTMENT'
);
CREATE TYPE "BankReconciliationIssueStatus" AS ENUM (
  'OPEN',
  'RESOLVED',
  'IGNORED'
);

CREATE TABLE "bank_statement_imports" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" "BankStatementFileType" NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "status" "BankStatementImportStatus" NOT NULL DEFAULT 'IMPORTED',
  "checksumSha256" TEXT NOT NULL,
  "metadata" JSONB,

  CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_entries" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "postedDate" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "type" "BankMovementType" NOT NULL,
  "description" TEXT NOT NULL,
  "documentNumber" TEXT,
  "bankReference" TEXT,
  "fitId" TEXT,
  "externalId" TEXT,
  "matchedMovementId" TEXT,
  "matchStatus" "BankStatementEntryMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "confidenceScore" DOUBLE PRECISION,
  "ignoreReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_statement_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_reconciliation_issues" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "statementImportId" TEXT,
  "statementEntryId" TEXT,
  "movementId" TEXT,
  "type" "BankReconciliationIssueType" NOT NULL,
  "status" "BankReconciliationIssueStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_reconciliation_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statement_imports_bankAccountId_checksumSha256_key"
  ON "bank_statement_imports"("bankAccountId", "checksumSha256");
CREATE INDEX "bank_statement_imports_bankAccountId_importedAt_idx"
  ON "bank_statement_imports"("bankAccountId", "importedAt");
CREATE INDEX "bank_statement_imports_status_importedAt_idx"
  ON "bank_statement_imports"("status", "importedAt");

CREATE UNIQUE INDEX "bank_statement_entries_bankAccountId_externalId_key"
  ON "bank_statement_entries"("bankAccountId", "externalId");
CREATE INDEX "bank_statement_entries_importId_postedDate_idx"
  ON "bank_statement_entries"("importId", "postedDate");
CREATE INDEX "bank_statement_entries_bankAccountId_postedDate_idx"
  ON "bank_statement_entries"("bankAccountId", "postedDate");
CREATE INDEX "bank_statement_entries_matchedMovementId_idx"
  ON "bank_statement_entries"("matchedMovementId");
CREATE INDEX "bank_statement_entries_matchStatus_postedDate_idx"
  ON "bank_statement_entries"("matchStatus", "postedDate");

CREATE INDEX "bank_reconciliation_issues_bankAccountId_status_idx"
  ON "bank_reconciliation_issues"("bankAccountId", "status");
CREATE INDEX "bank_reconciliation_issues_statementImportId_idx"
  ON "bank_reconciliation_issues"("statementImportId");
CREATE INDEX "bank_reconciliation_issues_statementEntryId_idx"
  ON "bank_reconciliation_issues"("statementEntryId");
CREATE INDEX "bank_reconciliation_issues_movementId_idx"
  ON "bank_reconciliation_issues"("movementId");
CREATE INDEX "bank_reconciliation_issues_type_status_idx"
  ON "bank_reconciliation_issues"("type", "status");

ALTER TABLE "bank_statement_imports"
  ADD CONSTRAINT "bank_statement_imports_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_statement_imports_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_statement_entries"
  ADD CONSTRAINT "bank_statement_entries_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "bank_statement_imports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_statement_entries_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_statement_entries_matchedMovementId_fkey"
  FOREIGN KEY ("matchedMovementId") REFERENCES "bank_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_issues"
  ADD CONSTRAINT "bank_reconciliation_issues_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_issues_statementImportId_fkey"
  FOREIGN KEY ("statementImportId") REFERENCES "bank_statement_imports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_issues_statementEntryId_fkey"
  FOREIGN KEY ("statementEntryId") REFERENCES "bank_statement_entries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_issues_movementId_fkey"
  FOREIGN KEY ("movementId") REFERENCES "bank_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_reconciliation_issues_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
