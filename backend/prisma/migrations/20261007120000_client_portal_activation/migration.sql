CREATE TABLE "client_portal_activations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT,

    CONSTRAINT "client_portal_activations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_portal_activations_tokenHash_key" ON "client_portal_activations"("tokenHash");
CREATE INDEX "client_portal_activations_userId_usedAt_expiresAt_idx" ON "client_portal_activations"("userId", "usedAt", "expiresAt");

ALTER TABLE "client_portal_activations" ADD CONSTRAINT "client_portal_activations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
