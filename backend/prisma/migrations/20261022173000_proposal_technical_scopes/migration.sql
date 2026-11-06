-- Additive only: no backfill, catalog classification or automatic library seed.
ALTER TABLE "proposals" ADD COLUMN "technicalScopeSnapshot" JSONB;

CREATE TABLE "technical_scope_families" (
 "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "definitionJson" JSONB, "version" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "technical_scope_families_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "technical_scope_families_kind_check" CHECK ("kind" IN ('MATERIAL','SERVICE'))
);
CREATE UNIQUE INDEX "technical_scope_families_code_key" ON "technical_scope_families"("code");
CREATE INDEX "technical_scope_families_isActive_kind_idx" ON "technical_scope_families"("isActive","kind");

CREATE TABLE "technical_scope_procedures" (
 "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT, "definitionJson" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "technical_scope_procedures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "technical_scope_procedures_code_key" ON "technical_scope_procedures"("code");
CREATE INDEX "technical_scope_procedures_isActive_category_idx" ON "technical_scope_procedures"("isActive","category");

CREATE TABLE "catalog_technical_profiles" (
 "id" TEXT NOT NULL, "catalogItemId" TEXT NOT NULL, "familyCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "procedureCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "includedProcedureCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "compatibility" JSONB, "isActive" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "catalog_technical_profiles_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "catalog_technical_profiles_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_technical_profiles_catalogItemId_key" ON "catalog_technical_profiles"("catalogItemId");
CREATE INDEX "catalog_technical_profiles_isActive_idx" ON "catalog_technical_profiles"("isActive");

CREATE TABLE "proposal_technical_scope_versions" (
 "id" TEXT NOT NULL, "proposalId" TEXT NOT NULL, "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "text" TEXT NOT NULL,
 "sourceHash" TEXT NOT NULL, "actorUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "proposal_technical_scope_versions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "proposal_technical_scope_versions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "proposal_technical_scope_versions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "proposal_technical_scope_versions_proposalId_version_key" ON "proposal_technical_scope_versions"("proposalId","version");
CREATE INDEX "proposal_technical_scope_versions_proposalId_createdAt_idx" ON "proposal_technical_scope_versions"("proposalId","createdAt");
CREATE INDEX "proposal_technical_scope_versions_actorUserId_createdAt_idx" ON "proposal_technical_scope_versions"("actorUserId","createdAt");
