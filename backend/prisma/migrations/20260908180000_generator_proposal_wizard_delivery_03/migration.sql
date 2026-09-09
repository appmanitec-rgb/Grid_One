ALTER TYPE "ProposalType" ADD VALUE IF NOT EXISTS 'GENERATOR_SALE';

ALTER TABLE "proposals"
  ADD COLUMN "commercialGeneratorId" TEXT,
  ADD COLUMN "sizingSnapshot" JSONB;

CREATE INDEX "proposals_commercialGeneratorId_idx"
  ON "proposals"("commercialGeneratorId");

ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_commercialGeneratorId_fkey"
  FOREIGN KEY ("commercialGeneratorId") REFERENCES "commercial_generators"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_generator_source_check"
  CHECK (NOT ("generatorId" IS NOT NULL AND "commercialGeneratorId" IS NOT NULL));
