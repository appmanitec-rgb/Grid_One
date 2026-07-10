ALTER TYPE "AuditDomain" ADD VALUE IF NOT EXISTS 'TICKETS';

CREATE TYPE "TicketStatus" AS ENUM (
  'OPEN',
  'TRIAGE',
  'WAITING_CUSTOMER',
  'WAITING_INTERNAL',
  'SCHEDULED',
  'IN_PROGRESS',
  'CONVERTED_TO_ORDER',
  'RESOLVED',
  'CLOSED',
  'CANCELED'
);

CREATE TYPE "TicketPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "TicketOrigin" AS ENUM (
  'CUSTOMER_PORTAL',
  'INTERNAL',
  'PHONE',
  'WHATSAPP',
  'EMAIL',
  'COMMERCIAL',
  'MONITORING'
);

CREATE TYPE "TicketCategory" AS ENUM (
  'CORRECTIVE_MAINTENANCE',
  'PREVENTIVE_REQUEST',
  'EMERGENCY',
  'QUOTE_REQUEST',
  'DOCUMENT_REQUEST',
  'FINANCIAL',
  'CONTRACT',
  'TECHNICAL_SUPPORT',
  'OTHER'
);

CREATE TYPE "TicketCommentAuthorType" AS ENUM (
  'INTERNAL',
  'CUSTOMER',
  'SYSTEM'
);

CREATE TABLE "service_tickets" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "openedByUserId" TEXT,
  "assignedToUserId" TEXT,
  "technicianId" TEXT,
  "generatorId" TEXT,
  "siteId" TEXT,
  "contractId" TEXT,
  "maintenanceOrderId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "TicketCategory" NOT NULL,
  "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "origin" "TicketOrigin" NOT NULL DEFAULT 'INTERNAL',
  "slaResponseDueAt" TIMESTAMP(3),
  "slaResolutionDueAt" TIMESTAMP(3),
  "firstResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "customerVisible" BOOLEAN NOT NULL DEFAULT true,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "internalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_ticket_comments" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "authorType" "TicketCommentAuthorType" NOT NULL,
  "message" TEXT NOT NULL,
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_ticket_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_tickets_code_key" ON "service_tickets"("code");
CREATE UNIQUE INDEX "service_tickets_maintenanceOrderId_key" ON "service_tickets"("maintenanceOrderId");
CREATE INDEX "service_tickets_clientId_status_createdAt_idx" ON "service_tickets"("clientId", "status", "createdAt");
CREATE INDEX "service_tickets_priority_status_idx" ON "service_tickets"("priority", "status");
CREATE INDEX "service_tickets_assignedToUserId_status_idx" ON "service_tickets"("assignedToUserId", "status");
CREATE INDEX "service_tickets_generatorId_status_idx" ON "service_tickets"("generatorId", "status");
CREATE INDEX "service_tickets_contractId_status_idx" ON "service_tickets"("contractId", "status");
CREATE INDEX "service_tickets_slaResponseDueAt_idx" ON "service_tickets"("slaResponseDueAt");
CREATE INDEX "service_tickets_slaResolutionDueAt_idx" ON "service_tickets"("slaResolutionDueAt");
CREATE INDEX "service_ticket_comments_ticketId_createdAt_idx" ON "service_ticket_comments"("ticketId", "createdAt");
CREATE INDEX "service_ticket_comments_authorUserId_createdAt_idx" ON "service_ticket_comments"("authorUserId", "createdAt");

ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_ticket_comments" ADD CONSTRAINT "service_ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "service_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_ticket_comments" ADD CONSTRAINT "service_ticket_comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
