-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PART', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('PARTS', 'SERVICES', 'PARTS_AND_SERVICES', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ItemType" NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "ProposalType" NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "generatorId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "proposalId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,

    CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_code_key" ON "Proposal"("code");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
