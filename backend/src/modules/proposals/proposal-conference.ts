import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditDomain, Prisma } from '@prisma/client';
import { ProposalPaymentPurpose } from '@prisma/client';
import { assertProposalPaymentProfile } from './proposal-payment-profile';
import {
  storedScopeClassifications,
  isGenericTechnicalText,
} from '../technical-scopes/technical-service-classification';
import {
  assertPortfolio,
  assertScreen,
  portfolioForProposal,
  unrestricted,
} from '../auth/rules/access-rules';
import { effectiveAccessPolicy } from '../users/access-policy';
import { composeTechnicalScope } from '../technical-scopes/technical-scope.engine';
import {
  loadTechnicalScopeLibrary,
  resolveTechnicalScopeSource,
} from '../technical-scopes/technical-scope-resolution';
import {
  reviewProposal,
  type ReviewAcknowledgement,
  type ReviewInput,
  type ReviewOperation,
  type ReviewLine,
  type ReviewIssue,
} from './proposal-review.domain';

export const phase1Enabled = () =>
  process.env.PROPOSAL_CONFERENCE_PHASE1 === 'true';
export const phase1Type = (type: string, origin?: string | null) =>
  phase1Enabled() &&
  origin !== 'EXTERNAL' &&
  ['PARTS', 'SERVICES', 'PARTS_AND_SERVICES'].includes(type);
type DB = Prisma.TransactionClient;
export function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export async function conferenceActor(
  db: DB,
  id: string,
  action: 'view' | 'create' | 'update' | 'approve' = 'view',
) {
  if (!id) throw new UnauthorizedException('Autenticação obrigatória.');
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isActive: true,
      isSystemMaster: true,
      accessRules: true,
      accessPolicy: true,
      approvalDiscountLimit: true,
    },
  });
  if (!user?.isActive || user.role === 'CLIENT')
    throw new ForbiddenException(
      'A edição e a conferência pertencem à equipe interna.',
    );
  const actor = { ...user, sub: user.id };
  if (!unrestricted(actor)) {
    assertScreen(actor, 'proposals', action === 'view' ? undefined : action);
    const policy = effectiveAccessPolicy(user.role, user.accessPolicy);
    if (
      !policy.pages.proposals ||
      !policy.proposals.view ||
      !policy.proposals[action]
    )
      throw new ForbiddenException(
        'Sem permissão para esta ação em propostas.',
      );
  }
  return actor;
}
export async function expenseConferenceRules(db: DB) {
  const configured = await db.controlOption.findMany({
    where: { type: 'PROPOSAL_EXPENSE_REVIEW_RULE' },
    select: {
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      isActive: true,
    },
  });
  return configured.length
    ? configured.filter((rule) => rule.isActive)
    : [
        {
          code: 'MEAL',
          name: 'Confira a quantidade de refeições',
          description:
            'Quantidade elevada para conferência; isso pode ser legítimo.',
          sortOrder: 100,
        },
        {
          code: 'PARKING',
          name: 'Confira a quantidade de estacionamentos',
          description:
            'Quantidade elevada para conferência; confirme a unidade e o período.',
          sortOrder: 100,
        },
      ];
}
function numeric(value: unknown, fallback = 0) {
  return value === '' || value === null || value === undefined
    ? fallback
    : Number(value);
}
function rows(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter(
        (row) => row && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
}
export function formToReviewInput(raw: Record<string, any>): ReviewInput {
  const parts = rows(raw.parts),
    labor = rows(raw.labor);
  const hourly = rows(raw.hourlyServices),
    other = rows(raw.otherItems);
  const items: ReviewLine[] = Array.isArray(raw.items)
    ? rows(raw.items).map((row, index) => ({
        ...row,
        kind: String(row.kind || 'OTHER'),
        key: row.key || String(index),
        quantity: numeric(row.quantity, 1),
        hours: row.hours === undefined ? undefined : numeric(row.hours),
        unitPrice: numeric(row.unitPrice),
        discountPercent: numeric(row.discountPercent),
      }))
    : [
        ...parts.map((row: Record<string, any>, index: number) => ({
          key: 'part-' + index,
          kind: 'PART_MATERIAL',
          catalogItemId: row.catalogItemId,
          quantity: numeric(row.quantity),
          unitPrice: numeric(row.unitPrice),
        })),
        ...labor.map((row: Record<string, any>, index: number) => ({
          key: 'service-' + index,
          kind: 'CATALOG_SERVICE',
          catalogItemId: row.catalogItemId,
          quantity: numeric(row.quantity),
          unitPrice: numeric(row.unitPrice),
        })),
        ...hourly.map((row: Record<string, any>, index: number) => ({
          ...row,
          key: 'hourly-' + index,
          kind: 'HOURLY_SERVICE',
          quantity: 1,
          hours: numeric(row.hours),
          unitPrice: numeric(row.unitPrice),
          discountPercent: numeric(row.discountPercent),
        })),
        ...other.map((row: Record<string, any>, index: number) => ({
          key: 'other-' + index,
          kind: 'OTHER',
          description: row.description,
          quantity: numeric(row.quantity),
          unitPrice: numeric(row.unitPrice),
        })),
      ];
  return {
    clientId: raw.clientId || raw.selectedClientId,
    sellerId: raw.userId || raw.selectedSellerId,
    type: raw.type || raw.proposalFormType || 'PARTS_AND_SERVICES',
    items,
    expenses: rows(raw.operationalExpenses).map((row) => ({
      ...row,
      expenseType: String(row.expenseType || ''),
      quantity: numeric(row.quantity),
      unitPrice: numeric(row.unitPrice),
    })),
    discount: numeric(raw.discount),
    allowExpenseDiscount: Boolean(raw.allowOperationalExpenseDiscount),
    paymentPlan:
      raw.paymentPlan && typeof raw.paymentPlan === 'object'
        ? raw.paymentPlan
        : null,
    paymentTerm: typeof raw.paymentTerm === 'string' ? raw.paymentTerm : '',
    hasDownPayment: Boolean(raw.hasDownPayment),
    downPaymentAmount: numeric(raw.downPaymentAmount),
    installmentCount: numeric(raw.installmentCount, 1),
    scopeText: typeof raw.scope === 'string' ? raw.scope : '',
    acknowledgements: rows(raw.reviewAcknowledgements).filter(
      (row) =>
        typeof row.code === 'string' &&
        typeof row.signature === 'string' &&
        typeof row.reason === 'string',
    ) as ReviewAcknowledgement[],
  };
}
/** Resolves authoritative prices and tariffs for the current unsaved editor. No writes. */
export async function conferenceForm(
  db: DB,
  raw: Record<string, any>,
  actorId: string,
  proposalId?: string,
) {
  const actor = await conferenceActor(
    db,
    actorId,
    proposalId ? 'update' : 'create',
  );
  const input = formToReviewInput(raw);
  if (!phase1Type(input.type || 'PARTS_AND_SERVICES'))
    throw new BadRequestException(
      'Use a conferência do fluxo próprio deste tipo de proposta.',
    );
  if (input.items.length > 500)
    throw new BadRequestException('Confira no máximo 500 itens por proposta.');
  input.clientId =
    typeof input.clientId === 'string' ? input.clientId : undefined;
  input.sellerId =
    typeof input.sellerId === 'string' ? input.sellerId : undefined;
  input.items.forEach((item) => {
    item.catalogItemId =
      typeof item.catalogItemId === 'string' ? item.catalogItemId : undefined;
    item.description =
      typeof item.description === 'string' ? item.description : undefined;
  });
  assertPortfolio(
    actor,
    portfolioForProposal(input.type || 'PARTS_AND_SERVICES'),
  );
  if (proposalId) {
    const previous = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { type: true, status: true },
    });
    if (!previous) throw new NotFoundException('Proposta não encontrada.');
    assertPortfolio(actor, portfolioForProposal(previous.type));
    if (previous.status !== 'DRAFT')
      throw new BadRequestException(
        'Crie uma revisão em rascunho para editar esta proposta.',
      );
  }
  const ids = [
    ...new Set(
      input.items.flatMap((item) =>
        item.catalogItemId ? [item.catalogItemId] : [],
      ),
    ),
  ];
  const [catalog, rates, expenseRates, profiles, rules] = await Promise.all([
    db.catalogItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        type: true,
        basePrice: true,
        isActive: true,
      },
    }),
    db.proposalHourlyRate.findMany({ where: { isActive: true } }),
    db.operationalExpenseRate.findMany({ where: { isActive: true } }),
    db.proposalPaymentProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        purpose: true,
        issuerCompanyId: true,
        method: true,
        beneficiaryDocument: true,
        pixKey: true,
        boletoInstructions: true,
        issuerCompany: { select: { cnpj: true } },
      },
    }),
    expenseConferenceRules(db),
  ]);
  const extra: ReviewIssue[] = [];
  const invalid = (
    code: string,
    description: string,
    group: ReviewIssue['group'],
    step: number,
    field?: string,
  ) =>
    extra.push({
      code,
      severity: 'error',
      title: 'Confira o cadastro utilizado',
      description,
      group,
      step,
      field:
        field ||
        (code.startsWith('CLIENT')
          ? 'client'
          : code.startsWith('SELLER')
            ? 'seller'
            : code === 'EQUIPMENT_CLIENT'
              ? 'equipment'
              : group),
      action: 'Corrigir cadastro',
      origin: 'catalog',
      blocks: ['submit', 'approve', 'document', 'send', 'accept'],
      signature: code,
    });
  const [client, seller, equipment] = await Promise.all([
    input.clientId
      ? db.client.findUnique({
          where: { id: input.clientId },
          select: {
            id: true,
            proposalCreationBlocked: true,
            proposalBlockReason: true,
          },
        })
      : null,
    input.sellerId
      ? db.user.findFirst({
          where: {
            id: input.sellerId,
            isActive: true,
            role: { in: ['SALES', 'MANAGER', 'ADMIN'] },
          },
          select: { id: true },
        })
      : null,
    raw.selectedEquipmentId || raw.generatorId
      ? db.generator.findUnique({
          where: { id: String(raw.selectedEquipmentId || raw.generatorId) },
          select: { clientId: true },
        })
      : null,
  ]);
  if (input.clientId && !client)
    invalid(
      'CLIENT_UNAVAILABLE',
      'O cliente selecionado não foi encontrado.',
      'commercial',
      0,
    );
  if (client?.proposalCreationBlocked)
    invalid(
      'CLIENT_BLOCKED',
      client.proposalBlockReason ||
        'O cliente está bloqueado para novas propostas. O rascunho pode ser salvo.',
      'commercial',
      0,
    );
  if (input.sellerId && !seller)
    invalid(
      'SELLER_UNAVAILABLE',
      'Selecione um responsável comercial ou gestor ativo.',
      'commercial',
      0,
    );
  if (
    (raw.selectedEquipmentId || raw.generatorId) &&
    (!equipment || equipment.clientId !== input.clientId)
  )
    invalid(
      'EQUIPMENT_CLIENT',
      'Selecione um equipamento pertencente ao cliente desta proposta.',
      'commercial',
      0,
    );
  for (const item of input.items) {
    const product = catalog.find((row) => row.id === item.catalogItemId);
    if (item.catalogItemId) {
      if (!product?.isActive)
        invalid(
          'CATALOG_INACTIVE',
          'Um item não existe ou está inativo no catálogo.',
          'items',
          1,
        );
      if (product) {
        item.description = product.name;
        item.referenceUnitPrice = product.basePrice;
        if (item.kind === 'CATALOG_SERVICE') item.unitPrice = product.basePrice;
        if (item.kind === 'CATALOG_SERVICE' && product.basePrice <= 0)
          invalid(
            'SERVICE_PRICE_MISSING',
            'O serviço precisa de um preço de venda no catálogo.',
            'items',
            2,
          );
        if ((product.type === 'SERVICE') !== (item.kind === 'CATALOG_SERVICE'))
          invalid(
            'CATALOG_KIND',
            'O tipo do item não corresponde ao catálogo.',
            'items',
            1,
          );
      }
    }
    if (item.kind === 'HOURLY_SERVICE') {
      const source = object(
        rows(Array.isArray(raw.items) ? raw.items : raw.hourlyServices).find(
          (row) =>
            row.hourType ===
              (item as ReviewLine & { hourType?: string }).hourType &&
            row.technicianType ===
              (item as ReviewLine & { technicianType?: string }).technicianType,
        ),
      );
      const rate = rates.find(
        (rate) =>
          rate.hourType === source.hourType &&
          rate.technicianType === source.technicianType,
      );
      item.unitPrice = Number(rate?.unitPrice || 0);
      if (!rate)
        invalid(
          'HOURLY_RATE_MISSING',
          'Selecione um tipo de hora e profissional com tarifa ativa.',
          'items',
          2,
        );
    }
  }
  for (const expense of input.expenses || []) {
    const rate = expenseRates.find(
      (row) => row.expenseType === expense.expenseType,
    );
    if (!rate)
      invalid(
        'EXPENSE_RATE_MISSING',
        'A despesa precisa de uma tarifa ativa no Studio.',
        'expenses',
        2,
      );
    else {
      expense.unitPrice = rate.unitPrice;
      expense.unitLabel = rate.unitLabel;
      expense.label = rate.label;
    }
  }
  for (const [id, purpose] of [
    [raw.partsPaymentProfileId, ProposalPaymentPurpose.PARTS],
    [raw.servicesPaymentProfileId, ProposalPaymentPurpose.SERVICES],
  ] as const) {
    if (!id) continue;
    try {
      assertProposalPaymentProfile(
        profiles.find((profile) => profile.id === id),
        purpose,
      );
    } catch (error) {
      if (error instanceof BadRequestException)
        invalid('PAYMENT_PROFILE_INVALID', error.message, 'payment', 0);
      else throw error;
    }
  }
  input.paymentProfiles = profiles
    .filter((profile) =>
      [raw.partsPaymentProfileId, raw.servicesPaymentProfileId].includes(
        profile.id,
      ),
    )
    .map(({ purpose, issuerCompanyId }) => ({ purpose, issuerCompanyId }));
  input.requiredPaymentPurposes = [
    ...new Set(
      input.items
        .filter(
          (item) =>
            item.catalogItemId ||
            item.description ||
            item.kind === 'HOURLY_SERVICE',
        )
        .map((item) => (item.kind === 'PART_MATERIAL' ? 'PARTS' : 'SERVICES')),
    ),
  ].filter((purpose) =>
    profiles.some((profile) => profile.purpose === purpose),
  );
  input.expenseRules = rules;
  input.unrestricted = unrestricted(actor);
  input.discountLimit = actor.approvalDiscountLimit ?? 0;
  if (
    input.items.some(
      (item) =>
        item.catalogItemId ||
        item.description ||
        item.kind === 'HOURLY_SERVICE',
    )
  ) {
    const previous = proposalId
      ? await db.proposal.findUnique({
          where: { id: proposalId },
          select: { technicalScopeSnapshot: true },
        })
      : null;
    const snapshot = object(previous?.technicalScopeSnapshot);
    try {
      const source = await resolveTechnicalScopeSource(db, {
        type: input.type || 'PARTS_AND_SERVICES',
        clientId: input.clientId,
        generatorId: raw.generatorId || raw.selectedEquipmentId,
        items: input.items.filter(
          (item) =>
            item.catalogItemId ||
            item.description ||
            item.kind === 'HOURLY_SERVICE',
        ),
        technicalScopeClassifications:
          raw.technicalScopeClassifications ??
          storedScopeClassifications(snapshot),
      });
      const library = await loadTechnicalScopeLibrary(db, ids);
      const preview = composeTechnicalScope({ ...source, ...library });
      const review = object(raw.technicalScopeReview);
      input.scopeSnapshot = {
        ...snapshot,
        alerts: preview.alerts,
        stale: raw.technicalScopeReview
          ? review.sourceHash !== preview.sourceHash ||
            review.libraryHash !== preview.libraryHash
          : Boolean(
              snapshot.stale ||
              (snapshot.sourceHash &&
                snapshot.sourceHash !== preview.sourceHash),
            ),
        manuallyEdited: Boolean(
          (raw.technicalScopeReview || snapshot.generatedText) &&
          String(raw.scope || '').trim() !==
            (raw.technicalScopeReview
              ? preview.generatedText
              : String(snapshot.generatedText)
            ).trim(),
        ),
      };
      if (
        source.items.some((item) =>
          ['SERVICE', 'HOURLY'].includes(item.kind),
        ) &&
        (!input.scopeText?.trim() || isGenericTechnicalText(input.scopeText))
      )
        invalid(
          'SCOPE_DESCRIPTION_REQUIRED',
          'Prepare e confira o escopo na etapa Serviços antes de liberar a proposta.',
          'scope',
          2,
          'serviceTechnical',
        );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        invalid(
          'SCOPE_SOURCE_INVALID',
          error.message,
          'scope',
          2,
          'serviceTechnical',
        );
      else throw error;
    }
  }
  const report = reviewProposal(input);
  return {
    input,
    ...report,
    issues: [...report.issues, ...extra],
    pending: [...report.pending, ...extra],
    errors: report.errors + extra.length,
    blocks: (operation: ReviewOperation) => [
      ...report.blocks(operation),
      ...extra.filter((issue) => issue.blocks.includes(operation)),
    ],
  };
}
/** Frozen stored data: never reprice a saved proposal with current catalog/tariffs. */
export async function conferenceStored(
  db: DB,
  id: string,
  actorId?: string,
  references?: Array<{ id: string; basePrice: number }>,
) {
  const proposal = await db.proposal.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!proposal) throw new NotFoundException('Proposta não encontrada.');
  const actor = actorId
    ? await db.user.findUnique({
        where: { id: actorId },
        select: {
          id: true,
          role: true,
          isSystemMaster: true,
          approvalDiscountLimit: true,
          accessRules: true,
        },
      })
    : null;
  if (actor)
    assertPortfolio(
      { ...actor, sub: actor.id },
      portfolioForProposal(proposal.type),
    );
  const records = await db.systemAuditLog.findMany({
    where: {
      domain: AuditDomain.PROPOSALS,
      entityType: 'PROPOSAL_CONFERENCE',
      entityId: id,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const data = object(records[0]?.afterPayload);
  const catalogReferences =
    references ||
    (Array.isArray(data.catalogReferences)
      ? (data.catalogReferences as Array<{ id: string; basePrice: number }>)
      : []);
  const snapshot = object(proposal.technicalScopeSnapshot);
  // A pre-phase-1 released proposal must remain reproducible without retroactive new waivers.
  const legacyReleased =
    !records.length &&
    ['CLIENT_REVIEW', 'WON', 'APPROVED', 'SENT', 'LOST'].includes(
      proposal.status,
    );
  const input: ReviewInput = {
    clientId: proposal.clientId,
    sellerId: proposal.userId,
    type: proposal.type,
    items: proposal.items.map((item) => ({
      ...item,
      referenceUnitPrice: catalogReferences.find(
        (row) => row.id === item.catalogItemId,
      )?.basePrice,
    })),
    expenses: Array.isArray(proposal.operationalExpenses)
      ? (proposal.operationalExpenses as unknown as ReviewInput['expenses'])
      : [],
    discount: proposal.discount || 0,
    allowExpenseDiscount: proposal.allowOperationalExpenseDiscount,
    totalValue: proposal.totalValue,
    paymentTerm: proposal.paymentTerm,
    paymentPlan: proposal.paymentPlan as ReviewInput['paymentPlan'],
    hasDownPayment: proposal.hasDownPayment,
    downPaymentAmount: proposal.downPaymentAmount,
    installmentCount: proposal.installmentCount,
    paymentProfiles: Array.isArray(proposal.paymentSelections)
      ? proposal.paymentSelections.map((selection) => {
          const row = object(selection);
          return {
            purpose: String(row.purpose || ''),
            issuerCompanyId:
              row.issuerCompanyId || object(row.issuerCompany).id || null,
          };
        })
      : [],
    scopeText: proposal.scope || '',
    scopeSnapshot: Object.keys(snapshot).length
      ? {
          ...snapshot,
          manuallyEdited: !legacyReleased && Boolean(snapshot.manuallyEdited),
        }
      : null,
    acknowledgements: Array.isArray(data.acknowledgements)
      ? data.acknowledgements
      : [],
    expenseRules: await expenseConferenceRules(db),
    unrestricted:
      !actor ||
      unrestricted({ ...actor, sub: actor.id }) ||
      ['CLIENT_REVIEW', 'WON', 'APPROVED', 'SENT', 'LOST'].includes(
        proposal.status,
      ),
    discountLimit: actor?.approvalDiscountLimit ?? 0,
  };
  const released = [
    'CLIENT_REVIEW',
    'WON',
    'APPROVED',
    'SENT',
    'LOST',
  ].includes(proposal.status);
  if (
    !released &&
    phase1Type(proposal.type, proposal.origin) &&
    proposal.items.length
  ) {
    const source = await resolveTechnicalScopeSource(db, {
      type: proposal.type,
      clientId: proposal.clientId,
      generatorId: proposal.generatorId,
      items: proposal.items,
      technicalScopeClassifications: storedScopeClassifications(snapshot),
    });
    const library = await loadTechnicalScopeLibrary(
      db,
      proposal.items.flatMap((item) =>
        item.catalogItemId ? [item.catalogItemId] : [],
      ),
    );
    const preview = composeTechnicalScope({ ...source, ...library });
    input.scopeSnapshot = { ...input.scopeSnapshot, alerts: preview.alerts };
    if (
      source.items.some((item) => ['SERVICE', 'HOURLY'].includes(item.kind)) &&
      (!input.scopeText?.trim() || isGenericTechnicalText(input.scopeText))
    ) {
      input.scopeSnapshot.alerts = [
        ...preview.alerts,
        {
          code: 'SERVICE_SCOPE_REQUIRED',
          severity: 'error',
          message: 'Prepare e confira o escopo na etapa Serviços.',
        },
      ];
    }
  }
  return { proposal, legacyReleased, ...reviewProposal(input) };
}
export async function assertProposalConference(
  db: DB,
  id: string,
  actorId: string | undefined,
  operation: ReviewOperation,
) {
  if (!phase1Enabled()) return;
  const report = await conferenceStored(db, id, actorId);
  if (!phase1Type(report.proposal.type, report.proposal.origin)) return;
  if (report.legacyReleased) return;
  const errors = report.blocks(operation);
  if (errors.length)
    throw new BadRequestException({
      message: 'Confira as pendências antes de continuar.',
      operation,
      issues: errors,
    });
}
export async function auditProposalConference(
  db: DB,
  id: string,
  actorId: string | undefined,
  acknowledgements?: ReviewAcknowledgement[],
) {
  if (!phase1Enabled()) return;
  const products = await db.proposalItem.findMany({
    where: { proposalId: id },
    select: { catalogItemId: true },
  });
  const references = await db.catalogItem.findMany({
    where: {
      id: {
        in: products.flatMap((item) =>
          item.catalogItemId ? [item.catalogItemId] : [],
        ),
      },
    },
    select: { id: true, basePrice: true },
  });
  const report = await conferenceStored(db, id, actorId, references);
  if (!phase1Type(report.proposal.type, report.proposal.origin)) return;
  const valid = (acknowledgements || []).filter(
    (ack) =>
      ack.reason?.trim().length >= 8 &&
      report.issues.some(
        (issue) => issue.code === ack.code && issue.signature === ack.signature,
      ),
  );
  await db.systemAuditLog.create({
    data: {
      domain: AuditDomain.PROPOSALS,
      entityType: 'PROPOSAL_CONFERENCE',
      entityId: id,
      action: 'REVIEW',
      actorUserId: actorId,
      afterPayload: {
        proposalUpdatedAt: report.proposal.updatedAt.toISOString(),
        errors: report.errors,
        warnings: report.warnings,
        codes: report.issues.map((issue) => issue.code),
        groups: report.issues.map((issue) => issue.group),
        catalogReferences: references,
        acknowledgements: valid,
        manualScope: Boolean(
          object(report.proposal.technicalScopeSnapshot).manuallyEdited,
        ),
      },
    },
  });
  return {
    ...report,
    blocks: (operation: ReviewOperation) =>
      report
        .blocks(operation)
        .filter(
          (issue) =>
            !valid.some(
              (ack) =>
                ack.code === issue.code && ack.signature === issue.signature,
            ),
        ),
  };
}
