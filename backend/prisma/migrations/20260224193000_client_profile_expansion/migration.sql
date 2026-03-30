DO $$ BEGIN
  CREATE TYPE "ClientType" AS ENUM ('CONTRACT', 'NO_CONTRACT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClientContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT_COMPANY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClientAddressType" AS ENUM ('BILLING', 'INSTALLATION', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "stateRegistration" TEXT,
  ADD COLUMN IF NOT EXISTS "municipalRegistration" TEXT,
  ADD COLUMN IF NOT EXISTS "preferences" TEXT,
  ADD COLUMN IF NOT EXISTS "segment" TEXT,
  ADD COLUMN IF NOT EXISTS "clientType" "ClientType" NOT NULL DEFAULT 'NO_CONTRACT';

CREATE TABLE IF NOT EXISTS "client_addresses" (
  "id" TEXT NOT NULL,
  "type" "ClientAddressType" NOT NULL,
  "street" TEXT NOT NULL,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "zipCode" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "country" TEXT DEFAULT 'BR',
  "clientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "client_contacts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ClientContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "role" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "email" TEXT,
  "clientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "client_addresses"
    ADD CONSTRAINT "client_addresses_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "client_contacts"
    ADD CONSTRAINT "client_contacts_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
