-- CreateEnum
CREATE TYPE "SalesOpportunityStage" AS ENUM ('PROSPECTION', 'SITE_SURVEY_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "OpportunityTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "OpportunityLossReason" AS ENUM ('PRICE', 'DEADLINE', 'COMPETITOR', 'PROJECT_CANCELED', 'TECHNICAL_SCOPE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialInspectionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GeneratorLifecycleStatus" AS ENUM ('AVAILABLE', 'LEASED', 'IN_MAINTENANCE', 'SCRAP');

-- CreateEnum
CREATE TYPE "MaintenanceOrderType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSTALLATION', 'DEMOBILIZATION', 'REFUELING');

-- CreateEnum
CREATE TYPE "TelemetryAlarmType" AS ENUM ('NONE', 'LOW_FUEL', 'BATTERY_LOW', 'HIGH_COOLANT_TEMPERATURE', 'LOW_OIL_PRESSURE', 'START_FAILURE', 'GRID_FAILURE');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('MAIN', 'MOBILE');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RESERVATION', 'RELEASE', 'ADJUSTMENT', 'PURCHASE_RECEIPT', 'OS_CONSUMPTION');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AccountsPayableStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AccountsReceivableStatus" AS ENUM ('OPEN', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'TRANSFER', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASHBOX');

-- CreateEnum
CREATE TYPE "PayableCategory" AS ENUM ('TAXES', 'PAYROLL', 'SUPPLIERS', 'FLEET', 'UTILITIES', 'RENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CostCenterType" AS ENUM ('CLIENT', 'CONTRACT', 'GENERATOR', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CostCenterEntryType" AS ENUM ('REVENUE', 'COST', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('TRANSIT', 'WORK', 'PAUSE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'RELEASED', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "HrAssetType" AS ENUM ('EPI', 'TOOL');

-- CreateEnum
CREATE TYPE "HrAssetStatus" AS ENUM ('ACTIVE', 'RETURNED', 'LOST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FleetVehicleStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'BLOCKED');

-- DropIndex
DROP INDEX "client_audit_logs_clientId_createdAt_idx";

-- AlterTable
ALTER TABLE "generators" ADD COLUMN     "currentSiteId" TEXT,
ADD COLUMN     "lifecycleStatus" "GeneratorLifecycleStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "maintenance_orders" ADD COLUMN     "checklistData" JSONB,
ADD COLUMN     "costCenterId" TEXT,
ADD COLUMN     "customerReport" TEXT,
ADD COLUMN     "customerSignatureUrl" TEXT,
ADD COLUMN     "displacementStartedAt" TIMESTAMP(3),
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "hourMeterAfter" INTEGER,
ADD COLUMN     "laborHours" DOUBLE PRECISION,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "siteId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "type" "MaintenanceOrderType" NOT NULL DEFAULT 'CORRECTIVE';

-- AlterTable
ALTER TABLE "modelos" ADD COLUMN     "alternatorModel" TEXT,
ADD COLUMN     "controllerType" TEXT,
ADD COLUMN     "defaultPowerKw" DOUBLE PRECISION,
ADD COLUMN     "engineModel" TEXT;

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "salesOpportunityId" TEXT;

-- AlterTable
ALTER TABLE "service_contracts" ADD COLUMN     "costCenterId" TEXT,
ADD COLUMN     "includesFuelManagement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sales_opportunities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "SalesOpportunityStage" NOT NULL DEFAULT 'PROSPECTION',
    "temperature" "OpportunityTemperature" NOT NULL DEFAULT 'WARM',
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "source" TEXT,
    "notes" TEXT,
    "lossReason" "OpportunityLossReason",
    "lossReasonDetail" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "siteId" TEXT,
    "clientAddressId" TEXT,
    "primaryContactId" TEXT,
    "assignedSellerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_inspections" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CommercialInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requiredPowerKva" DOUBLE PRECISION,
    "voltage" TEXT,
    "qtaDistanceMeters" DOUBLE PRECISION,
    "needsMunck" BOOLEAN NOT NULL DEFAULT false,
    "accessNotes" TEXT,
    "checklistData" JSONB,
    "technicalNotes" TEXT,
    "opportunityId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT,
    "clientAddressId" TEXT,
    "primaryContactId" TEXT,
    "inspectorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_inspection_media" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_inspection_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accessRestrictions" TEXT,
    "baseContactName" TEXT,
    "baseContactPhone" TEXT,
    "notes" TEXT,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generator_manuals" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "version" TEXT,
    "isOffline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generator_manuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_order_materials" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "reservedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_order_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_certifications" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "issuer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "generatorId" TEXT NOT NULL,
    "alarmType" "TelemetryAlarmType" NOT NULL DEFAULT 'NONE',
    "fuelLevelPercent" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "coolantTemperature" DOUBLE PRECISION,
    "oilPressure" DOUBLE PRECISION,
    "gridOnline" BOOLEAN,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'MAIN',
    "technicianId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "physicalQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderPoint" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "freightAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProductsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTerm" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_receipts" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_payable" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "supplierId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competenceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "barcode" TEXT,
    "pixCopyPaste" TEXT,
    "category" "PayableCategory" NOT NULL DEFAULT 'SUPPLIERS',
    "proofUrl" TEXT,
    "costCenterId" TEXT,
    "status" "AccountsPayableStatus" NOT NULL DEFAULT 'OPEN',
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "duplicateHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "type" "BankAccountType" NOT NULL DEFAULT 'CHECKING',
    "agency" TEXT,
    "accountNumber" TEXT,
    "pixKey" TEXT,
    "initialBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "maintenanceOrderId" TEXT,
    "costCenterId" TEXT,
    "description" TEXT NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AccountsReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "lastChargeEmailAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "commissionReleased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_receivable_payments" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_receivable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_payable_payments" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_payable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_logs" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CostCenterType" NOT NULL DEFAULT 'INTERNAL',
    "clientId" TEXT,
    "contractId" TEXT,
    "generatorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_center_entries" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "entryType" "CostCenterEntryType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_center_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maintenanceOrderId" TEXT,
    "status" "TimeEntryStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "transitMinutes" INTEGER NOT NULL DEFAULT 0,
    "workMinutes" INTEGER NOT NULL DEFAULT 0,
    "extraMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "receivableId" TEXT,
    "maintenanceOrderId" TEXT,
    "contractId" TEXT,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "releasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_asset_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "assetType" "HrAssetType" NOT NULL,
    "title" TEXT NOT NULL,
    "caCode" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "signedTermUrl" TEXT,
    "status" "HrAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_vehicles" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "renavam" TEXT,
    "model" TEXT NOT NULL,
    "currentKm" INTEGER NOT NULL DEFAULT 0,
    "avgKmPerLiter" DOUBLE PRECISION,
    "nextOilChangeKm" INTEGER,
    "nextTireChangeKm" INTEGER,
    "nextBeltChangeKm" INTEGER,
    "status" "FleetVehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_allocations" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maintenanceOrderId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "startKm" INTEGER,
    "endKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_opportunities_stage_idx" ON "sales_opportunities"("stage");

-- CreateIndex
CREATE INDEX "sales_opportunities_assignedSellerId_idx" ON "sales_opportunities"("assignedSellerId");

-- CreateIndex
CREATE INDEX "sales_opportunities_clientId_stage_idx" ON "sales_opportunities"("clientId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_inspections_code_key" ON "commercial_inspections"("code");

-- CreateIndex
CREATE INDEX "commercial_inspections_status_idx" ON "commercial_inspections"("status");

-- CreateIndex
CREATE INDEX "commercial_inspections_scheduledAt_idx" ON "commercial_inspections"("scheduledAt");

-- CreateIndex
CREATE INDEX "commercial_inspections_clientId_status_idx" ON "commercial_inspections"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sites_clientId_name_key" ON "sites"("clientId", "name");

-- CreateIndex
CREATE INDEX "maintenance_order_materials_orderId_idx" ON "maintenance_order_materials"("orderId");

-- CreateIndex
CREATE INDEX "technician_certifications_technicianId_code_validUntil_idx" ON "technician_certifications"("technicianId", "code", "validUntil");

-- CreateIndex
CREATE INDEX "telemetry_events_generatorId_receivedAt_idx" ON "telemetry_events"("generatorId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "inventory_balances_catalogItemId_idx" ON "inventory_balances"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_warehouseId_catalogItemId_key" ON "inventory_balances"("warehouseId", "catalogItemId");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouseId_catalogItemId_createdAt_idx" ON "inventory_movements"("warehouseId", "catalogItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_code_key" ON "purchase_orders"("code");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_status_idx" ON "purchase_orders"("supplierId", "status");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_catalogItemId_idx" ON "purchase_order_items"("purchaseOrderId", "catalogItemId");

-- CreateIndex
CREATE INDEX "purchase_order_receipts_purchaseOrderId_receivedAt_idx" ON "purchase_order_receipts"("purchaseOrderId", "receivedAt");

-- CreateIndex
CREATE INDEX "accounts_payable_supplierId_status_dueDate_idx" ON "accounts_payable"("supplierId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "accounts_payable_duplicateHash_idx" ON "accounts_payable"("duplicateHash");

-- CreateIndex
CREATE INDEX "accounts_receivable_clientId_status_dueDate_idx" ON "accounts_receivable"("clientId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "accounts_receivable_contractId_competenceDate_idx" ON "accounts_receivable"("contractId", "competenceDate");

-- CreateIndex
CREATE INDEX "accounts_receivable_payments_receivableId_paidAt_idx" ON "accounts_receivable_payments"("receivableId", "paidAt");

-- CreateIndex
CREATE INDEX "accounts_payable_payments_payableId_paidAt_idx" ON "accounts_payable_payments"("payableId", "paidAt");

-- CreateIndex
CREATE INDEX "financial_audit_logs_module_entityType_entityId_createdAt_idx" ON "financial_audit_logs"("module", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_contractId_key" ON "cost_centers"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_generatorId_key" ON "cost_centers"("generatorId");

-- CreateIndex
CREATE INDEX "cost_centers_type_isActive_idx" ON "cost_centers"("type", "isActive");

-- CreateIndex
CREATE INDEX "cost_center_entries_costCenterId_competenceDate_idx" ON "cost_center_entries"("costCenterId", "competenceDate");

-- CreateIndex
CREATE INDEX "time_entries_userId_startedAt_idx" ON "time_entries"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "time_entries_maintenanceOrderId_startedAt_idx" ON "time_entries"("maintenanceOrderId", "startedAt");

-- CreateIndex
CREATE INDEX "commission_entries_userId_status_idx" ON "commission_entries"("userId", "status");

-- CreateIndex
CREATE INDEX "hr_asset_assignments_userId_status_expiresAt_idx" ON "hr_asset_assignments"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_vehicles_plate_key" ON "fleet_vehicles"("plate");

-- CreateIndex
CREATE INDEX "fleet_vehicles_status_isActive_idx" ON "fleet_vehicles"("status", "isActive");

-- CreateIndex
CREATE INDEX "fleet_allocations_vehicleId_assignedAt_idx" ON "fleet_allocations"("vehicleId", "assignedAt");

-- CreateIndex
CREATE INDEX "fleet_allocations_userId_assignedAt_idx" ON "fleet_allocations"("userId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_costCenterId_key" ON "service_contracts"("costCenterId");

-- AddForeignKey
ALTER TABLE "generators" ADD CONSTRAINT "generators_currentSiteId_fkey" FOREIGN KEY ("currentSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_salesOpportunityId_fkey" FOREIGN KEY ("salesOpportunityId") REFERENCES "sales_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_clientAddressId_fkey" FOREIGN KEY ("clientAddressId") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_assignedSellerId_fkey" FOREIGN KEY ("assignedSellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_clientAddressId_fkey" FOREIGN KEY ("clientAddressId") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspections" ADD CONSTRAINT "commercial_inspections_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_inspection_media" ADD CONSTRAINT "commercial_inspection_media_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "commercial_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generator_manuals" ADD CONSTRAINT "generator_manuals_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "maintenance_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_certifications" ADD CONSTRAINT "technician_certifications_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable_payments" ADD CONSTRAINT "accounts_receivable_payments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable_payments" ADD CONSTRAINT "accounts_receivable_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable_payments" ADD CONSTRAINT "accounts_receivable_payments_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "accounts_payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_generatorId_fkey" FOREIGN KEY ("generatorId") REFERENCES "generators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_center_entries" ADD CONSTRAINT "cost_center_entries_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_asset_assignments" ADD CONSTRAINT "hr_asset_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_asset_assignments" ADD CONSTRAINT "hr_asset_assignments_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_allocations" ADD CONSTRAINT "fleet_allocations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "fleet_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_allocations" ADD CONSTRAINT "fleet_allocations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_allocations" ADD CONSTRAINT "fleet_allocations_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

