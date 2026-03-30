CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceName" TEXT,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");
CREATE UNIQUE INDEX "auth_sessions_userId_deviceId_key" ON "auth_sessions"("userId", "deviceId");
CREATE INDEX "auth_sessions_expiresAt_revokedAt_idx" ON "auth_sessions"("expiresAt", "revokedAt");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
