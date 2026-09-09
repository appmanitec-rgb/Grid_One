ALTER TYPE "ApprovalType" ADD VALUE IF NOT EXISTS 'GENERATOR_PROPOSAL';

CREATE TYPE "ProposalOrigin" AS ENUM ('MANITEC', 'EXTERNAL');

ALTER TABLE "proposals"
  ADD COLUMN "origin" "ProposalOrigin" NOT NULL DEFAULT 'MANITEC',
  ADD COLUMN "commercialSnapshot" JSONB,
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "externalCurrency" TEXT DEFAULT 'BRL',
  ADD COLUMN "externalDocumentStorageKey" TEXT,
  ADD COLUMN "externalDocumentFileName" TEXT,
  ADD COLUMN "externalDocumentMimeType" TEXT,
  ADD COLUMN "externalDocumentSizeBytes" INTEGER,
  ADD COLUMN "externalDocumentChecksumSha256" TEXT,
  ADD COLUMN "postSaleGeneratorId" TEXT,
  ADD COLUMN "postSaleConvertedAt" TIMESTAMP(3);

CREATE INDEX "proposals_origin_status_idx" ON "proposals"("origin", "status");
CREATE INDEX "proposals_postSaleGeneratorId_idx" ON "proposals"("postSaleGeneratorId");

ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_postSaleGeneratorId_fkey"
  FOREIGN KEY ("postSaleGeneratorId") REFERENCES "generators"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_external_document_check"
  CHECK (
    "origin" = 'MANITEC'
    OR (
      "commercialGeneratorId" IS NULL
      AND "sizingSnapshot" IS NULL
    )
  );
