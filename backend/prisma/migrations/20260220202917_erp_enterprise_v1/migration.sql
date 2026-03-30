/*
  Warnings:

  - You are about to drop the column `model` on the `generators` table. All the data in the column will be lost.
  - You are about to drop the `CatalogItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Proposal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProposalItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'NORMAL';

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_generatorId_fkey";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalItem" DROP CONSTRAINT "ProposalItem_catalogItemId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalItem" DROP CONSTRAINT "ProposalItem_proposalId_fkey";

-- AlterTable
ALTER TABLE "generators" DROP COLUMN "model",
ADD COLUMN     "modelId" TEXT;

-- DropTable
DROP TABLE "CatalogItem";

-- DropTable
DROP TABLE "Proposal";

-- DropTable
DROP TABLE "ProposalItem";

-- CreateTable
CREATE TABLE "modelos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "type" "ItemType" NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "ProposalType" NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "scope" TEXT,
    "freight" TEXT DEFAULT 'FOB',
    "internalNotes" TEXT,
    "externalNotes" TEXT,
    "discount" DOUBLE PRECISION DEFAULT 0,
    "clientId" TEXT NOT NULL,
    "generatorId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_items" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "proposalId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,

    CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ModelSuggestedItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "modelos_name_key" ON "modelos"("name");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_code_key" ON "catalog_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_code_key" ON "proposals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "_ModelSuggestedItems_AB_unique" ON "_ModelSuggestedItems"("A", "B");

-- CreateIndex
CREATE INDEX "_ModelSuggestedItems_B_index" ON "_ModelSuggestedItems"("B");

-- AddForeignKey
ALTER TABLE "generators" ADD CONSTRAINT "generators_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "modelos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ModelSuggestedItems" ADD CONSTRAINT "_ModelSuggestedItems_A_fkey" FOREIGN KEY ("A") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ModelSuggestedItems" ADD CONSTRAINT "_ModelSuggestedItems_B_fkey" FOREIGN KEY ("B") REFERENCES "modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
