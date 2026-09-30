-- CreateEnum
CREATE TYPE "DowntimeStatus" AS ENUM ('REPORTED', 'TRIAGE', 'IN_REPAIR', 'WAITING_PARTS', 'WAITING_SUPPLIER', 'MONITORING', 'RESTORED', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WarrantyOwner" AS ENUM ('OUR', 'MANUFACTURER');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('OPEN', 'TRIAGE', 'WAITING_DOCUMENTS', 'WAITING_SUPPLIER', 'WAITING_MANUFACTURER', 'APPROVED', 'REJECTED', 'REPAIRING', 'RESOLVED', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OperationAttachmentKind" AS ENUM ('PHOTO', 'REPORT', 'INVOICE', 'PROTOCOL', 'OTHER');

-- CreateTable
CREATE TABLE "machine_downtimes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "generatorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "maintenanceOrderId" TEXT,
    "ticketId" TEXT,
    "status" "DowntimeStatus" NOT NULL DEFAULT 'REPORTED',
    "priority" "TicketPriority" NOT NULL DEFAULT 'HIGH',
    "symptom" TEXT NOT NULL,
    "operationalImpact" TEXT,
    "failureCategory" TEXT,
    "diagnosis" TEXT,
    "temporarySolution" TEXT,
    "rootCause" TEXT,
    "resolution" TEXT,
    "assignedUserId" TEXT,
    "openedByUserId" TEXT,
    "failureStartedAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseDueAt" TIMESTAMP(3),
    "targetRestoreAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_downtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_downtime_events" (
    "id" TEXT NOT NULL,
    "downtimeId" TEXT NOT NULL,
    "fromStatus" "DowntimeStatus",
    "toStatus" "DowntimeStatus",
    "note" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_downtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_cases" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "generatorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "downtimeId" TEXT,
    "maintenanceOrderId" TEXT,
    "supplierId" TEXT,
    "manufacturerId" TEXT,
    "owner" "WarrantyOwner" NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "defectDescription" TEXT NOT NULL,
    "component" TEXT,
    "partNumber" TEXT,
    "serialNumber" TEXT,
    "diagnosis" TEXT,
    "coverageDecision" TEXT,
    "resolution" TEXT,
    "externalProtocol" TEXT,
    "supplierProtocol" TEXT,
    "claimAmount" DOUBLE PRECISION,
    "approvedAmount" DOUBLE PRECISION,
    "coverageEndsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "responseDueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "openedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_case_events" (
    "id" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "fromStatus" "WarrantyStatus",
    "toStatus" "WarrantyStatus",
    "note" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_attachments" (
    "id" TEXT NOT NULL,
    "downtimeId" TEXT,
    "warrantyId" TEXT,
    "kind" "OperationAttachmentKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_downtimes_code_key" ON "machine_downtimes"("code");

-- CreateIndex
CREATE INDEX "machine_downtimes_status_priority_responseDueAt_idx" ON "machine_downtimes"("status", "priority", "responseDueAt");

-- CreateIndex
CREATE INDEX "machine_downtimes_generatorId_status_idx" ON "machine_downtimes"("generatorId", "status");

-- CreateIndex
CREATE INDEX "machine_downtimes_clientId_reportedAt_idx" ON "machine_downtimes"("clientId", "reportedAt");

-- CreateIndex
CREATE INDEX "machine_downtimes_assignedUserId_status_idx" ON "machine_downtimes"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "machine_downtime_events_downtimeId_createdAt_idx" ON "machine_downtime_events"("downtimeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_cases_code_key" ON "warranty_cases"("code");

-- CreateIndex
CREATE INDEX "warranty_cases_status_owner_responseDueAt_idx" ON "warranty_cases"("status", "owner", "responseDueAt");

-- CreateIndex
CREATE INDEX "warranty_cases_generatorId_status_idx" ON "warranty_cases"("generatorId", "status");

-- CreateIndex
CREATE INDEX "warranty_cases_supplierId_status_idx" ON "warranty_cases"("supplierId", "status");

-- CreateIndex
CREATE INDEX "warranty_cases_clientId_createdAt_idx" ON "warranty_cases"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "warranty_case_events_warrantyId_createdAt_idx" ON "warranty_case_events"("warrantyId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_attachments_downtimeId_createdAt_idx" ON "operation_attachments"("downtimeId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_attachments_warrantyId_createdAt_idx" ON "operation_attachments"("warrantyId", "createdAt");

-- AddForeignKey
ALTER TABLE "machine_downtimes" ADD CONSTRAINT "machine_downtimes_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_downtimes" ADD CONSTRAINT "machine_downtimes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_downtimes" ADD CONSTRAINT "machine_downtimes_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_downtimes" ADD CONSTRAINT "machine_downtimes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "service_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_downtime_events" ADD CONSTRAINT "machine_downtime_events_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "machine_downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "machine_downtimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_case_events" ADD CONSTRAINT "warranty_case_events_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranty_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_downtimeId_fkey" FOREIGN KEY ("downtimeId") REFERENCES "machine_downtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranty_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_exactly_one_case" CHECK (("downtimeId" IS NOT NULL) <> ("warrantyId" IS NOT NULL));

ALTER TABLE "warranty_cases" ADD CONSTRAINT "warranty_cases_nonnegative_amounts" CHECK (("claimAmount" IS NULL OR "claimAmount" >= 0) AND ("approvedAmount" IS NULL OR "approvedAmount" >= 0));
