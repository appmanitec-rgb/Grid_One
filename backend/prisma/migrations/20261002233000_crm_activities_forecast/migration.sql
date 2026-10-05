CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'VISIT', 'MESSAGE', 'TASK');
CREATE TYPE "CrmActivityStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELED');

ALTER TABLE "sales_opportunities" ADD COLUMN "probabilityPercent" INTEGER;
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_probabilityPercent_check"
  CHECK ("probabilityPercent" IS NULL OR "probabilityPercent" BETWEEN 0 AND 100);

CREATE TABLE "crm_activities" (
  "id" TEXT NOT NULL,
  "type" "CrmActivityType" NOT NULL,
  "status" "CrmActivityStatus" NOT NULL DEFAULT 'COMPLETED',
  "subject" TEXT NOT NULL,
  "details" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "clientId" TEXT NOT NULL,
  "opportunityId" TEXT,
  "createdById" TEXT,
  "ownerId" TEXT,
  CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_activities_clientId_occurredAt_idx" ON "crm_activities"("clientId", "occurredAt");
CREATE INDEX "crm_activities_opportunityId_occurredAt_idx" ON "crm_activities"("opportunityId", "occurredAt");
CREATE INDEX "crm_activities_status_dueAt_idx" ON "crm_activities"("status", "dueAt");
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
