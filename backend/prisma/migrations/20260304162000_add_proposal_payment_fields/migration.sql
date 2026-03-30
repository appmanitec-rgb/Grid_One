-- AlterTable
ALTER TABLE "proposals"
ADD COLUMN "paymentTerm" TEXT,
ADD COLUMN "deliveryLeadTimeDays" INTEGER,
ADD COLUMN "paymentDetails" TEXT,
ADD COLUMN "hasDownPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "downPaymentAmount" DOUBLE PRECISION,
ADD COLUMN "installmentCount" INTEGER,
ADD COLUMN "installmentIntervalDays" INTEGER DEFAULT 30,
ADD COLUMN "firstDueDate" TIMESTAMP(3);
