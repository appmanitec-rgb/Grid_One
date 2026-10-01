ALTER TABLE "visual_document_template_versions"
ADD COLUMN "format" TEXT NOT NULL DEFAULT 'VISUAL',
ADD COLUMN "wordTemplate" BYTEA,
ADD COLUMN "wordFieldMap" JSONB;
