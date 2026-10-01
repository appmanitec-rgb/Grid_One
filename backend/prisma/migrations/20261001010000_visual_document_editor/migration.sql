CREATE TYPE "VisualDocumentKind" AS ENUM ('PROPOSAL', 'CONTRACT', 'SERVICE_REPORT');

CREATE TABLE "visual_document_fields" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kinds" "VisualDocumentKind"[] NOT NULL,
    "sourcePath" TEXT,
    "fixedValue" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visual_document_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visual_document_templates" (
    "id" TEXT NOT NULL,
    "kind" "VisualDocumentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visual_document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visual_document_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visual_document_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visual_document_template_fields_mapping" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sourcePath" TEXT,
    "fixedValue" TEXT,
    CONSTRAINT "visual_document_template_fields_mapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visual_document_fields_key_key" ON "visual_document_fields"("key");
CREATE INDEX "visual_document_fields_category_label_idx" ON "visual_document_fields"("category", "label");
CREATE INDEX "visual_document_templates_kind_isActive_idx" ON "visual_document_templates"("kind", "isActive");
CREATE UNIQUE INDEX "visual_document_templates_one_active_per_kind" ON "visual_document_templates"("kind") WHERE "isActive" = true;
CREATE UNIQUE INDEX "visual_document_template_versions_templateId_versionNumber_key" ON "visual_document_template_versions"("templateId", "versionNumber");
CREATE UNIQUE INDEX "visual_document_template_fields_mapping_versionId_fieldId_key" ON "visual_document_template_fields_mapping"("versionId", "fieldId");

ALTER TABLE "visual_document_template_versions" ADD CONSTRAINT "visual_document_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "visual_document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visual_document_template_fields_mapping" ADD CONSTRAINT "visual_document_template_fields_mapping_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "visual_document_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visual_document_template_fields_mapping" ADD CONSTRAINT "visual_document_template_fields_mapping_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "visual_document_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
