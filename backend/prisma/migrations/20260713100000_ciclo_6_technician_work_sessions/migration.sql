-- Ciclo 6: hardening operacional e apontamento confiavel do tecnico.

ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'CONVERTING_TO_ORDER' AFTER 'IN_PROGRESS';

CREATE TYPE "TimeEntrySource" AS ENUM ('MANUAL', 'MAINTENANCE_ORDER_FINALIZATION', 'CHECK_IN_OUT');
CREATE TYPE "TechnicianWorkSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

ALTER TABLE "time_entries"
  ADD COLUMN "source" "TimeEntrySource" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "technician_work_sessions" (
  "id" TEXT NOT NULL,
  "maintenanceOrderId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "TechnicianWorkSessionStatus" NOT NULL DEFAULT 'OPEN',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "startLatitude" DOUBLE PRECISION,
  "startLongitude" DOUBLE PRECISION,
  "endLatitude" DOUBLE PRECISION,
  "endLongitude" DOUBLE PRECISION,
  "startNote" TEXT,
  "endNote" TEXT,
  "startIp" TEXT,
  "startUserAgent" TEXT,
  "endIp" TEXT,
  "endUserAgent" TEXT,
  "timeEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "technician_work_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technician_work_sessions_timeEntryId_key"
  ON "technician_work_sessions"("timeEntryId");

CREATE INDEX "maintenance_orders_technicianId_status_idx"
  ON "maintenance_orders"("technicianId", "status");
CREATE INDEX "maintenance_orders_generatorId_status_idx"
  ON "maintenance_orders"("generatorId", "status");
CREATE INDEX "maintenance_orders_status_scheduledTo_idx"
  ON "maintenance_orders"("status", "scheduledTo");
CREATE INDEX "service_tickets_technicianId_status_idx"
  ON "service_tickets"("technicianId", "status");
CREATE INDEX "time_entries_source_startedAt_idx"
  ON "time_entries"("source", "startedAt");
CREATE INDEX "technician_work_sessions_technicianId_status_startedAt_idx"
  ON "technician_work_sessions"("technicianId", "status", "startedAt");
CREATE INDEX "technician_work_sessions_maintenanceOrderId_status_idx"
  ON "technician_work_sessions"("maintenanceOrderId", "status");
CREATE INDEX "technician_work_sessions_userId_startedAt_idx"
  ON "technician_work_sessions"("userId", "startedAt");

ALTER TABLE "technician_work_sessions"
  ADD CONSTRAINT "technician_work_sessions_maintenanceOrderId_fkey"
  FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technician_work_sessions"
  ADD CONSTRAINT "technician_work_sessions_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technician_work_sessions"
  ADD CONSTRAINT "technician_work_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technician_work_sessions"
  ADD CONSTRAINT "technician_work_sessions_timeEntryId_fkey"
  FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
