DO $$ BEGIN
  CREATE TYPE "ClientPersonType" AS ENUM ('INDIVIDUAL', 'LEGAL_ENTITY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "personType" "ClientPersonType" NOT NULL DEFAULT 'LEGAL_ENTITY';
