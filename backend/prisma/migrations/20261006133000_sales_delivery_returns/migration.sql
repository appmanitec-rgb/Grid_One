ALTER TYPE "InventoryMovementType" ADD VALUE 'SALES_RETURN';

ALTER TABLE "sales_delivery_items"
ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "sales_returns" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "salesDeliveryItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "receivedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "sales_returns_salesOrderId_createdAt_idx" ON "sales_returns"("salesOrderId", "createdAt");
CREATE INDEX "sales_returns_salesDeliveryItemId_idx" ON "sales_returns"("salesDeliveryItemId");
CREATE UNIQUE INDEX "sales_returns_requestId_key" ON "sales_returns"("requestId");

ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesDeliveryItemId_fkey"
  FOREIGN KEY ("salesDeliveryItemId") REFERENCES "sales_delivery_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
