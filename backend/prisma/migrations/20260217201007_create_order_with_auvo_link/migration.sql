-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "auvoId" TEXT,
    "auvoLink" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "generatorId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
