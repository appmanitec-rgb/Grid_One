CREATE TABLE "user_session_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "currentPath" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_session_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_session_activities_userId_sessionId_key"
ON "user_session_activities"("userId", "sessionId");

CREATE INDEX "user_session_activities_lastSeenAt_idx"
ON "user_session_activities"("lastSeenAt");

CREATE INDEX "user_session_activities_userId_lastSeenAt_idx"
ON "user_session_activities"("userId", "lastSeenAt");

ALTER TABLE "user_session_activities"
ADD CONSTRAINT "user_session_activities_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
