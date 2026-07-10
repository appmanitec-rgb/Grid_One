-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DeliveryDocumentType" AS ENUM ('PROPOSAL', 'CONTRACT', 'ORDER');

-- CreateTable
CREATE TABLE "document_share_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "documentType" "DeliveryDocumentType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentCode" TEXT,
    "documentTitle" TEXT,
    "clientId" TEXT,
    "counterpartName" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "createdByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedAt" TIMESTAMP(3),
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_share_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_deliveries" (
    "id" TEXT NOT NULL,
    "documentType" "DeliveryDocumentType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentCode" TEXT,
    "documentTitle" TEXT,
    "clientId" TEXT,
    "counterpartName" TEXT,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientName" TEXT,
    "recipientTarget" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "shareTokenId" TEXT,
    "payloadSnapshot" JSONB,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_share_tokens_tokenHash_key" ON "document_share_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "document_share_tokens_documentType_documentId_idx" ON "document_share_tokens"("documentType", "documentId");

-- CreateIndex
CREATE INDEX "document_share_tokens_clientId_expiresAt_idx" ON "document_share_tokens"("clientId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_deliveries_shareTokenId_key" ON "document_deliveries"("shareTokenId");

-- CreateIndex
CREATE INDEX "document_deliveries_documentType_documentId_idx" ON "document_deliveries"("documentType", "documentId");

-- CreateIndex
CREATE INDEX "document_deliveries_clientId_createdAt_idx" ON "document_deliveries"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "document_deliveries_createdByUserId_createdAt_idx" ON "document_deliveries"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "document_deliveries_status_createdAt_idx" ON "document_deliveries"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "document_share_tokens" ADD CONSTRAINT "document_share_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_share_tokens" ADD CONSTRAINT "document_share_tokens_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_shareTokenId_fkey" FOREIGN KEY ("shareTokenId") REFERENCES "document_share_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
