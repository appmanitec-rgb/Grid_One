ALTER TABLE "users"
ADD COLUMN "linkedClientId" TEXT;

CREATE INDEX "users_linkedClientId_idx" ON "users"("linkedClientId");

ALTER TABLE "users"
ADD CONSTRAINT "users_linkedClientId_fkey"
FOREIGN KEY ("linkedClientId")
REFERENCES "clients"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
