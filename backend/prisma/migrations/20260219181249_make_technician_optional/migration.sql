-- DropForeignKey
ALTER TABLE "maintenance_orders" DROP CONSTRAINT "maintenance_orders_technicianId_fkey";

-- AlterTable
ALTER TABLE "maintenance_orders" ALTER COLUMN "technicianId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
