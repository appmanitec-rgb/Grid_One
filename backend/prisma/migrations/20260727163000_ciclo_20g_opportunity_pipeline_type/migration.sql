CREATE TYPE "SalesOpportunityPipeline" AS ENUM (
  'COMMERCIAL_01_GENERATORS',
  'COMMERCIAL_02_CONTRACTS',
  'COMMERCIAL_03_PARTS_SERVICES'
);

CREATE TYPE "SalesOpportunityType" AS ENUM (
  'GENERATOR_SALE',
  'GENERATOR_RENTAL',
  'INSTALLATION_RETROFIT',
  'MAINTENANCE_CONTRACT',
  'CONTRACT_RENEWAL',
  'CONTRACT_EXPANSION',
  'PARTS_SALE',
  'FIELD_SERVICE',
  'EMERGENCY_CORRECTIVE',
  'OTHER'
);

ALTER TABLE "sales_opportunities"
  ADD COLUMN "pipeline" "SalesOpportunityPipeline" NOT NULL DEFAULT 'COMMERCIAL_03_PARTS_SERVICES',
  ADD COLUMN "opportunityType" "SalesOpportunityType" NOT NULL DEFAULT 'FIELD_SERVICE';

CREATE INDEX "sales_opportunities_pipeline_stage_idx" ON "sales_opportunities"("pipeline", "stage");
CREATE INDEX "sales_opportunities_opportunityType_idx" ON "sales_opportunities"("opportunityType");
