-- Corrige copias criadas pelo fluxo antigo: a nova revisao deve ser um rascunho editavel.
UPDATE "proposals"
SET "status" = 'DRAFT'
WHERE "parentProposalId" IS NOT NULL
  AND "status" = 'REVISION_REQUIRED';

-- A versao substituida fica imutavel e identificada como revisada.
UPDATE "proposals" source
SET "status" = 'REVISED'
WHERE source."status" NOT IN ('REVISION_REQUIRED', 'REJECTED')
  AND EXISTS (
    SELECT 1
    FROM "proposals" revision
    WHERE revision."parentProposalId" = source."id"
  );
