ALTER TYPE "AuditDomain" ADD VALUE IF NOT EXISTS 'OPPORTUNITIES';

ALTER TABLE "proposals"
ADD COLUMN "customerDecisionAt" TIMESTAMP(3),
ADD COLUMN "customerDecisionByUserId" TEXT,
ADD COLUMN "customerDecisionSource" TEXT,
ADD COLUMN "customerDecisionNote" TEXT;

ALTER TABLE "proposals"
ADD CONSTRAINT "proposals_customerDecisionByUserId_fkey"
FOREIGN KEY ("customerDecisionByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "proposals_customerDecisionByUserId_idx"
ON "proposals"("customerDecisionByUserId");
