-- AlterTable
ALTER TABLE "generators"
ADD COLUMN "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "client_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "payload" JSONB,
    "clientId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_audit_logs_clientId_createdAt_idx" ON "client_audit_logs"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "generators"
ADD CONSTRAINT "generators_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_audit_logs"
ADD CONSTRAINT "client_audit_logs_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_audit_logs"
ADD CONSTRAINT "client_audit_logs_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
