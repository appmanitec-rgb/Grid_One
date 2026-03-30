-- CreateEnum
CREATE TYPE "AutomationRunMode" AS ENUM ('FULL', 'LIGHT');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "mode" "AutomationRunMode" NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_runs_status_startedAt_idx" ON "automation_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "automation_runs_mode_startedAt_idx" ON "automation_runs"("mode", "startedAt");

-- CreateIndex
CREATE INDEX "automation_runs_requestedByUserId_idx" ON "automation_runs"("requestedByUserId");

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
