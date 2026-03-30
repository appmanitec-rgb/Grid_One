/*
  Warnings:

  - You are about to drop the column `code` on the `catalog_items` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[sku]` on the table `catalog_items` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "catalog_items_code_key";

-- AlterTable
ALTER TABLE "catalog_items" DROP COLUMN "code",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "costPrice" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "profitMargin" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "taxPercentage" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "unit" TEXT DEFAULT 'UN';

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_sku_key" ON "catalog_items"("sku");
