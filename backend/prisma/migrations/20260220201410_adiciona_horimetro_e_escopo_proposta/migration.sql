-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "discount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "externalNotes" TEXT,
ADD COLUMN     "freight" TEXT DEFAULT 'FOB',
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "generators" ADD COLUMN     "condition" TEXT DEFAULT 'BOM',
ADD COLUMN     "hourMeter" INTEGER,
ALTER COLUMN "model" DROP NOT NULL,
ALTER COLUMN "serialNumber" DROP NOT NULL;
