import { BadRequestException } from '@nestjs/common';
import { AuditDomain, Prisma } from '@prisma/client';
import {
  composeTechnicalScope,
  technicalScopeSourceHash,
} from './technical-scope.engine';
import {
  loadTechnicalScopeLibrary,
  resolveTechnicalScopeSource,
  scopeJson,
  type TechnicalSourceInput,
} from './technical-scope-resolution';
import { storedScopeClassifications } from './technical-service-classification';
import type { ScopePreview } from './technical-scope.types';

export type PersistTechnicalScopeInput = TechnicalSourceInput & {
  proposalId: string;
  actorUserId?: string;
  scope?: string | null;
  review?: { sourceHash: string; libraryHash: string; reviewed: boolean };
  previousSnapshot?: unknown;
};
export type ProposalTechnicalScopeSnapshot = ScopePreview & {
  version: number;
  appliedText: string;
  stale: boolean;
  manuallyEdited: boolean;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  definitionSnapshot: unknown;
  inputSnapshot: unknown;
};
function snapshot(value: unknown): ProposalTechnicalScopeSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const row = value as Partial<ProposalTechnicalScopeSnapshot>;
  return typeof row.sourceHash === 'string' &&
    typeof row.generatedText === 'string'
    ? (row as ProposalTechnicalScopeSnapshot)
    : undefined;
}
function signature(value: ProposalTechnicalScopeSnapshot) {
  return JSON.stringify([
    value.sourceHash,
    value.libraryHash,
    value.generatedText,
    value.appliedText,
    value.stale,
    value.manuallyEdited,
  ]);
}
function staleWarning(value: ProposalTechnicalScopeSnapshot) {
  const alerts = Array.isArray(value.alerts) ? value.alerts : [];
  return alerts.some((alert) => alert.code === 'TECHNICAL_REVIEW_STALE')
    ? alerts
    : [
        ...alerts,
        {
          code: 'TECHNICAL_REVIEW_STALE',
          severity: 'warning' as const,
          message:
            'Os itens, equipamento ou biblioteca mudaram. Confira novamente o escopo tecnico antes de aprovar.',
        },
      ];
}
/** Internal transaction helper. It never updates commercial values or authorizes operations. */
export async function persistProposalTechnicalScope(
  tx: Prisma.TransactionClient,
  input: PersistTechnicalScopeInput,
): Promise<Prisma.InputJsonValue | undefined> {
  const previous = snapshot(input.previousSnapshot);
  if (
    !input.review?.reviewed &&
    !previous &&
    !Array.isArray(input.technicalScopeClassifications)
  )
    return undefined;
  const source = await resolveTechnicalScopeSource(tx, {
    ...input,
    technicalScopeClassifications:
      input.technicalScopeClassifications ??
      storedScopeClassifications(previous),
  });
  let result: ProposalTechnicalScopeSnapshot;
  if (input.review?.reviewed || !previous) {
    if (!input.actorUserId)
      throw new BadRequestException(
        'A conferencia tecnica exige um usuario autenticado.',
      );
    const library = await loadTechnicalScopeLibrary(
      tx,
      source.items.flatMap((item) =>
        item.catalogItemId ? [item.catalogItemId] : [],
      ),
    );
    const preview = composeTechnicalScope({ ...source, ...library });
    const matched =
      input.review?.reviewed === true &&
      input.review.sourceHash === preview.sourceHash &&
      input.review.libraryHash === preview.libraryHash;
    const base =
      !matched && previous
        ? previous
        : {
            ...preview,
            version: 0,
            appliedText: preview.generatedText,
            stale: false,
            manuallyEdited: false,
            reviewedAt: null,
            reviewedByUserId: null,
            definitionSnapshot: library,
            inputSnapshot: source,
          };
    const appliedText =
      input.scope === undefined || input.scope === null
        ? base.generatedText
        : input.scope;
    result = {
      ...base,
      appliedText,
      manuallyEdited: appliedText.trim() !== base.generatedText.trim(),
      stale: !matched,
      reviewedAt: matched ? new Date().toISOString() : base.reviewedAt,
      reviewedByUserId: matched ? input.actorUserId : base.reviewedByUserId,
      operationalConditions: (base.operationalConditions || []).map(
        (condition) => ({ ...condition, status: 'PENDING' }),
      ),
    };
    if (!matched) result.alerts = staleWarning(result);
  } else {
    const base = previous;
    const stale =
      base.stale || technicalScopeSourceHash(source) !== base.sourceHash;
    const appliedText =
      input.scope === undefined || input.scope === null
        ? (base.appliedText ?? base.generatedText)
        : input.scope;
    result = {
      ...base,
      appliedText,
      stale,
      manuallyEdited: appliedText.trim() !== base.generatedText.trim(),
      operationalConditions: (base.operationalConditions || []).map(
        (condition) => ({ ...condition, status: 'PENDING' }),
      ),
    };
    if (stale) result.alerts = staleWarning(result);
  }
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    'technical-scope:' + input.proposalId,
  );
  const latest = await tx.proposalTechnicalScopeVersion.findFirst({
    where: { proposalId: input.proposalId },
    orderBy: { version: 'desc' },
  });
  const latestSnapshot = snapshot(latest?.snapshot);
  if (latestSnapshot && signature(latestSnapshot) === signature(result))
    return scopeJson(latestSnapshot);
  const version = (latest?.version ?? 0) + 1;
  result.version = version;
  const stored = scopeJson(result);
  await tx.proposalTechnicalScopeVersion.create({
    data: {
      proposalId: input.proposalId,
      version,
      snapshot: stored,
      text: result.appliedText,
      sourceHash: result.sourceHash,
      actorUserId: input.actorUserId,
    },
  });
  await tx.systemAuditLog.create({
    data: {
      domain: AuditDomain.PROPOSALS,
      entityType: 'PROPOSAL_TECHNICAL_SCOPE',
      entityId: input.proposalId,
      action:
        input.review?.reviewed && !result.stale
          ? 'REVIEW_TECHNICAL_SCOPE'
          : result.stale
            ? 'STALE_TECHNICAL_SCOPE'
            : 'EDIT_TECHNICAL_SCOPE',
      actorUserId: input.actorUserId,
      afterPayload: {
        version,
        sourceHash: result.sourceHash,
        libraryHash: result.libraryHash,
        stale: result.stale,
        manuallyEdited: result.manuallyEdited,
      },
    },
  });
  return stored;
}
