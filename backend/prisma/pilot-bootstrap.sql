-- Use only on an empty, isolated pilot database after `prisma db push`.
-- Prisma's db push does not materialize the dbgenerated() defaults below.
-- Keep the migration ledger empty: this database was built from the current
-- schema, and no historical migration was applied successfully here.
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

CREATE SEQUENCE IF NOT EXISTS "client_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "equipment_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "agent_code_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "catalog_sku_number_seq" AS INTEGER MINVALUE 0 START WITH 0 INCREMENT BY 1;

ALTER TABLE "clients" ALTER COLUMN "code" SET DEFAULT (nextval('client_code_number_seq')::text || 'CLI');
ALTER TABLE "generators" ALTER COLUMN "code" SET DEFAULT (nextval('equipment_code_number_seq')::text || 'EQP');
ALTER TABLE "users" ALTER COLUMN "code" SET DEFAULT (nextval('agent_code_number_seq')::text || 'AGT');
