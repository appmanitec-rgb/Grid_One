-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELED');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALES_DELIVERY';

-- AlterTable
ALTER TABLE "accounts_receivable" ADD COLUMN     "salesOrderId" TEXT;

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'OPEN',
    "totalValue" DECIMAL(15,2) NOT NULL,
    "paymentTerm" TEXT,
    "notes" TEXT,
    "closedReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "proposalItemId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "totalPrice" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_allocations" (
    "id" TEXT NOT NULL,
    "salesOrderItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "pickedQty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_deliveries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "shippingReference" TEXT,
    "notes" TEXT,
    "deliveredByUserId" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_delivery_items" (
    "id" TEXT NOT NULL,
    "salesDeliveryId" TEXT NOT NULL,
    "salesOrderItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sales_delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_code_key" ON "sales_orders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_proposalId_key" ON "sales_orders"("proposalId");

-- CreateIndex
CREATE INDEX "sales_orders_clientId_status_createdAt_idx" ON "sales_orders"("clientId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_items_proposalItemId_key" ON "sales_order_items"("proposalItemId");

-- CreateIndex
CREATE INDEX "sales_order_items_salesOrderId_idx" ON "sales_order_items"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_allocations_salesOrderItemId_warehouseId_key" ON "sales_order_allocations"("salesOrderItemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_deliveries_code_key" ON "sales_deliveries"("code");

-- CreateIndex
CREATE INDEX "sales_deliveries_salesOrderId_deliveredAt_idx" ON "sales_deliveries"("salesOrderId", "deliveredAt");

-- CreateIndex
CREATE INDEX "sales_delivery_items_salesOrderItemId_idx" ON "sales_delivery_items"("salesOrderItemId");

CREATE UNIQUE INDEX "sales_delivery_items_salesDeliveryId_salesOrderItemId_warehouseId_key" ON "sales_delivery_items"("salesDeliveryId", "salesOrderItemId", "warehouseId");

CREATE INDEX "accounts_receivable_salesOrderId_idx" ON "accounts_receivable"("salesOrderId");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_proposalItemId_fkey" FOREIGN KEY ("proposalItemId") REFERENCES "proposal_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_allocations" ADD CONSTRAINT "sales_order_allocations_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_allocations" ADD CONSTRAINT "sales_order_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_items" ADD CONSTRAINT "sales_delivery_items_salesDeliveryId_fkey" FOREIGN KEY ("salesDeliveryId") REFERENCES "sales_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_items" ADD CONSTRAINT "sales_delivery_items_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_items" ADD CONSTRAINT "sales_delivery_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_quantities_check" CHECK ("quantity" > 0 AND "deliveredQty" >= 0 AND "deliveredQty" <= "quantity");
ALTER TABLE "sales_order_allocations" ADD CONSTRAINT "sales_order_allocations_quantities_check" CHECK ("reservedQty" >= 0 AND "pickedQty" >= 0 AND "pickedQty" <= "reservedQty");
ALTER TABLE "sales_delivery_items" ADD CONSTRAINT "sales_delivery_items_quantity_check" CHECK ("quantity" > 0);
