CREATE TYPE "ContractRenewalStatus" AS ENUM (
  'DRAFT',
  'IN_ANALYSIS',
  'DOCUMENT_READY',
  'SENT',
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'CANCELED'
);

CREATE TABLE "contract_renewals" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "ContractRenewalStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStartDate" TIMESTAMP(3) NOT NULL,
  "currentEndDate" TIMESTAMP(3) NOT NULL,
  "currentRecurringAmount" DOUBLE PRECISION NOT NULL,
  "currentPartsCoverage" "PartsCoverageType" NOT NULL,
  "proposedStartDate" TIMESTAMP(3) NOT NULL,
  "proposedEndDate" TIMESTAMP(3) NOT NULL,
  "proposedRecurringAmount" DOUBLE PRECISION NOT NULL,
  "proposedPartsCoverage" "PartsCoverageType" NOT NULL,
  "adjustmentPercent" DOUBLE PRECISION,
  "partsNotes" TEXT,
  "customerNotes" TEXT,
  "internalNotes" TEXT,
  "createdByUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_renewals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_renewals_contractId_sequence_key"
  ON "contract_renewals"("contractId", "sequence");

CREATE INDEX "contract_renewals_status_proposedEndDate_idx"
  ON "contract_renewals"("status", "proposedEndDate");

CREATE INDEX "contract_renewals_contractId_createdAt_idx"
  ON "contract_renewals"("contractId", "createdAt");

ALTER TABLE "contract_renewals"
  ADD CONSTRAINT "contract_renewals_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_renewals"
  ADD CONSTRAINT "contract_renewals_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
