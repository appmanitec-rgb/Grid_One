-- CreateEnum
CREATE TYPE "ProposalPaymentPurpose" AS ENUM ('PARTS', 'SERVICES');

-- CreateEnum
CREATE TYPE "ProposalPaymentMethod" AS ENUM ('PIX', 'BOLETO');

-- AlterEnum
ALTER TYPE "ProposalTechnicianType" ADD VALUE 'ASSISTANT';

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "paymentSelections" JSONB;

-- AlterTable
ALTER TABLE "proposal_scope_templates" ADD COLUMN     "sourceFileName" TEXT;

-- CreateTable
CREATE TABLE "proposal_hourly_rates" (
    "id" TEXT NOT NULL,
    "hourType" "ProposalHourType" NOT NULL,
    "technicianType" "ProposalTechnicianType" NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_hourly_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_payment_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "ProposalPaymentPurpose" NOT NULL,
    "method" "ProposalPaymentMethod" NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "beneficiaryDocument" TEXT,
    "bankName" TEXT,
    "agency" TEXT,
    "accountNumber" TEXT,
    "pixKey" TEXT,
    "pixCopyPaste" TEXT,
    "boletoInstructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_payment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_hourly_rates_isActive_sortOrder_idx" ON "proposal_hourly_rates"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_hourly_rates_hourType_technicianType_key" ON "proposal_hourly_rates"("hourType", "technicianType");

-- CreateIndex
CREATE INDEX "proposal_payment_profiles_purpose_method_isActive_sortOrder_idx" ON "proposal_payment_profiles"("purpose", "method", "isActive", "sortOrder");
