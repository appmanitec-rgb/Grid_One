ALTER TABLE "clients"
  ADD COLUMN "proposalCreationBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proposalBlockReason" TEXT,
  ADD COLUMN "blockedPaymentTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "control_options"
  ADD COLUMN "isBlockedForNewClients" BOOLEAN NOT NULL DEFAULT false;
