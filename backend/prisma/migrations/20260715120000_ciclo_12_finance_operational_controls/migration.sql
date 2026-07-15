CREATE UNIQUE INDEX IF NOT EXISTS "accounts_receivable_contract_competence_active_uidx"
ON "accounts_receivable" ("contractId", "competenceDate")
WHERE "contractId" IS NOT NULL AND "status" <> 'CANCELED';
