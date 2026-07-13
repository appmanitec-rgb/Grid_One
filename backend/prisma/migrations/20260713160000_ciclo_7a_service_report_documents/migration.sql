-- Ciclo 7A: documentos profissionais de laudo, storage seguro e compartilhamento.

ALTER TABLE "service_reports"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "validationToken" TEXT,
  ADD COLUMN "validationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "validationRevokedAt" TIMESTAMP(3),
  ADD COLUMN "documentHash" TEXT;

ALTER TABLE "service_report_evidences"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "storedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "service_report_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "defaultForGeneratorModelId" TEXT,
  "defaultForOrderType" "MaintenanceOrderType",
  "sectionsConfig" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_report_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_report_versions" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "generatedDocumentId" TEXT,
  "createdByUserId" TEXT,
  "changeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_report_share_links" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_report_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_reports_validationToken_key" ON "service_reports"("validationToken");
CREATE INDEX "service_reports_templateId_idx" ON "service_reports"("templateId");
CREATE UNIQUE INDEX "service_report_evidences_storageKey_key" ON "service_report_evidences"("storageKey");
CREATE INDEX "service_report_evidences_checksumSha256_idx" ON "service_report_evidences"("checksumSha256");
CREATE INDEX "service_report_templates_active_idx" ON "service_report_templates"("active");
CREATE INDEX "service_report_templates_defaultForGeneratorModelId_idx" ON "service_report_templates"("defaultForGeneratorModelId");
CREATE INDEX "service_report_templates_defaultForOrderType_idx" ON "service_report_templates"("defaultForOrderType");
CREATE UNIQUE INDEX "service_report_versions_reportId_versionNumber_key" ON "service_report_versions"("reportId", "versionNumber");
CREATE UNIQUE INDEX "service_report_versions_generatedDocumentId_key" ON "service_report_versions"("generatedDocumentId");
CREATE INDEX "service_report_versions_createdByUserId_createdAt_idx" ON "service_report_versions"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "service_report_share_links_tokenHash_key" ON "service_report_share_links"("tokenHash");
CREATE INDEX "service_report_share_links_reportId_expiresAt_idx" ON "service_report_share_links"("reportId", "expiresAt");
CREATE INDEX "service_report_share_links_createdByUserId_createdAt_idx" ON "service_report_share_links"("createdByUserId", "createdAt");

ALTER TABLE "service_reports"
  ADD CONSTRAINT "service_reports_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "service_report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_report_templates"
  ADD CONSTRAINT "service_report_templates_defaultForGeneratorModelId_fkey"
  FOREIGN KEY ("defaultForGeneratorModelId") REFERENCES "modelos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_report_versions"
  ADD CONSTRAINT "service_report_versions_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_report_versions"
  ADD CONSTRAINT "service_report_versions_generatedDocumentId_fkey"
  FOREIGN KEY ("generatedDocumentId") REFERENCES "document_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_report_versions"
  ADD CONSTRAINT "service_report_versions_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_report_share_links"
  ADD CONSTRAINT "service_report_share_links_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_report_share_links"
  ADD CONSTRAINT "service_report_share_links_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "service_report_templates" (
  "id",
  "name",
  "description",
  "active",
  "sectionsConfig",
  "updatedAt"
)
VALUES (
  'default-manitec-service-report',
  'Padrao MANITEC',
  'Template padrao de laudo tecnico com identificacao, checklist, evidencias, assinatura e validacao.',
  true,
  '[
    {"key":"identification","label":"Identificacao","enabled":true,"order":1},
    {"key":"diagnosis","label":"Diagnostico","enabled":true,"order":2},
    {"key":"performedServices","label":"Servicos realizados","enabled":true,"order":3},
    {"key":"checklist","label":"Checklist","enabled":true,"order":4},
    {"key":"materials","label":"Pecas aplicadas","enabled":true,"order":5},
    {"key":"evidences","label":"Evidencias","enabled":true,"order":6},
    {"key":"signature","label":"Assinatura","enabled":true,"order":7},
    {"key":"validation","label":"Validacao","enabled":true,"order":8}
  ]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
