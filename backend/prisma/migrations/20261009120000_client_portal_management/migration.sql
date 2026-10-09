ALTER TABLE "users" ADD COLUMN "portalPermissions" TEXT[] NOT NULL DEFAULT ARRAY['EQUIPMENT','CONTRACTS','PROPOSALS','TICKETS','REQUESTS','REPORTS','DOCUMENTS','FINANCIAL','FEEDBACK']::TEXT[];
ALTER TABLE "clients" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "portalLogoDataUrl" TEXT;
UPDATE "clients" SET "portalEnabled" = true WHERE EXISTS (SELECT 1 FROM "users" WHERE "users"."linkedClientId" = "clients"."id" AND "users"."role" = 'CLIENT');
CREATE TABLE "client_portal_feedbacks" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_portal_feedbacks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_portal_feedbacks_clientId_createdAt_idx" ON "client_portal_feedbacks"("clientId", "createdAt");
ALTER TABLE "client_portal_feedbacks" ADD CONSTRAINT "client_portal_feedbacks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_portal_feedbacks" ADD CONSTRAINT "client_portal_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
