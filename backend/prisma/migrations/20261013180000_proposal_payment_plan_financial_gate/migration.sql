ALTER TABLE "proposals"
  ADD COLUMN "paymentPlan" JSONB,
  ADD COLUMN "downPaymentConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "downPaymentConfirmedById" TEXT;

ALTER TABLE "accounts_receivable"
  ADD COLUMN "sourceProposalId" TEXT,
  ADD COLUMN "proposalPaymentStage" TEXT,
  ADD COLUMN "proposalPaymentKey" TEXT;

CREATE UNIQUE INDEX "accounts_receivable_proposalPaymentKey_key" ON "accounts_receivable"("proposalPaymentKey");
CREATE INDEX "receivable_proposal_stage_status_idx" ON "accounts_receivable"("sourceProposalId", "proposalPaymentStage", "status");
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
