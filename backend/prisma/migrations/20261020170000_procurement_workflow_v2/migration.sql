-- AlterEnum
ALTER TYPE "ApprovalType" ADD VALUE 'PURCHASE_QUOTATION';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationEvidence" JSONB,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchEvidence" JSONB,
ADD COLUMN     "generationKey" TEXT,
ADD COLUMN     "otherExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "procurementQuoteId" TEXT,
ADD COLUMN     "workflowVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "fulfillmentMode" TEXT NOT NULL DEFAULT 'WAREHOUSE',
ADD COLUMN     "landedUnitCost" DECIMAL(20,6),
ADD COLUMN     "procurementSelectionId" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_receipts" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "procurement_settings" (
    "id" TEXT NOT NULL DEFAULT 'purchasing',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "procurement_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "justification" TEXT NOT NULL,
    "neededAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "originalReference" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "fulfilledQty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "neededAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "procurement_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_allocations" (
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fulfilledQty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "requestItemId" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "origin" TEXT NOT NULL,
    "clientId" TEXT,
    "orderId" TEXT,
    "contractId" TEXT,
    "generatorId" TEXT,
    "serialNumber" TEXT,
    "salesOrderId" TEXT,
    "warrantyId" TEXT,
    "costCenterId" TEXT,
    "warehouseId" TEXT,

    CONSTRAINT "procurement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_quotes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARATION',
    "round" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "exceptionReason" TEXT,
    "approvalSnapshot" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "neededAt" TIMESTAMP(3),

    CONSTRAINT "procurement_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_quote_sources" (
    "fulfilledQty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "requestItemId" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "procurement_quote_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_invitations" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "notes" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "procurement_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_offers" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "paymentTerm" TEXT NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "warranty" TEXT,
    "notes" TEXT,
    "negotiatedContract" TEXT,
    "freightAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "freightAllocation" TEXT NOT NULL DEFAULT 'VALUE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_offer_items" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "manufacturer" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "discountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "freightShare" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "compatibility" TEXT NOT NULL DEFAULT 'PENDING',
    "technicalReason" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "procurement_offer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_selections" (
    "id" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "offerItemId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "exceptionReason" TEXT,
    "selectedById" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfillmentMode" TEXT NOT NULL DEFAULT 'WAREHOUSE',

    CONSTRAINT "procurement_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_approval_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(20,2),
    "department" TEXT,
    "origin" TEXT,
    "priority" TEXT,
    "costCenterId" TEXT,
    "itemType" TEXT,
    "minimumOffers" INTEGER NOT NULL DEFAULT 1,
    "approverUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_receipts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "legacyReceiptId" TEXT,
    "requestKey" TEXT NOT NULL,
    "warehouseId" TEXT,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiscalReference" TEXT,
    "notes" TEXT,

    CONSTRAINT "procurement_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_receipt_items" (
    "allocations" JSONB NOT NULL DEFAULT '[]',
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "acceptedQty" DECIMAL(20,6) NOT NULL,
    "rejectedQty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "serialNumbers" TEXT[],
    "divergence" TEXT,

    CONSTRAINT "procurement_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_commitments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "recognizedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL DEFAULT '1',
    "accessKey" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "advanceApplied" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL,
    "schedule" JSONB NOT NULL,
    "evidence" TEXT NOT NULL,
    "justification" TEXT,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_installments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "payableId" TEXT NOT NULL,

    CONSTRAINT "procurement_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_attachments" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "procurement_requests_code_key" ON "procurement_requests"("code");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_requests_requestKey_key" ON "procurement_requests"("requestKey");

-- CreateIndex
CREATE INDEX "procurement_requests_status_createdAt_idx" ON "procurement_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "procurement_requests_requesterId_createdAt_idx" ON "procurement_requests"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "procurement_request_items_catalogItemId_idx" ON "procurement_request_items"("catalogItemId");

-- CreateIndex
CREATE INDEX "procurement_allocations_orderId_idx" ON "procurement_allocations"("orderId");

-- CreateIndex
CREATE INDEX "procurement_allocations_contractId_idx" ON "procurement_allocations"("contractId");

-- CreateIndex
CREATE INDEX "procurement_allocations_generatorId_idx" ON "procurement_allocations"("generatorId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_quotes_code_key" ON "procurement_quotes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_quotes_requestKey_key" ON "procurement_quotes"("requestKey");

-- CreateIndex
CREATE INDEX "procurement_quotes_status_createdAt_idx" ON "procurement_quotes"("status", "createdAt");

-- CreateIndex
CREATE INDEX "procurement_quote_items_quoteId_idx" ON "procurement_quote_items"("quoteId");

-- CreateIndex
CREATE INDEX "procurement_quote_sources_requestItemId_idx" ON "procurement_quote_sources"("requestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_quote_sources_quoteItemId_requestItemId_key" ON "procurement_quote_sources"("quoteItemId", "requestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_invitations_quoteId_supplierId_round_key" ON "procurement_invitations"("quoteId", "supplierId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_offers_quoteId_supplierId_round_version_key" ON "procurement_offers"("quoteId", "supplierId", "round", "version");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_offer_items_offerId_quoteItemId_key" ON "procurement_offer_items"("offerId", "quoteItemId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_selections_quoteItemId_key" ON "procurement_selections"("quoteItemId");

-- CreateIndex
CREATE INDEX "procurement_approval_rules_active_minAmount_idx" ON "procurement_approval_rules"("active", "minAmount");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_receipts_legacyReceiptId_key" ON "procurement_receipts"("legacyReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_receipts_requestKey_key" ON "procurement_receipts"("requestKey");

-- CreateIndex
CREATE INDEX "procurement_receipts_orderId_receivedAt_idx" ON "procurement_receipts"("orderId", "receivedAt");

-- CreateIndex
CREATE INDEX "procurement_receipt_items_orderItemId_idx" ON "procurement_receipt_items"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_commitments_orderId_key" ON "procurement_commitments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_invoices_accessKey_key" ON "procurement_invoices"("accessKey");

-- CreateIndex
CREATE INDEX "procurement_invoices_orderId_status_idx" ON "procurement_invoices"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_invoices_supplierId_number_series_key" ON "procurement_invoices"("supplierId", "number", "series");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_installments_payableId_key" ON "procurement_installments"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_installments_invoiceId_number_key" ON "procurement_installments"("invoiceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_attachments_storageKey_key" ON "procurement_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "procurement_attachments_entityType_entityId_idx" ON "procurement_attachments"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_generationKey_key" ON "purchase_orders"("generationKey");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_procurementSelectionId_key" ON "purchase_order_items"("procurementSelectionId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_receipts_idempotencyKey_key" ON "purchase_order_receipts"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_procurementQuoteId_fkey" FOREIGN KEY ("procurementQuoteId") REFERENCES "procurement_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_procurementSelectionId_fkey" FOREIGN KEY ("procurementSelectionId") REFERENCES "procurement_selections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_request_items" ADD CONSTRAINT "procurement_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_request_items" ADD CONSTRAINT "procurement_request_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "procurement_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "maintenance_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranty_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_allocations" ADD CONSTRAINT "procurement_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_quote_items" ADD CONSTRAINT "procurement_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "procurement_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_quote_sources" ADD CONSTRAINT "procurement_quote_sources_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "procurement_quote_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_quote_sources" ADD CONSTRAINT "procurement_quote_sources_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "procurement_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_invitations" ADD CONSTRAINT "procurement_invitations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "procurement_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_invitations" ADD CONSTRAINT "procurement_invitations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_offers" ADD CONSTRAINT "procurement_offers_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "procurement_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_offers" ADD CONSTRAINT "procurement_offers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_offer_items" ADD CONSTRAINT "procurement_offer_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "procurement_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_offer_items" ADD CONSTRAINT "procurement_offer_items_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "procurement_quote_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_offer_items" ADD CONSTRAINT "procurement_offer_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_selections" ADD CONSTRAINT "procurement_selections_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "procurement_quote_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_selections" ADD CONSTRAINT "procurement_selections_offerItemId_fkey" FOREIGN KEY ("offerItemId") REFERENCES "procurement_offer_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_receipts" ADD CONSTRAINT "procurement_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_receipts" ADD CONSTRAINT "procurement_receipts_legacyReceiptId_fkey" FOREIGN KEY ("legacyReceiptId") REFERENCES "purchase_order_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_receipts" ADD CONSTRAINT "procurement_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_receipt_items" ADD CONSTRAINT "procurement_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "procurement_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_receipt_items" ADD CONSTRAINT "procurement_receipt_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_commitments" ADD CONSTRAINT "procurement_commitments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_invoices" ADD CONSTRAINT "procurement_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_invoices" ADD CONSTRAINT "procurement_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_installments" ADD CONSTRAINT "procurement_installments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "procurement_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_installments" ADD CONSTRAINT "procurement_installments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "accounts_payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_attachments" ADD CONSTRAINT "procurement_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
