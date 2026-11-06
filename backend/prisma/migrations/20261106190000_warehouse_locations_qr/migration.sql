-- Additive. Existing stock keeps its quantities and has no position until explicitly placed.
ALTER TABLE "warehouses" ADD COLUMN "qrBaseUrl" TEXT;
CREATE TABLE "warehouse_locations" (
 "id" TEXT PRIMARY KEY, "warehouseId" TEXT NOT NULL, "code" TEXT NOT NULL,
 "name" TEXT, "aisle" TEXT, "shelf" TEXT, "level" TEXT, "compartment" TEXT,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "warehouse_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "warehouse_locations_warehouseId_code_key" ON "warehouse_locations"("warehouseId","code");
CREATE UNIQUE INDEX "warehouse_locations_id_warehouseId_key" ON "warehouse_locations"("id","warehouseId");
CREATE INDEX "warehouse_locations_warehouseId_isActive_code_idx" ON "warehouse_locations"("warehouseId","isActive","code");
ALTER TABLE "inventory_balances" ADD COLUMN "locationId" TEXT, ADD COLUMN "lastVerifiedAt" TIMESTAMP(3), ADD COLUMN "lastVerifiedById" TEXT, ADD COLUMN "lastVerifiedByName" TEXT;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_locationId_warehouseId_fkey" FOREIGN KEY ("locationId","warehouseId") REFERENCES "warehouse_locations"("id","warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_balances_locationId_catalogItemId_idx" ON "inventory_balances"("locationId","catalogItemId");
CREATE TABLE "inventory_client_reservations" (
 "id" TEXT PRIMARY KEY, "balanceId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
 "quantity" DOUBLE PRECISION NOT NULL, "remainingQty" DOUBLE PRECISION NOT NULL,
 "notes" TEXT, "neededAt" TIMESTAMP(3), "createdById" TEXT, "createdByName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "inventory_client_reservations_quantity_check" CHECK ("quantity" > 0 AND "quantity" < 'Infinity'::float8 AND "remainingQty" >= 0 AND "remainingQty" <= "quantity"),
 CONSTRAINT "inventory_client_reservations_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "inventory_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "inventory_client_reservations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "inventory_client_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "inventory_client_reservations_balanceId_remainingQty_idx" ON "inventory_client_reservations"("balanceId","remainingQty");
CREATE INDEX "inventory_client_reservations_clientId_createdAt_idx" ON "inventory_client_reservations"("clientId","createdAt");
CREATE TABLE "stock_location_operations" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "payloadHash" TEXT NOT NULL,
 "locationId" TEXT NOT NULL, "balanceId" TEXT, "action" TEXT NOT NULL,
 "actorId" TEXT, "actorName" TEXT NOT NULL, "reason" TEXT,
 "beforeData" JSONB, "afterData" JSONB, "result" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "stock_location_operations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "warehouse_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "stock_location_operations_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "inventory_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "stock_location_operations_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "stock_location_operations_locationId_createdAt_idx" ON "stock_location_operations"("locationId","createdAt");
CREATE INDEX "stock_location_operations_balanceId_createdAt_idx" ON "stock_location_operations"("balanceId","createdAt");

-- Legacy writers share this balance: they cannot release or consume a customer's hold.
CREATE FUNCTION "protect_client_stock_holds"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE held double precision;
BEGIN
 SELECT COALESCE(SUM("remainingQty"),0) INTO held FROM "inventory_client_reservations" WHERE "balanceId"=NEW.id;
 IF held > 0 AND (NEW."reservedQty" + 0.000001 < held OR NEW."physicalQty" + 0.000001 < NEW."reservedQty") THEN
  RAISE EXCEPTION 'Saldo incompatível com as reservas de clientes. Atualize o estoque.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "protect_client_stock_holds" BEFORE UPDATE OF "physicalQty","reservedQty" ON "inventory_balances" FOR EACH ROW EXECUTE FUNCTION "protect_client_stock_holds"();

CREATE FUNCTION "validate_client_stock_hold"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE held double precision; reserved double precision; physical double precision;
BEGIN
 SELECT "reservedQty","physicalQty" INTO reserved,physical FROM "inventory_balances" WHERE id=NEW."balanceId" FOR UPDATE;
 SELECT COALESCE(SUM("remainingQty"),0) INTO held FROM "inventory_client_reservations" WHERE "balanceId"=NEW."balanceId" AND id<>NEW.id;
 IF held + NEW."remainingQty" > reserved + 0.000001 OR held + NEW."remainingQty" > physical + 0.000001 THEN
  RAISE EXCEPTION 'Reserva sem saldo correspondente no estoque.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "validate_client_stock_hold" BEFORE INSERT OR UPDATE ON "inventory_client_reservations" FOR EACH ROW EXECUTE FUNCTION "validate_client_stock_hold"();
