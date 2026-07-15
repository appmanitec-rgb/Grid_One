-- Ciclo 15: normalizacao, sugestoes de matching e auditoria de conciliacao.

ALTER TABLE "bank_statement_entries"
  ADD COLUMN "normalizedDescription" TEXT,
  ADD COLUMN "normalizedDocumentNumber" TEXT,
  ADD COLUMN "normalizedReference" TEXT,
  ADD COLUMN "matchReason" TEXT,
  ADD COLUMN "suggestedMovementId" TEXT,
  ADD COLUMN "suggestionScore" DOUBLE PRECISION,
  ADD COLUMN "suggestionReason" TEXT,
  ADD COLUMN "descriptionTokens" JSONB,
  ADD COLUMN "dateOnly" TIMESTAMP(3);

UPDATE "bank_statement_entries"
SET
  "normalizedDescription" = lower(regexp_replace(coalesce("description", ''), '[^a-zA-Z0-9]+', ' ', 'g')),
  "normalizedDocumentNumber" = nullif(regexp_replace(coalesce("documentNumber", ''), '[^a-zA-Z0-9]+', '', 'g'), ''),
  "normalizedReference" = nullif(lower(regexp_replace(coalesce("bankReference", coalesce("externalId", '')), '[^a-zA-Z0-9]+', '', 'g')), ''),
  "dateOnly" = date_trunc('day', "postedDate");

CREATE INDEX "bank_statement_entries_suggestedMovementId_idx"
  ON "bank_statement_entries"("suggestedMovementId");
