-- New enums
CREATE TYPE "UserAvailabilityStatus" AS ENUM (
  'AVAILABLE',
  'ON_SERVICE',
  'IN_TRANSIT',
  'OFF_DUTY',
  'VACATION'
);

CREATE TYPE "SkillLevel" AS ENUM (
  'TRAINEE',
  'JUNIOR',
  'PLENO',
  'SENIOR',
  'MASTER'
);

CREATE TYPE "ApprovalType" AS ENUM ('BUDGET_DISCOUNT', 'RVT_SIGNOFF');

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "AuditDomain" AS ENUM ('USERS', 'MAINTENANCE_ORDERS', 'PROPOSALS');

CREATE TYPE "UserCertificationScope" AS ENUM ('SAFETY', 'TECHNICAL');

-- Expand UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ENGINEER_APPLICATION';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LOGISTICS';

-- Alter users
ALTER TABLE "users"
ADD COLUMN "functionalId" TEXT,
ADD COLUMN "documentId" TEXT,
ADD COLUMN "profilePhotoUrl" TEXT,
ADD COLUMN "managerId" TEXT,
ADD COLUMN "availabilityStatus" "UserAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "availabilityUpdatedAt" TIMESTAMP(3),
ADD COLUMN "skillLevel" "SkillLevel" NOT NULL DEFAULT 'JUNIOR',
ADD COLUMN "regionTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "digitalSignatureUrl" TEXT,
ADD COLUMN "salesTargetMonthly" DOUBLE PRECISION,
ADD COLUMN "kpiTargetJson" JSONB,
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfaSecretEncrypted" TEXT,
ADD COLUMN "mfaRecoveryCodesHash" JSONB;

-- Presence table
CREATE TABLE "user_presences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "speedKmh" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "batteryLevel" INTEGER,
  "source" TEXT DEFAULT 'MOBILE',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_presences_pkey" PRIMARY KEY ("id")
);

-- Certifications table
CREATE TABLE "user_certifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "scope" "UserCertificationScope" NOT NULL DEFAULT 'SAFETY',
  "issuer" TEXT,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_certifications_pkey" PRIMARY KEY ("id")
);

-- Manufacturer specialties table
CREATE TABLE "user_manufacturer_specialties" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "level" "SkillLevel" NOT NULL DEFAULT 'JUNIOR',
  "validUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_manufacturer_specialties_pkey" PRIMARY KEY ("id")
);

-- Approval requests
CREATE TABLE "approval_requests" (
  "id" TEXT NOT NULL,
  "type" "ApprovalType" NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "approverUserId" TEXT NOT NULL,
  "requestNote" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- System audit
CREATE TABLE "system_audit_logs" (
  "id" TEXT NOT NULL,
  "domain" "AuditDomain" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "beforePayload" JSONB,
  "afterPayload" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "users_managerId_idx" ON "users"("managerId");
CREATE INDEX "users_availabilityStatus_idx" ON "users"("availabilityStatus");
CREATE INDEX "users_skillLevel_idx" ON "users"("skillLevel");
CREATE INDEX "user_presences_userId_recordedAt_idx" ON "user_presences"("userId", "recordedAt");
CREATE INDEX "user_presences_recordedAt_idx" ON "user_presences"("recordedAt");
CREATE INDEX "user_certifications_userId_code_validUntil_idx" ON "user_certifications"("userId", "code", "validUntil");
CREATE INDEX "user_manufacturer_specialties_userId_manufacturer_idx" ON "user_manufacturer_specialties"("userId", "manufacturer");
CREATE INDEX "approval_requests_status_approverUserId_createdAt_idx" ON "approval_requests"("status", "approverUserId", "createdAt");
CREATE INDEX "approval_requests_entityType_entityId_idx" ON "approval_requests"("entityType", "entityId");
CREATE INDEX "system_audit_logs_domain_entityType_entityId_createdAt_idx" ON "system_audit_logs"("domain", "entityType", "entityId", "createdAt");
CREATE INDEX "system_audit_logs_actorUserId_createdAt_idx" ON "system_audit_logs"("actorUserId", "createdAt");

-- Foreign keys
ALTER TABLE "users"
ADD CONSTRAINT "users_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_presences"
ADD CONSTRAINT "user_presences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_certifications"
ADD CONSTRAINT "user_certifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_manufacturer_specialties"
ADD CONSTRAINT "user_manufacturer_specialties_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_approverUserId_fkey"
FOREIGN KEY ("approverUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "system_audit_logs"
ADD CONSTRAINT "system_audit_logs_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
