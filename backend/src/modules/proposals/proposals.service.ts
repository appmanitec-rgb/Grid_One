import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalType,
  AuditDomain,
  BillingAdjustmentIndex,
  ContractInvoiceStatus,
  ContractStatus,
  PartsCoverageType,
  PreventiveRecurrence,
  Prisma,
  ProposalStatus,
  ProposalType,
  SalesOpportunityStage,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';

@Injectable()
export class ProposalsService {
  private readonly kanbanTransitions: Partial<
    Record<ProposalStatus, ProposalStatus[]>
  > = {
    [ProposalStatus.DRAFT]: [ProposalStatus.BOARD_REVIEW],
    [ProposalStatus.BOARD_REVIEW]: [ProposalStatus.CLIENT_REVIEW],
    [ProposalStatus.REVISION_REQUIRED]: [ProposalStatus.BOARD_REVIEW],
    [ProposalStatus.CLIENT_REVIEW]: [ProposalStatus.WON, ProposalStatus.LOST],
    [ProposalStatus.WON]: [],
    [ProposalStatus.LOST]: [],
    [ProposalStatus.SENT]: [],
    [ProposalStatus.APPROVED]: [],
    [ProposalStatus.REJECTED]: [],
  };

  constructor(
    private readonly prisma: DatabaseService,
    private readonly approvalsService: ApprovalsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(createProposalDto: CreateProposalDto) {
    const subtotal = this.calculateTotal(createProposalDto.items);
    const discountValue = Math.max(0, Number(createProposalDto.discount || 0));
    const calculatedTotal = Math.max(0, subtotal - discountValue);

    return this.prisma.$transaction(async (tx) => {
      const linkedOpportunity = createProposalDto.salesOpportunityId
        ? await tx.salesOpportunity.findUnique({
            where: { id: createProposalDto.salesOpportunityId },
            select: { id: true, clientId: true, stage: true },
          })
        : null;

      if (createProposalDto.salesOpportunityId && !linkedOpportunity) {
        throw new NotFoundException('Oportunidade comercial nao encontrada.');
      }

      if (
        linkedOpportunity &&
        linkedOpportunity.clientId !== createProposalDto.clientId
      ) {
        throw new Error(
          'Cliente da proposta difere do cliente da oportunidade vinculada.',
        );
      }

      const nextCode = await this.generateNextNewCode(tx);
      const parsed = this.parseProposalCode(nextCode);

      const proposal = await tx.proposal.create({
        data: {
          code: nextCode,
          baseSequence: parsed?.sequence,
          revision: 0,
          status: ProposalStatus.DRAFT,
          clientId: createProposalDto.clientId,
          salesOpportunityId: linkedOpportunity?.id,
          generatorId: createProposalDto.generatorId,
          userId: createProposalDto.userId,
          type: createProposalDto.type,
          totalValue: calculatedTotal,
          validUntil: createProposalDto.validUntil
            ? new Date(createProposalDto.validUntil)
            : null,
          scope: createProposalDto.scope,
          freight: createProposalDto.freight,
          paymentTerm: createProposalDto.paymentTerm,
          deliveryLeadTimeDays: createProposalDto.deliveryLeadTimeDays,
          paymentDetails: createProposalDto.paymentDetails,
          hasDownPayment: Boolean(createProposalDto.hasDownPayment),
          downPaymentAmount: createProposalDto.downPaymentAmount,
          installmentCount: createProposalDto.installmentCount,
          installmentIntervalDays:
            createProposalDto.installmentIntervalDays ?? 30,
          firstDueDate: createProposalDto.firstDueDate
            ? new Date(createProposalDto.firstDueDate)
            : null,
          internalNotes: createProposalDto.internalNotes,
          externalNotes: createProposalDto.externalNotes,
          discount: discountValue,
          items: {
            create: createProposalDto.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
      });

      await this.createMovement(
        tx,
        proposal.id,
        createProposalDto.userId,
        'CREATE_DRAFT',
        null,
        ProposalStatus.DRAFT,
        'Proposta criada em rascunho.',
      );
      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          action: 'CREATE',
          actorUserId: createProposalDto.userId,
          afterPayload: {
            status: ProposalStatus.DRAFT,
            totalValue: calculatedTotal,
            clientId: createProposalDto.clientId,
            salesOpportunityId: linkedOpportunity?.id ?? null,
          },
        },
        tx,
      );

      if (
        linkedOpportunity &&
        (linkedOpportunity.stage === SalesOpportunityStage.PROSPECTION ||
          linkedOpportunity.stage ===
            SalesOpportunityStage.SITE_SURVEY_SCHEDULED)
      ) {
        await tx.salesOpportunity.update({
          where: { id: linkedOpportunity.id },
          data: { stage: SalesOpportunityStage.PROPOSAL_SENT },
        });
      }

      return tx.proposal.findUnique({
        where: { id: proposal.id },
        include: {
          client: true,
          items: { include: { catalogItem: true } },
          salesOpportunity: {
            select: { id: true, title: true, stage: true },
          },
        },
      });
    });
  }

  async revise(id: string, revisedByUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.proposal.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!source) {
        throw new NotFoundException('Proposta nao encontrada.');
      }

      const sequence =
        source.baseSequence ?? this.parseProposalCode(source.code)?.sequence;
      const nextCode = sequence
        ? await this.generateNextRevisionCode(tx, sequence)
        : await this.generateNextNewCode(tx);

      const parsed = this.parseProposalCode(nextCode);

      const revised = await tx.proposal.create({
        data: {
          code: nextCode,
          baseSequence: parsed?.sequence,
          revision: parsed?.revision ?? 0,
          status: ProposalStatus.REVISION_REQUIRED,
          type: source.type,
          totalValue: source.totalValue,
          validUntil: source.validUntil,
          scope: source.scope,
          freight: source.freight,
          paymentTerm: source.paymentTerm,
          deliveryLeadTimeDays: source.deliveryLeadTimeDays,
          paymentDetails: source.paymentDetails,
          hasDownPayment: source.hasDownPayment,
          downPaymentAmount: source.downPaymentAmount,
          installmentCount: source.installmentCount,
          installmentIntervalDays: source.installmentIntervalDays,
          firstDueDate: source.firstDueDate,
          internalNotes: source.internalNotes,
          externalNotes: source.externalNotes,
          discount: source.discount,
          clientId: source.clientId,
          salesOpportunityId: source.salesOpportunityId,
          generatorId: source.generatorId,
          userId: revisedByUserId || source.userId,
          parentProposalId: source.id,
          items: {
            create: source.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
      });

      await this.createMovement(
        tx,
        revised.id,
        revisedByUserId,
        'REVISE_COPY',
        null,
        ProposalStatus.REVISION_REQUIRED,
        `Nova revisao gerada a partir da proposta ${source.code}.`,
      );

      return revised;
    });
  }

  async submitForBoardReview(id: string, actorUserId?: string) {
    const proposal = await this.requireProposal(id);
    if (
      proposal.status !== ProposalStatus.DRAFT &&
      proposal.status !== ProposalStatus.REVISION_REQUIRED
    ) {
      throw new Error(
        'Somente propostas em rascunho ou em revisao podem ir para analise da diretoria.',
      );
    }

    return this.changeStatus(
      id,
      ProposalStatus.BOARD_REVIEW,
      actorUserId,
      'SUBMIT_BOARD_REVIEW',
      'Encaminhada para analise da diretoria.',
    );
  }

  async boardApprove(id: string, actorUserId?: string) {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== ProposalStatus.BOARD_REVIEW) {
      throw new Error('A proposta precisa estar em analise da diretoria.');
    }

    return this.changeStatus(
      id,
      ProposalStatus.CLIENT_REVIEW,
      actorUserId,
      'BOARD_APPROVE',
      'Diretoria aprovou e liberou para analise do cliente.',
    );
  }

  async boardReject(id: string, actorUserId?: string, note?: string) {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== ProposalStatus.BOARD_REVIEW) {
      throw new Error('A proposta precisa estar em analise da diretoria.');
    }

    return this.changeStatus(
      id,
      ProposalStatus.REVISION_REQUIRED,
      actorUserId,
      'BOARD_REJECT',
      note || 'Diretoria reprovou. Ajustar e reenviar.',
    );
  }

  async clientApprove(id: string, actorUserId?: string) {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== ProposalStatus.CLIENT_REVIEW) {
      throw new Error('A proposta precisa estar em analise do cliente.');
    }

    const updated = await this.changeStatus(
      id,
      ProposalStatus.WON,
      actorUserId,
      'CLIENT_APPROVE',
      'Cliente aprovou a proposta.',
    );

    if (
      proposal.generatorId &&
      (proposal.type === ProposalType.PARTS_AND_SERVICES ||
        proposal.type === ProposalType.SERVICES ||
        proposal.type === ProposalType.CONTRACT)
    ) {
      const os = await this.prisma.maintenanceOrder.create({
        data: {
          title: `OS Automatica - Proposta ${proposal.code}`,
          description: `Ordem gerada automaticamente apos aprovacao do cliente. Valor: R$ ${proposal.totalValue}`,
          generatorId: proposal.generatorId,
        },
      });

      return {
        message: 'Proposta aprovada pelo cliente e O.S. criada.',
        proposal: updated,
        ordemDeServico: os,
      };
    }

    return {
      message: 'Proposta aprovada pelo cliente.',
      proposal: updated,
    };
  }

  async clientReject(id: string, actorUserId?: string, note?: string) {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== ProposalStatus.CLIENT_REVIEW) {
      throw new Error('A proposta precisa estar em analise do cliente.');
    }

    return this.changeStatus(
      id,
      ProposalStatus.LOST,
      actorUserId,
      'CLIENT_REJECT',
      note || 'Cliente recusou a proposta.',
    );
  }

  async requestDiscount(
    id: string,
    discountPercent: number,
    actorUserId?: string,
    reason?: string,
  ) {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== ProposalStatus.CLIENT_REVIEW) {
      throw new Error(
        'Somente propostas em analise do cliente podem solicitar desconto.',
      );
    }

    if (!actorUserId) throw new Error('Usuario solicitante nao identificado.');
    if (discountPercent <= 0) {
      throw new Error('Percentual de desconto deve ser maior que zero.');
    }
    if (discountPercent > 100) {
      throw new Error('Percentual de desconto invalido.');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        approvalDiscountLimit: true,
      },
    });
    if (!actor) throw new Error('Usuario solicitante nao encontrado.');

    const approvalLimit = Number(actor.approvalDiscountLimit ?? 7);
    const requiresApproval = discountPercent > approvalLimit;

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextStatus = requiresApproval
        ? ProposalStatus.DISCOUNT_REVIEW
        : ProposalStatus.CLIENT_REVIEW;

      const updated = await tx.proposal.update({
        where: { id },
        data: {
          status: nextStatus,
          requestedDiscountPercent: discountPercent,
          requestedDiscountReason: reason,
        },
      });

      await this.createMovement(
        tx,
        id,
        actorUserId,
        requiresApproval
          ? 'REQUEST_DISCOUNT_APPROVAL'
          : 'REQUEST_DISCOUNT_AUTO',
        proposal.status,
        nextStatus,
        requiresApproval
          ? `Solicitado desconto de ${discountPercent.toFixed(2)}%. Aguardando aprovacao do gestor.`
          : `Desconto de ${discountPercent.toFixed(2)}% dentro da alcada (${approvalLimit.toFixed(2)}%).`,
      );

      return updated;
    });

    if (!requiresApproval) {
      await this.auditLogsService.record({
        domain: AuditDomain.PROPOSALS,
        entityType: 'PROPOSAL',
        entityId: id,
        action: 'DISCOUNT_AUTO_APPROVED',
        actorUserId,
        afterPayload: {
          discountPercent,
          approvalLimit,
        },
        reason,
      });

      return {
        requiresApproval: false,
        proposal: updated,
      };
    }

    const approvalRequest = await this.approvalsService.create({
      type: ApprovalType.BUDGET_DISCOUNT,
      entityType: 'PROPOSAL',
      entityId: id,
      requesterUserId: actorUserId,
      requestNote:
        reason ||
        `Desconto solicitado: ${discountPercent.toFixed(2)}% (alcada ${approvalLimit.toFixed(2)}%).`,
    });

    return {
      requiresApproval: true,
      proposal: updated,
      approvalRequest,
    };
  }

  async convertWonProposalToContract(id: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id },
        include: {
          generatedContract: { select: { id: true, code: true } },
        },
      });

      if (!proposal) throw new NotFoundException('Proposta nao encontrada.');
      if (proposal.status !== ProposalStatus.WON) {
        throw new Error(
          'Apenas propostas ganhas podem ser convertidas em contrato.',
        );
      }
      if (!proposal.generatorId) {
        throw new Error(
          'A proposta precisa ter equipamento vinculado para gerar contrato.',
        );
      }
      if (proposal.generatedContract) {
        return {
          message: 'Contrato ja havia sido gerado para esta proposta.',
          contract: proposal.generatedContract,
        };
      }

      const contractCode = await this.generateNextContractCode(tx);
      const startDate = new Date();
      const endDate = this.addMonths(startDate, 12);
      const dueDay = 10;

      const createdContract = await tx.serviceContract.create({
        data: {
          code: contractCode,
          title: `Contrato originado da proposta ${proposal.code}`,
          status: ContractStatus.ACTIVE,
          startDate,
          endDate,
          alertDays: 30,
          preventiveRecurrence: PreventiveRecurrence.MONTHLY,
          responseTimeHours: 24,
          correctiveVisitAllowance: 0,
          partsCoverage: PartsCoverageType.BILLED_SEPARATELY,
          recurringAmount: proposal.totalValue,
          dueDay,
          adjustmentIndex: BillingAdjustmentIndex.IPCA,
          adjustmentBaseMonth: startDate.getMonth() + 1,
          notes: `Gerado automaticamente pela proposta ${proposal.code}.`,
          clientId: proposal.clientId,
          createdByUserId: actorUserId ?? proposal.userId,
          sourceProposalId: proposal.id,
          equipments: {
            create: [
              {
                generatorId: proposal.generatorId,
                coverageAmount: proposal.totalValue,
              },
            ],
          },
        },
      });

      await this.seedContractAutomation(tx, createdContract.id);

      await this.createMovement(
        tx,
        proposal.id,
        actorUserId,
        'CONVERT_TO_CONTRACT',
        proposal.status,
        proposal.status,
        `Proposta convertida em contrato ${createdContract.code}.`,
      );

      return {
        message: 'Proposta convertida em contrato com sucesso.',
        contract: createdContract,
      };
    });
  }

  async findAll() {
    return this.prisma.proposal.findMany({
      include: {
        items: true,
        client: true,
        generator: true,
        salesOpportunity: {
          select: { id: true, title: true, stage: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.proposal.findUnique({
      where: { id },
      include: {
        items: {
          include: { catalogItem: true },
        },
        client: true,
        generator: true,
        salesOpportunity: {
          select: { id: true, title: true, stage: true },
        },
        parentProposal: {
          select: { id: true, code: true },
        },
        revisions: {
          select: { id: true, code: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        generatedContract: {
          select: { id: true, code: true, status: true },
        },
        movements: {
          include: {
            actorUser: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getBoardPending(actorUserId?: string) {
    const actor = actorUserId
      ? await this.prisma.user.findUnique({ where: { id: actorUserId } })
      : null;

    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new Error(
        'Apenas diretoria/administrador pode acessar este painel.',
      );
    }

    return this.prisma.proposal.findMany({
      where: {
        status: {
          in: [ProposalStatus.BOARD_REVIEW],
        },
      },
      include: {
        client: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMyUpdates(actorUserId: string) {
    return this.prisma.proposalMovement.findMany({
      where: {
        proposal: {
          userId: actorUserId,
        },
        actorUserId: {
          not: actorUserId,
        },
      },
      include: {
        proposal: {
          select: {
            id: true,
            code: true,
            status: true,
            totalValue: true,
          },
        },
        actorUser: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async update(
    id: string,
    updateProposalDto: UpdateProposalDto,
    actorUserId?: string,
  ) {
    const current = await this.requireProposal(id);
    let actorIsAdmin = false;
    if (updateProposalDto.status && actorUserId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { role: true },
      });
      actorIsAdmin = actor?.role === UserRole.ADMIN;
    }

    if (updateProposalDto.status && !actorIsAdmin) {
      const nextStatus = updateProposalDto.status;
      if (current.status !== nextStatus) {
        const allowed = this.kanbanTransitions[current.status] || [];
        if (!allowed.includes(nextStatus)) {
          throw new Error(
            `Transicao invalida no fluxo: ${current.status} -> ${nextStatus}.`,
          );
        }
      }
    }

    const header = {
      ...updateProposalDto,
    } as Prisma.ProposalUncheckedUpdateInput;
    delete (header as { items?: unknown }).items;

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.proposal.findUnique({
        where: { id },
      });

      const updated = await tx.proposal.update({
        where: { id },
        data: header,
      });

      if (
        updateProposalDto.status &&
        current.status !== updateProposalDto.status
      ) {
        await this.createMovement(
          tx,
          id,
          actorUserId,
          actorIsAdmin ? 'ADMIN_MANUAL_STATUS_UPDATE' : 'MANUAL_STATUS_UPDATE',
          current.status,
          updateProposalDto.status,
          actorIsAdmin
            ? 'Status alterado manualmente por administrador.'
            : 'Status alterado manualmente no kanban.',
        );

        await this.syncOpportunityFromProposalStatus(
          tx,
          current.salesOpportunityId,
          updateProposalDto.status,
        );
      }

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          beforePayload: before as unknown as Prisma.InputJsonValue,
          afterPayload: updated as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return updated;
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.proposal.findUnique({ where: { id } });
      const removed = await tx.proposal.delete({ where: { id } });
      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: id,
          action: 'DELETE',
          beforePayload: before as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
      return removed;
    });
  }

  async approve(id: string) {
    return this.clientApprove(id);
  }

  private async changeStatus(
    id: string,
    toStatus: ProposalStatus,
    actorUserId: string | undefined,
    action: string,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({ where: { id } });
      if (!proposal) {
        throw new NotFoundException('Proposta nao encontrada.');
      }

      const updated = await tx.proposal.update({
        where: { id },
        data: {
          status: toStatus,
          requestedDiscountPercent: null,
          requestedDiscountReason: null,
        },
      });

      await this.createMovement(
        tx,
        id,
        actorUserId,
        action,
        proposal.status,
        toStatus,
        note,
      );

      await this.syncOpportunityFromProposalStatus(
        tx,
        proposal.salesOpportunityId,
        toStatus,
      );

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: id,
          action: `STATUS_${toStatus}`,
          actorUserId,
          beforePayload: { status: proposal.status },
          afterPayload: { status: toStatus },
          reason: note,
        },
        tx,
      );

      return updated;
    });
  }

  private async requireProposal(id: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) {
      throw new NotFoundException('Proposta nao encontrada.');
    }
    return proposal;
  }

  private async syncOpportunityFromProposalStatus(
    tx: Prisma.TransactionClient,
    salesOpportunityId: string | null | undefined,
    proposalStatus: ProposalStatus,
  ) {
    if (!salesOpportunityId) return;

    let nextStage: SalesOpportunityStage | null = null;
    if (proposalStatus === ProposalStatus.WON) {
      nextStage = SalesOpportunityStage.WON;
    } else if (proposalStatus === ProposalStatus.LOST) {
      nextStage = SalesOpportunityStage.LOST;
    }

    if (!nextStage) return;

    await tx.salesOpportunity.update({
      where: { id: salesOpportunityId },
      data: { stage: nextStage },
    });
  }

  private async createMovement(
    tx: Prisma.TransactionClient,
    proposalId: string,
    actorUserId: string | undefined,
    action: string,
    fromStatus: ProposalStatus | null,
    toStatus: ProposalStatus,
    note?: string,
  ) {
    await tx.proposalMovement.create({
      data: {
        proposalId,
        actorUserId,
        action,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        note,
      },
    });
  }

  private calculateTotal(
    items: Array<{ quantity: number; unitPrice: number }>,
  ) {
    return items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }

  private parseProposalCode(code: string) {
    const match = /^(\d{5,})\/(\d{2})$/.exec(code);
    if (!match) return null;

    return {
      sequence: Number(match[1]),
      revision: Number(match[2]),
    };
  }

  private formatProposalCode(sequence: number, revision: number) {
    return `${String(sequence).padStart(5, '0')}/${String(revision).padStart(2, '0')}`;
  }

  private async generateNextNewCode(tx: Prisma.TransactionClient) {
    const proposals = await tx.proposal.findMany({ select: { code: true } });

    let maxSequence = 19999;
    for (const proposal of proposals) {
      const parsed = this.parseProposalCode(proposal.code);
      if (parsed && parsed.sequence > maxSequence) {
        maxSequence = parsed.sequence;
      }
    }

    return this.formatProposalCode(maxSequence + 1, 0);
  }

  private async generateNextRevisionCode(
    tx: Prisma.TransactionClient,
    sequence: number,
  ) {
    const prefix = `${String(sequence).padStart(5, '0')}/`;
    const proposals = await tx.proposal.findMany({
      where: {
        code: {
          startsWith: prefix,
        },
      },
      select: { code: true },
    });

    let maxRevision = 0;
    for (const proposal of proposals) {
      const parsed = this.parseProposalCode(proposal.code);
      if (
        parsed &&
        parsed.sequence === sequence &&
        parsed.revision > maxRevision
      ) {
        maxRevision = parsed.revision;
      }
    }

    return this.formatProposalCode(sequence, maxRevision + 1);
  }

  private async generateNextContractCode(tx: Prisma.TransactionClient) {
    const contracts = await tx.serviceContract.findMany({
      select: { code: true },
    });

    let max = 0;
    for (const contract of contracts) {
      const match = /^CTR-(\d{5,})$/.exec(contract.code);
      if (!match) continue;
      const sequence = Number(match[1]);
      if (sequence > max) max = sequence;
    }

    return `CTR-${String(max + 1).padStart(5, '0')}`;
  }

  private addMonths(base: Date, months: number) {
    const copy = new Date(base);
    const day = copy.getDate();
    copy.setMonth(copy.getMonth() + months);
    if (copy.getDate() < day) copy.setDate(0);
    return copy;
  }

  private buildDueDate(competence: Date, dueDay: number) {
    const year = competence.getFullYear();
    const month = competence.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(Math.max(dueDay, 1), maxDay);
    return new Date(year, month, day, 10, 0, 0, 0);
  }

  private async seedContractAutomation(
    tx: Prisma.TransactionClient,
    contractId: string,
  ) {
    const contract = await tx.serviceContract.findUnique({
      where: { id: contractId },
      include: { equipments: true },
    });

    if (!contract) return;

    const competenceDates: Date[] = [];
    let cursor = new Date(contract.startDate);
    while (cursor <= contract.endDate) {
      competenceDates.push(new Date(cursor));
      cursor = this.addMonths(cursor, 1);
    }

    if (competenceDates.length > 0) {
      await tx.contractInvoice.createMany({
        data: competenceDates.map((competenceDate) => ({
          contractId,
          competenceDate,
          dueDate: this.buildDueDate(competenceDate, contract.dueDay),
          amount: contract.recurringAmount,
          variableAmount: 0,
          status: ContractInvoiceStatus.PENDING,
          description: `Mensalidade contrato ${contract.code}`,
        })),
      });
    }

    const scheduleData = contract.equipments.flatMap((equipment) =>
      competenceDates.map((scheduledDate) => ({
        contractId,
        generatorId: equipment.generatorId,
        scheduledDate,
        status: 'PLANNED',
      })),
    );

    if (scheduleData.length > 0) {
      await tx.contractPreventiveSchedule.createMany({ data: scheduleData });
    }

    await tx.generator.updateMany({
      where: {
        id: { in: contract.equipments.map((item) => item.generatorId) },
      },
      data: { hasMaintenanceContract: true },
    });
  }
}
