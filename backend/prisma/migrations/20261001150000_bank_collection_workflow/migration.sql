CREATE TABLE "bank_collection_agreements" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "transmissionCode" TEXT NOT NULL,
  "beneficiaryName" TEXT NOT NULL,
  "beneficiaryDocument" TEXT NOT NULL,
  "agency" TEXT NOT NULL,
  "agencyDigit" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountDigit" TEXT NOT NULL,
  "walletCode" TEXT NOT NULL DEFAULT '1',
  "registrationForm" TEXT NOT NULL DEFAULT '1',
  "documentType" TEXT NOT NULL DEFAULT '2',
  "nextRemittanceNumber" INTEGER NOT NULL DEFAULT 1,
  "nextOurNumber" INTEGER NOT NULL DEFAULT 1,
  "homologated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_collection_agreements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_agreements_bankAccountId_key" ON "bank_collection_agreements"("bankAccountId");
ALTER TABLE "bank_collection_agreements" ADD CONSTRAINT "bank_collection_agreements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_collection_titles" (
  "id" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "ourNumber" TEXT NOT NULL,
  "speciesCode" TEXT NOT NULL DEFAULT '04',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "invoiceNumber" TEXT,
  "invoiceIssuedAt" TIMESTAMP(3),
  "invoiceAccessKey" TEXT,
  "invoiceUrl" TEXT,
  "lastOccurrenceCode" TEXT,
  "lastOccurrenceAt" TIMESTAMP(3),
  "lastMessage" TEXT,
  "registeredAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_collection_titles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_titles_receivableId_key" ON "bank_collection_titles"("receivableId");
CREATE UNIQUE INDEX "bank_collection_titles_bankAccountId_ourNumber_key" ON "bank_collection_titles"("bankAccountId", "ourNumber");
CREATE UNIQUE INDEX "bank_collection_titles_bankAccountId_documentNumber_key" ON "bank_collection_titles"("bankAccountId", "documentNumber");
CREATE INDEX "bank_collection_titles_status_updatedAt_idx" ON "bank_collection_titles"("status", "updatedAt");
ALTER TABLE "bank_collection_titles" ADD CONSTRAINT "bank_collection_titles_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_collection_titles" ADD CONSTRAINT "bank_collection_titles_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_collection_batches" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GENERATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "sentById" TEXT,
  CONSTRAINT "bank_collection_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_batches_agreementId_sequence_key" ON "bank_collection_batches"("agreementId", "sequence");
CREATE INDEX "bank_collection_batches_status_createdAt_idx" ON "bank_collection_batches"("status", "createdAt");
ALTER TABLE "bank_collection_batches" ADD CONSTRAINT "bank_collection_batches_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "bank_collection_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_collection_batch_items" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "titleId" TEXT NOT NULL,
  CONSTRAINT "bank_collection_batch_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_batch_items_batchId_titleId_key" ON "bank_collection_batch_items"("batchId", "titleId");
CREATE INDEX "bank_collection_batch_items_titleId_idx" ON "bank_collection_batch_items"("titleId");
ALTER TABLE "bank_collection_batch_items" ADD CONSTRAINT "bank_collection_batch_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bank_collection_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_collection_batch_items" ADD CONSTRAINT "bank_collection_batch_items_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "bank_collection_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_collection_return_imports" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT,
  CONSTRAINT "bank_collection_return_imports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_return_imports_agreementId_checksumSha256_key" ON "bank_collection_return_imports"("agreementId", "checksumSha256");
CREATE INDEX "bank_collection_return_imports_importedAt_idx" ON "bank_collection_return_imports"("importedAt");
ALTER TABLE "bank_collection_return_imports" ADD CONSTRAINT "bank_collection_return_imports_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "bank_collection_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_collection_return_events" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "titleId" TEXT,
  "lineNumber" INTEGER NOT NULL,
  "movementCode" TEXT NOT NULL,
  "reasonCodes" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netCreditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "eventDate" TIMESTAMP(3),
  "outcome" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_collection_return_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_collection_return_events_importId_lineNumber_key" ON "bank_collection_return_events"("importId", "lineNumber");
CREATE INDEX "bank_collection_return_events_outcome_createdAt_idx" ON "bank_collection_return_events"("outcome", "createdAt");
ALTER TABLE "bank_collection_return_events" ADD CONSTRAINT "bank_collection_return_events_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_collection_return_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_collection_return_events" ADD CONSTRAINT "bank_collection_return_events_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "bank_collection_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
