import { handoffSteps, pendingHandoffWhere } from './commercial-handoff';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { CommercialResponsibilitiesInput } from './commercial.dto';
import { MANAGEMENT_ACTIONS } from '../auth/rules/commercial-management';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  PORTFOLIOS,
  Portfolio,
  RuleActor,
  allowedPortfolios,
  assertPortfolio,
  assertScreen,
} from '../auth/rules/access-rules';
import {
  assertManagement,
  commercialPortfolio,
  managedActivityScope,
  managedOpportunityScope,
  managedProposalScope,
  managementAllowed,
  managementCapabilities,
  portfolioForProposal,
} from '../auth/rules/commercial-management';
import {
  CommercialEstimateInput,
  CommercialHandoffInput,
  CommercialQuery,
  CommercialTemplateInput,
} from './commercial.dto';
import {
  compareCommercialVersions,
  estimateProfit,
  proposalSourceHash,
  renderTemplate,
  TEMPLATE_VARIABLES,
  validateTemplate,
} from './commercial.domain';

import { comparisonSelect, proposalSelect } from './commercial-record';
import { commercialAnalytics } from './commercial-analytics';

@Injectable()
export class CommercialService {
  constructor(private readonly db: DatabaseService) {}

  capabilities(actor: RuleActor) {
    this.internal(actor);
    return {
      portfolios: allowedPortfolios(actor),
      management: managementCapabilities(actor),
      variables: TEMPLATE_VARIABLES,
    };
  }
  private internal(actor: RuleActor) {
    if (!actor?.sub || actor.role === 'CLIENT')
      throw new ForbiddenException('Área reservada à equipe comercial.');
    assertScreen(actor, 'proposals');
  }
  private securityAdministrator(actor: RuleActor) {
    if (actor.role !== 'ADMIN' && !actor.isSystemMaster)
      throw new ForbiddenException(
        'A responsabilidade comercial é configurada pela administração do sistema.',
      );
    assertScreen(actor, 'usersControl', 'manageSecurity');
  }
  private responsibilityHash(rules: unknown) {
    const grants =
      (rules as { commercialManagement?: unknown } | null)
        ?.commercialManagement || {};
    return createHash('sha256').update(JSON.stringify(grants)).digest('hex');
  }
  async responsibilities(actor: RuleActor, userId: string) {
    this.securityAdministrator(actor);
    const user = await this.db.user.findFirst({
      where: { id: userId, isActive: true, role: { not: 'CLIENT' } },
      select: {
        id: true,
        name: true,
        role: true,
        isSystemMaster: true,
        accessRules: true,
      },
    });
    if (!user)
      throw new NotFoundException('Selecione um colaborador interno ativo.');
    return {
      id: user.id,
      name: user.name,
      portfolios: allowedPortfolios({ ...user, sub: user.id }),
      grants:
        (user.accessRules as { commercialManagement?: unknown } | null)
          ?.commercialManagement || {},
      expectedHash: this.responsibilityHash(user.accessRules),
    };
  }
  async saveResponsibilities(
    actor: RuleActor,
    userId: string,
    input: CommercialResponsibilitiesInput,
  ) {
    this.securityAdministrator(actor);
    for (const [portfolio, grants] of Object.entries(input.grants)) {
      if (
        !PORTFOLIOS.includes(portfolio as Portfolio) ||
        !grants ||
        typeof grants !== 'object' ||
        Array.isArray(grants)
      )
        throw new BadRequestException(
          'Carteira inválida na responsabilidade comercial.',
        );
      for (const [action, allowed] of Object.entries(grants))
        if (
          !(
            action === 'responsible' ||
            (MANAGEMENT_ACTIONS as readonly string[]).includes(action)
          ) ||
          typeof allowed !== 'boolean'
        )
          throw new BadRequestException('Permissão comercial inválida.');
    }
    const normalized = Object.fromEntries(
      PORTFOLIOS.map((portfolio) => [
        portfolio,
        Object.fromEntries(
          ['responsible', ...MANAGEMENT_ACTIONS].map((action) => [
            action,
            input.grants[portfolio]?.[action] === true,
          ]),
        ),
      ]),
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, isActive: true, role: { not: 'CLIENT' } },
        select: {
          id: true,
          role: true,
          isSystemMaster: true,
          accessRules: true,
        },
      });
      if (!user)
        throw new NotFoundException('Selecione um colaborador interno ativo.');
      for (const portfolio of PORTFOLIOS) {
        const grant = normalized[portfolio];
        if (
          MANAGEMENT_ACTIONS.some((action) => grant[action]) &&
          !grant.responsible
        )
          throw new BadRequestException(
            'Designe o responsável antes de liberar os dados da carteira.',
          );
        if (
          grant.responsible &&
          !allowedPortfolios({ ...user, sub: user.id }).includes(portfolio)
        )
          throw new BadRequestException(
            'Atribua a carteira ao colaborador no perfil antes de definir a responsabilidade comercial.',
          );
      }
      if (this.responsibilityHash(user.accessRules) !== input.expectedHash)
        throw new ConflictException(
          'Outro administrador alterou estas responsabilidades. Recarregue antes de salvar.',
        );
      const rules = {
        ...((user.accessRules as Record<string, unknown>) || {}),
        commercialManagement: normalized,
      };
      await tx.user.update({
        where: { id: userId },
        data: { accessRules: rules as Prisma.InputJsonValue },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: 'USERS',
          entityType: 'COMMERCIAL_RESPONSIBILITIES',
          entityId: userId,
          action: 'COMMERCIAL_RESPONSIBILITIES_UPDATED',
          actorUserId: actor.sub,
          beforePayload: ((
            user.accessRules as {
              commercialManagement?: Prisma.InputJsonValue;
            } | null
          )?.commercialManagement || {}) as Prisma.InputJsonValue,
          afterPayload: normalized,
        },
      });
    });
    return this.responsibilities(actor, userId);
  }
  private portfolio(actor: RuleActor, raw?: string) {
    this.internal(actor);
    const portfolio = commercialPortfolio(raw);
    if (portfolio) assertPortfolio(actor, portfolio);
    return portfolio;
  }
  private proposalWhere(
    actor: RuleActor,
    portfolio?: Portfolio,
  ): Prisma.ProposalWhereInput {
    const type =
      portfolio === 'generators'
        ? ['GENERATOR_SALE']
        : portfolio === 'contracts'
          ? ['CONTRACT']
          : ['PARTS', 'SERVICES', 'PARTS_AND_SERVICES'];
    return {
      AND: [
        managedProposalScope(actor),
        ...(portfolio
          ? [{ type: { in: type as Prisma.EnumProposalTypeFilter['in'] } }]
          : []),
      ],
    };
  }
  private opportunityWhere(
    actor: RuleActor,
    portfolio?: Portfolio,
  ): Prisma.SalesOpportunityWhereInput {
    return {
      AND: [
        managedOpportunityScope(actor),
        ...(portfolio
          ? [
              {
                pipeline:
                  portfolio === 'generators'
                    ? ('COMMERCIAL_01_GENERATORS' as const)
                    : portfolio === 'contracts'
                      ? ('COMMERCIAL_02_CONTRACTS' as const)
                      : ('COMMERCIAL_03_PARTS_SERVICES' as const),
              },
            ]
          : []),
      ],
    };
  }
  private async proposal(actor: RuleActor, id: string) {
    this.internal(actor);
    const proposal = await this.db.proposal.findFirst({
      where: { id, AND: [managedProposalScope(actor)] },
      select: proposalSelect,
    });
    if (!proposal)
      throw new NotFoundException(
        'Proposta não encontrada ou fora da sua carteira.',
      );
    return proposal;
  }
  async context(actor: RuleActor, id: string) {
    const proposal = await this.proposal(actor, id);
    return { portfolio: portfolioForProposal(proposal.type) };
  }
  async agenda(actor: RuleActor, query: CommercialQuery) {
    const portfolio = this.portfolio(actor, query.portfolio);
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 86400000);
    const idle = new Date(now.getTime() - 7 * 86400000);
    const proposals = this.proposalWhere(actor, portfolio);
    const opportunities = this.opportunityWhere(actor, portfolio);
    const activityWhere: Prisma.CrmActivityWhereInput = {
      AND: [
        managedActivityScope(actor),
        ...(portfolio ? [{ opportunity: opportunities }] : []),
      ],
      status: 'PLANNED',
    };
    const expiring: Prisma.ProposalWhereInput = {
      AND: [proposals],
      status: { in: ['CLIENT_REVIEW', 'SENT', 'APPROVED'] },
      revisions: { none: {} },
      validUntil: { lte: end },
    };
    const approval: Prisma.ProposalWhereInput = {
      AND: [proposals],
      status: { in: ['BOARD_REVIEW', 'DISCOUNT_REVIEW', 'REVISION_REQUIRED'] },
    };
    const handoff: Prisma.ProposalWhereInput = {
      AND: [proposals, pendingHandoffWhere()],
      status: 'WON',
      revisions: { none: {} },
    };
    const idleWhere: Prisma.SalesOpportunityWhereInput = {
      AND: [opportunities],
      stage: { notIn: ['WON', 'LOST'] },
      OR: [
        { updatedAt: { lte: idle } },
        { crmActivities: { none: { status: 'PLANNED' } } },
      ],
    };
    const [activities, expiringCount, approvalCount, idleCount, handoffCount] =
      await Promise.all([
        this.db.crmActivity.count({ where: activityWhere }),
        this.db.proposal.count({ where: expiring }),
        this.db.proposal.count({ where: approval }),
        this.db.salesOpportunity.count({ where: idleWhere }),
        this.db.proposal.count({ where: handoff }),
      ]);
    const counts = {
      activities,
      expiring: expiringCount,
      approval: approvalCount,
      idle: idleCount,
      handoff: handoffCount,
    };
    const page = query.page ?? 1;
    const pagination = { skip: (page - 1) * 10, take: 10 };
    const kind = query.kind || 'activities';
    let items: Array<Record<string, unknown>>;
    if (kind === 'activities') {
      const rows = await this.db.crmActivity.findMany({
        where: activityWhere,
        ...pagination,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          subject: true,
          type: true,
          dueAt: true,
          opportunityId: true,
          owner: { select: { name: true } },
          client: { select: { id: true, companyName: true } },
        },
      });
      items = rows.map((row) => ({
        id: row.id,
        title: row.subject,
        client: row.client.companyName,
        owner: row.owner?.name,
        dueAt: row.dueAt,
        overdue: !!row.dueAt && row.dueAt < now,
        href: row.opportunityId
          ? `/dashboard/opportunities/${row.opportunityId}`
          : `/dashboard/clients/${row.client.id}`,
        action: 'Registrar retorno',
      }));
    } else if (kind === 'idle') {
      const rows = await this.db.salesOpportunity.findMany({
        where: idleWhere,
        ...pagination,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          updatedAt: true,
          expectedCloseDate: true,
          assignedSeller: { select: { name: true } },
          client: { select: { companyName: true } },
          crmActivities: {
            where: { status: 'PLANNED' },
            select: { id: true },
            take: 1,
          },
        },
      });
      items = rows.map((row) => ({
        id: row.id,
        title: row.title,
        client: row.client.companyName,
        owner: row.assignedSeller?.name,
        dueAt: row.expectedCloseDate,
        href: `/dashboard/opportunities/${row.id}`,
        action: row.crmActivities.length
          ? 'Retomar negociação'
          : 'Definir próxima ação',
        updatedAt: row.updatedAt,
      }));
    } else {
      const rows = await this.db.proposal.findMany({
        where:
          kind === 'expiring'
            ? expiring
            : kind === 'approval'
              ? approval
              : handoff,
        ...pagination,
        orderBy:
          kind === 'expiring'
            ? [{ validUntil: 'asc' }, { id: 'asc' }]
            : [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          code: true,
          status: true,
          validUntil: true,
          updatedAt: true,
          user: { select: { name: true } },
          client: { select: { companyName: true } },
        },
      });
      items = rows.map((row) => ({
        id: row.id,
        title: `Proposta ${row.code}`,
        client: row.client.companyName,
        owner: row.user.name,
        status: row.status,
        dueAt: kind === 'expiring' ? row.validUntil : null,
        updatedAt: row.updatedAt,
        href: `/dashboard/proposals/${row.id}`,
        action:
          kind === 'expiring'
            ? 'Acompanhar validade'
            : kind === 'approval'
              ? 'Conferir aprovação'
              : 'Acompanhar pós-venda',
      }));
    }
    return {
      counts,
      kind,
      items,
      page,
      pageSize: 10,
      total: counts[kind as keyof typeof counts],
      updatedAt: now,
      scope:
        portfolio && managementAllowed(actor, portfolio, 'team')
          ? 'Carteira autorizada'
          : 'Seus registros e carteiras autorizadas',
    };
  }
  async availability(actor: RuleActor, input: CommercialEstimateInput) {
    this.portfolio(actor, input.portfolio);
    const ids = [
      ...new Set(
        input.items
          .map((item) => item.catalogItemId)
          .filter((id): id is string => !!id),
      ),
    ];
    const rows = await this.db.catalogItem.findMany({
      where: { id: { in: ids }, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        inventoryBalances: {
          select: { physicalQty: true, reservedQty: true, updatedAt: true },
        },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const demand = new Map<string, number>();
    for (const item of input.items)
      if (item.catalogItemId)
        demand.set(
          item.catalogItemId,
          (demand.get(item.catalogItemId) || 0) + item.quantity,
        );
    return input.items.map((item) => {
      const row = item.catalogItemId ? byId.get(item.catalogItemId) : undefined;
      const physical =
        row?.inventoryBalances.reduce(
          (sum, balance) => sum + balance.physicalQty,
          0,
        ) ?? 0;
      const reserved =
        row?.inventoryBalances.reduce(
          (sum, balance) => sum + balance.reservedQty,
          0,
        ) ?? 0;
      const known = !!row?.inventoryBalances.length && row.type !== 'SERVICE';
      const available = known ? Math.max(0, physical - reserved) : null;
      return {
        key: item.key,
        name: row?.name || item.description || 'Item',
        type: row?.type,
        physical: known ? physical : null,
        reserved: known ? reserved : null,
        available,
        requested: item.catalogItemId
          ? demand.get(item.catalogItemId)
          : item.quantity,
        status:
          row?.type === 'SERVICE'
            ? 'PLANNING_REQUIRED'
            : !known
              ? 'UNCONFIRMED'
              : available! >= demand.get(row.id)!
                ? 'AVAILABLE'
                : 'PURCHASE_REQUIRED',
        note:
          row?.type === 'SERVICE'
            ? 'Prazo sujeito à confirmação do planejamento.'
            : 'Consulta de saldo; não reserva material nem confirma prazo de entrega.',
      };
    });
  }
  private async fullEstimate(input: CommercialEstimateInput) {
    const ids = input.items.flatMap((item) =>
      item.catalogItemId ? [item.catalogItemId] : [],
    );
    const rows = await this.db.catalogItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        averageCost: true,
        lastCost: true,
        costPrice: true,
        updatedAt: true,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return estimateProfit({
      ...input,
      items: input.items.map((item) => {
        const row = item.catalogItemId
          ? byId.get(item.catalogItemId)
          : undefined;
        const source =
          item.unitCost !== undefined
            ? 'Conferido nesta estimativa'
            : Number(row?.averageCost) > 0
              ? 'Custo médio do catálogo'
              : Number(row?.lastCost) > 0
                ? 'Último custo do catálogo'
                : Number(row?.costPrice) > 0
                  ? 'Custo cadastrado'
                  : 'Custo não informado';
        const unitCost =
          item.unitCost !== undefined
            ? item.unitCost
            : Number(row?.averageCost) > 0
              ? Number(row!.averageCost)
              : Number(row?.lastCost) > 0
                ? Number(row!.lastCost)
                : Number(row?.costPrice) > 0
                  ? Number(row!.costPrice)
                  : null;
        return {
          key: item.key,
          quantity: item.quantity,
          description: item.description,
          unitCost,
          source,
          sourceUpdatedAt: row?.updatedAt ?? null,
        };
      }),
    });
  }
  async estimate(actor: RuleActor, input: CommercialEstimateInput) {
    this.portfolio(actor, input.portfolio);
    assertManagement(actor, input.portfolio, 'costs');
    const result = await this.fullEstimate(input);
    const { contribution, marginPercent, ...costs } = result;
    return {
      ...costs,
      ...(managementAllowed(actor, input.portfolio, 'margins')
        ? { contribution, marginPercent }
        : {}),
    };
  }
  async insights(actor: RuleActor, id: string) {
    const proposal = await this.proposal(actor, id);
    const portfolio = portfolioForProposal(proposal.type);
    const capabilities = managementCapabilities(actor)[portfolio]!;
    const input: CommercialEstimateInput = {
      portfolio,
      revenue: proposal.totalValue,
      items: proposal.items.map((item) => ({
        key: item.id,
        catalogItemId: item.catalogItemId ?? undefined,
        description: item.description ?? undefined,
        quantity: item.hours ?? item.quantity,
        revenue: item.totalPrice,
      })),
      version: 0,
    };
    const sourceHash = proposalSourceHash(proposal);
    const [availability, previous, deliveries, tasks, estimate] =
      await Promise.all([
        this.availability(actor, input),
        proposal.parentProposalId
          ? this.db.proposal.findFirst({
              where: {
                id: proposal.parentProposalId,
                AND: [managedProposalScope(actor)],
              },
              select: comparisonSelect,
            })
          : null,
        this.db.documentDelivery.findMany({
          where: { documentType: 'PROPOSAL', documentId: id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            channel: true,
            status: true,
            sentAt: true,
            deliveredAt: true,
            createdAt: true,
            shareToken: { select: { lastOpenedAt: true, openedCount: true } },
          },
        }),
        this.db.commercialHandoffTask.findMany({
          where: { proposalId: id },
          select: {
            step: true,
            ownerId: true,
            dueAt: true,
            version: true,
            owner: { select: { name: true } },
          },
        }),
        capabilities.costs || capabilities.margins
          ? this.db.commercialProposalEstimate.findUnique({
              where: { proposalId: id },
            })
          : null,
      ]);
    const steps = handoffSteps(proposal, availability).map((step) => ({
      ...step,
      assignment: tasks.find((task) => task.step === step.step) ?? null,
    }));
    const stored = estimate?.snapshot as Record<string, unknown> | undefined;
    const costFields = stored
      ? {
          items: stored.items,
          costs: stored.costs,
          itemCost: stored.itemCost,
          extraCost: stored.extraCost,
          estimatedCost: stored.estimatedCost,
          missing: stored.missing,
          complete: stored.complete,
          note: stored.note,
        }
      : null;
    return {
      portfolio,
      capabilities,
      sourceHash,
      estimateInput: input,
      availability,
      revision: previous
        ? {
            previousId: previous.id,
            previousCode: previous.code,
            ...compareCommercialVersions(previous, proposal),
          }
        : null,
      approval: {
        requestedDiscountPercent: proposal.requestedDiscountPercent,
        reason: proposal.requestedDiscountReason,
        waitingSince: proposal.updatedAt,
        status: proposal.status,
      },
      deliveries,
      handoff: steps,
      estimate: stored
        ? {
            version: estimate!.version,
            updatedAt: estimate!.updatedAt,
            stale: estimate!.sourceHash !== sourceHash,
            ...(capabilities.costs ? costFields : {}),
            ...(capabilities.margins
              ? {
                  complete: stored.complete,
                  marginPercent: stored.marginPercent,
                  contribution: stored.contribution,
                }
              : {}),
          }
        : null,
    };
  }
  async saveEstimate(
    actor: RuleActor,
    id: string,
    input: CommercialEstimateInput,
  ) {
    const proposal = await this.proposal(actor, id);
    const portfolio = portfolioForProposal(proposal.type);
    assertManagement(actor, portfolio, 'costs');
    if (proposal.status !== 'DRAFT')
      throw new BadRequestException(
        'A estimativa de uma proposta liberada é preservada. Gere uma revisão para alterar custos.',
      );
    const sourceHash = proposalSourceHash(proposal);
    if (input.sourceHash !== sourceHash)
      throw new ConflictException(
        'A proposta mudou. Recarregue a conferência antes de salvar os custos.',
      );
    const canonical: CommercialEstimateInput = {
      ...input,
      portfolio,
      revenue: proposal.totalValue,
      items: proposal.items.map((item) => ({
        key: item.id,
        catalogItemId: item.catalogItemId ?? undefined,
        description: item.description ?? undefined,
        quantity: item.hours ?? item.quantity,
        revenue: item.totalPrice,
        unitCost: input.items.find((row) => row.key === item.id)?.unitCost,
      })),
    };
    const snapshot = await this.fullEstimate(canonical);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial-estimate:${id}`}))`;
      const current = await tx.commercialProposalEstimate.findUnique({
        where: { proposalId: id },
      });
      if ((current?.version ?? 0) !== input.version)
        throw new ConflictException(
          'Outra pessoa atualizou os custos. Recarregue antes de continuar.',
        );
      // Recheck under the proposal's transition lock so approval cannot race this write.
      await tx.$queryRaw`SELECT id FROM proposals WHERE id = ${id} FOR UPDATE`;
      const latest = await tx.proposal.findUnique({
        where: { id },
        select: { ...comparisonSelect, status: true },
      });
      if (
        !latest ||
        latest.status !== 'DRAFT' ||
        proposalSourceHash(latest) !== sourceHash
      )
        throw new ConflictException(
          'A proposta mudou durante a conferência. Recarregue os dados.',
        );
      await tx.commercialProposalEstimate.upsert({
        where: { proposalId: id },
        create: {
          proposalId: id,
          sourceHash,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          actorUserId: actor.sub,
        },
        update: {
          sourceHash,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          actorUserId: actor.sub,
          version: { increment: 1 },
        },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: 'PROPOSALS',
          entityType: 'COMMERCIAL_ESTIMATE',
          entityId: id,
          action: 'ESTIMATE_REVIEWED',
          actorUserId: actor.sub,
          afterPayload: { version: (current?.version ?? 0) + 1, sourceHash },
        },
      });
    });
    return this.insights(actor, id);
  }
  async handoffOwners(actor: RuleActor, id: string, q = '') {
    const proposal = await this.proposal(actor, id);
    assertManagement(actor, portfolioForProposal(proposal.type), 'team');
    return this.db.user.findMany({
      where: {
        isActive: true,
        role: { not: 'CLIENT' },
        ...(q.trim()
          ? { name: { contains: q.trim(), mode: 'insensitive' } }
          : {}),
      },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }
  async assignHandoff(
    actor: RuleActor,
    id: string,
    input: CommercialHandoffInput,
  ) {
    const proposal = await this.proposal(actor, id);
    assertManagement(actor, portfolioForProposal(proposal.type), 'team');
    const insights = await this.insights(actor, id);
    if (!insights.handoff.some((task) => task.step === input.step))
      throw new BadRequestException(
        'Esta pendência não está aberta na proposta.',
      );
    const owner = await this.db.user.findFirst({
      where: { id: input.ownerId, isActive: true, role: { not: 'CLIENT' } },
      select: { id: true },
    });
    if (!owner)
      throw new BadRequestException('Selecione um colaborador ativo.');
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial-handoff:${id}:${input.step}`}))`;
      const where = { proposalId_step: { proposalId: id, step: input.step } };
      const current = await tx.commercialHandoffTask.findUnique({ where });
      if ((current?.version ?? 0) !== input.version)
        throw new ConflictException(
          'A responsabilidade mudou. Recarregue a proposta.',
        );
      await tx.commercialHandoffTask.upsert({
        where,
        create: {
          proposalId: id,
          step: input.step,
          ownerId: owner.id,
          dueAt: new Date(input.dueAt),
          updatedByUserId: actor.sub,
        },
        update: {
          ownerId: owner.id,
          dueAt: new Date(input.dueAt),
          updatedByUserId: actor.sub,
          version: { increment: 1 },
        },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: 'PROPOSALS',
          entityType: 'COMMERCIAL_HANDOFF',
          entityId: id,
          action: 'HANDOFF_ASSIGNED',
          actorUserId: actor.sub,
          afterPayload: {
            step: input.step,
            ownerId: owner.id,
            dueAt: input.dueAt,
          },
        },
      });
    });
    return this.insights(actor, id);
  }
  async analytics(actor: RuleActor, query: CommercialQuery) {
    const portfolio = this.portfolio(actor, query.portfolio);
    return commercialAnalytics(this.db, actor, query, portfolio);
  }
  async templates(actor: RuleActor, query: CommercialQuery) {
    const portfolio = this.portfolio(actor, query.portfolio);
    const portfolios = portfolio ? [portfolio] : allowedPortfolios(actor);
    const where: Prisma.CommercialContentTemplateWhereInput = {
      OR: portfolios.map((value) => ({
        portfolio: value,
        ...((managementAllowed(actor, value, 'templates') ||
          managementAllowed(actor, value, 'publishTemplates')) &&
        query.publishedOnly !== 'true'
          ? {}
          : { publishedAt: { not: null } }),
      })),
      ...(query.category ? { category: query.category } : {}),
      ...(query.q
        ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
        : {}),
    };
    // One current version per key; published versions remain immutable and auditable.
    const keys = await this.db.commercialContentTemplate.groupBy({
      by: ['key'],
      where,
      _max: { version: true },
      orderBy: { key: 'asc' },
      skip: ((query.page ?? 1) - 1) * 10,
      take: 11,
    });
    const rows = keys.length
      ? await this.db.commercialContentTemplate.findMany({
          where: {
            AND: [where],
            OR: keys
              .slice(0, 10)
              .map((key) => ({ key: key.key, version: key._max.version! })),
          },
          orderBy: { name: 'asc' },
        })
      : [];
    return {
      items: rows,
      hasMore: keys.length > 10,
      variables: TEMPLATE_VARIABLES,
    };
  }
  async saveTemplate(actor: RuleActor, input: CommercialTemplateInput) {
    this.portfolio(actor, input.portfolio);
    assertManagement(actor, input.portfolio, 'templates');
    if (!input.name.trim())
      throw new BadRequestException('Informe o nome do modelo.');
    validateTemplate(input.body);
    if (input.subject) validateTemplate(input.subject);
    const key = input.key || randomUUID();
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial-template:${key}`}))`;
      const previous = await tx.commercialContentTemplate.findFirst({
        where: { key },
        orderBy: { version: 'desc' },
      });
      if ((previous?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException(
          'Existe uma versão mais recente. Reabra o modelo antes de salvar.',
        );
      if (previous && previous.portfolio !== input.portfolio)
        throw new ForbiddenException(
          'Uma versão não pode trocar a carteira do modelo.',
        );
      if (previous && previous.category !== input.category)
        throw new BadRequestException(
          'Para mudar o tipo de conteúdo, crie outro modelo.',
        );
      const row = await tx.commercialContentTemplate.create({
        data: {
          key,
          version: input.expectedVersion + 1,
          portfolio: input.portfolio,
          category: input.category,
          name: input.name.trim(),
          subject: input.subject?.trim() || null,
          body: input.body,
          createdByUserId: actor.sub,
        },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: 'PROPOSALS',
          entityType: 'COMMERCIAL_TEMPLATE',
          entityId: row.id,
          action: 'TEMPLATE_DRAFT_CREATED',
          actorUserId: actor.sub,
          afterPayload: { key, version: row.version, portfolio: row.portfolio },
        },
      });
      return row;
    });
  }
  async publishTemplate(actor: RuleActor, id: string) {
    this.internal(actor);
    return this.db.$transaction(async (tx) => {
      const row = await tx.commercialContentTemplate.findUnique({
        where: { id },
      });
      if (!row) throw new NotFoundException('Modelo não encontrado.');
      assertManagement(actor, row.portfolio as Portfolio, 'publishTemplates');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial-template:${row.key}`}))`;
      const latest = await tx.commercialContentTemplate.findFirst({
        where: { key: row.key },
        orderBy: { version: 'desc' },
      });
      if (latest?.id !== row.id)
        throw new ConflictException(
          'Publique a versão mais recente do modelo.',
        );
      if (row.publishedAt) return row;
      validateTemplate(row.body);
      const published = await tx.commercialContentTemplate.update({
        where: { id },
        data: { publishedAt: new Date(), publishedByUserId: actor.sub },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: 'PROPOSALS',
          entityType: 'COMMERCIAL_TEMPLATE',
          entityId: id,
          action: 'TEMPLATE_PUBLISHED',
          actorUserId: actor.sub,
          afterPayload: { key: row.key, version: row.version },
        },
      });
      return published;
    });
  }
  async templateHistory(actor: RuleActor, key: string, query: CommercialQuery) {
    this.internal(actor);
    const latest = await this.db.commercialContentTemplate.findFirst({
      where: { key },
      orderBy: { version: 'desc' },
    });
    if (!latest) throw new NotFoundException('Modelo não encontrado.');
    const portfolio = latest.portfolio as Portfolio;
    if (
      !managementAllowed(actor, portfolio, 'templates') &&
      !managementAllowed(actor, portfolio, 'publishTemplates')
    )
      throw new ForbiddenException(
        'Histórico reservado ao responsável pelos modelos desta carteira.',
      );
    const items = await this.db.commercialContentTemplate.findMany({
      where: { key, portfolio },
      orderBy: { version: 'desc' },
      skip: ((query.page ?? 1) - 1) * 10,
      take: 11,
    });
    return { items: items.slice(0, 10), hasMore: items.length > 10 };
  }
  async render(actor: RuleActor, id: string, proposalId: string) {
    const proposal = await this.proposal(actor, proposalId);
    const portfolio = portfolioForProposal(proposal.type);
    const template = await this.db.commercialContentTemplate.findUnique({
      where: { id },
    });
    if (
      !template ||
      template.portfolio !== portfolio ||
      (!template.publishedAt &&
        !managementAllowed(actor, portfolio, 'templates') &&
        !managementAllowed(actor, portfolio, 'publishTemplates'))
    )
      throw new NotFoundException(
        'Modelo publicado não encontrado nesta carteira.',
      );
    const values: Record<string, string> = {
      'cliente.nome': proposal.client.tradeName || proposal.client.companyName,
      'vendedor.nome': proposal.user.name,
      'proposta.codigo': proposal.code,
      'proposta.total': new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(proposal.totalValue),
      'proposta.validade':
        proposal.validUntil?.toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        }) ?? 'Não informada',
      'proposta.escopo': proposal.scope || 'Não informado',
      'equipamento.nome': proposal.generator?.name || 'Não informado',
      'proposta.itens': proposal.items
        .map(
          (item) =>
            `${item.quantity} × ${item.description || 'Item da proposta'}`,
        )
        .join('\n'),
    };
    return {
      subject: template.subject ? renderTemplate(template.subject, values) : '',
      body: renderTemplate(template.body, values),
      templateId: template.id,
      version: template.version,
      category: template.category,
      note: 'Confira o conteúdo antes de usar. Nenhum envio ou alteração da proposta foi realizado.',
    };
  }
}
