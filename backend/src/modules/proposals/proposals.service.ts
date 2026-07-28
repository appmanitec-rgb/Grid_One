import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  ApprovalType,
  AuditDomain,
  BillingAdjustmentIndex,
  CommissionRuleTrigger,
  CommissionStatus,
  ContractInvoiceStatus,
  ContractStatus,
  CostCenterEntryType,
  PartsCoverageType,
  PreventiveRecurrence,
  Prisma,
  ProposalHourType,
  ProposalItemKind,
  ProposalStatus,
  ProposalTechnicianType,
  ProposalType,
  SalesOpportunityType,
  SalesOpportunityStage,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateProposalDto,
  QuickProposalGeneratorDto,
} from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';

@Injectable()
export class ProposalsService {
  private readonly defaultContractCommissionPercent = 2;

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

  async create(createProposalDto: CreateProposalDto, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const linkedOpportunity = createProposalDto.salesOpportunityId
        ? await tx.salesOpportunity.findUnique({
            where: { id: createProposalDto.salesOpportunityId },
            select: {
              id: true,
              clientId: true,
              stage: true,
              assignedSellerId: true,
              pipeline: true,
              opportunityType: true,
            },
          })
        : null;

      if (createProposalDto.salesOpportunityId && !linkedOpportunity) {
        throw new NotFoundException('Oportunidade comercial nao encontrada.');
      }

      if (
        linkedOpportunity &&
        linkedOpportunity.clientId !== createProposalDto.clientId
      ) {
        throw new BadRequestException(
          'Cliente da proposta difere do cliente da oportunidade vinculada.',
        );
      }

      const sellerUserId =
        linkedOpportunity?.assignedSellerId ?? createProposalDto.userId;
      if (!sellerUserId) {
        throw new BadRequestException(
          'Informe um vendedor comercial para a proposta.',
        );
      }
      await this.assertProposalSeller(tx, sellerUserId);

      const normalizedItems = await this.prepareProposalItems(
        tx,
        createProposalDto.items,
      );
      const subtotal = this.calculateTotal(normalizedItems);
      const discountValue = Math.max(
        0,
        Number(createProposalDto.discount || 0),
      );
      const calculatedTotal = Math.max(0, subtotal - discountValue);

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
          userId: sellerUserId,
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
            create: normalizedItems.map((item) => ({
              kind: item.kind,
              description: item.description,
              catalogItemId: item.catalogItemId,
              quantity: item.quantity,
              hours: item.hours,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              hourType: item.hourType,
              technicianType: item.technicianType,
              totalPrice: item.totalPrice,
            })),
          },
        },
      });

      await this.createMovement(
        tx,
        proposal.id,
        actorUserId ?? sellerUserId,
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
          actorUserId: actorUserId ?? sellerUserId,
          afterPayload: {
            status: ProposalStatus.DRAFT,
            totalValue: calculatedTotal,
            clientId: createProposalDto.clientId,
            salesOpportunityId: linkedOpportunity?.id ?? null,
            sellerUserId,
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
            select: {
              id: true,
              title: true,
              stage: true,
              pipeline: true,
              opportunityType: true,
            },
          },
        },
      });
    });
  }

  async revise(id: string, revisedByUserId?: string) {
    await this.assertInternalActor(revisedByUserId);
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
          userId: source.userId,
          parentProposalId: source.id,
          items: {
            create: source.items.map((item) => ({
              kind: item.kind,
              description: item.description,
              catalogItemId: item.catalogItemId,
              quantity: item.quantity,
              hours: item.hours,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              hourType: item.hourType,
              technicianType: item.technicianType,
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
    await this.assertInternalActor(actorUserId);
    const proposal = await this.requireProposal(id, actorUserId);
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
    await this.assertInternalActor(actorUserId);
    const proposal = await this.requireProposal(id, actorUserId);
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
    await this.assertInternalActor(actorUserId);
    const proposal = await this.requireProposal(id, actorUserId);
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
    const proposal = await this.requireProposal(id, actorUserId);
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
    const proposal = await this.requireProposal(id, actorUserId);
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
    await this.assertInternalActor(actorUserId);
    const proposal = await this.requireProposal(id, actorUserId);
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
    await this.assertInternalActor(actorUserId);
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
      if (Number(proposal.totalValue || 0) <= 0) {
        throw new BadRequestException(
          'A proposta precisa ter valor maior que zero para gerar contrato.',
        );
      }
      if (proposal.generatedContract) {
        return {
          message: 'Contrato ja havia sido gerado para esta proposta.',
          contract: proposal.generatedContract,
        };
      }

      const contractCode = await this.generateNextContractCode(tx);
      const now = new Date();
      const fallbackStartDate = new Date(now);
      fallbackStartDate.setDate(now.getDate() + 7);
      const startDate =
        proposal.firstDueDate && proposal.firstDueDate > now
          ? new Date(proposal.firstDueDate)
          : fallbackStartDate;
      const endDate = this.addMonths(startDate, 12);
      const dueDay = startDate.getDate();

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

      await this.seedContractAutomation(tx, createdContract.id, actorUserId);

      await this.createMovement(
        tx,
        proposal.id,
        actorUserId,
        'CONVERT_TO_CONTRACT',
        proposal.status,
        proposal.status,
        `Proposta convertida em contrato ${createdContract.code}.`,
      );

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          action: 'CONVERT_TO_CONTRACT',
          actorUserId,
          afterPayload: {
            contractId: createdContract.id,
            contractCode: createdContract.code,
            clientId: proposal.clientId,
            generatorId: proposal.generatorId,
          },
        },
        tx,
      );

      return {
        message: 'Proposta convertida em contrato com sucesso.',
        contract: createdContract,
      };
    });
  }

  getPricingOptions() {
    return {
      hourTypes: [
        {
          value: ProposalHourType.ONE_OFF,
          label: 'Hora avulsa',
          defaultDiscountPercent: 0,
        },
        {
          value: ProposalHourType.CONTRACT,
          label: 'Hora contrato',
          defaultDiscountPercent: 20,
        },
        {
          value: ProposalHourType.EMERGENCY,
          label: 'Hora emergencia',
          defaultDiscountPercent: 0,
        },
        {
          value: ProposalHourType.TRAVEL,
          label: 'Hora deslocamento',
          defaultDiscountPercent: 0,
        },
        {
          value: ProposalHourType.ENGINEERING,
          label: 'Hora engenharia',
          defaultDiscountPercent: 0,
        },
      ],
      technicianTypes: [
        {
          value: ProposalTechnicianType.JUNIOR_TECHNICIAN,
          label: 'Tecnico junior',
        },
        {
          value: ProposalTechnicianType.MID_LEVEL_TECHNICIAN,
          label: 'Tecnico pleno',
        },
        {
          value: ProposalTechnicianType.SENIOR_TECHNICIAN,
          label: 'Tecnico senior',
        },
        {
          value: ProposalTechnicianType.APPLICATION_ENGINEER,
          label: 'Engenheiro de aplicacao',
        },
        {
          value: ProposalTechnicianType.SPECIALIST,
          label: 'Especialista',
        },
      ],
    };
  }

  async getScopeTemplates(opportunityType?: string) {
    const normalizedType = this.normalizeOpportunityType(opportunityType);
    return this.prisma.proposalScopeTemplate.findMany({
      where: {
        active: true,
        ...(normalizedType
          ? {
              OR: [
                { compatibleOpportunityTypes: { has: normalizedType } },
                { compatibleOpportunityTypes: { isEmpty: true } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        scopeText: true,
        tags: true,
        compatibleOpportunityTypes: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async lookupGenerators(query?: string, take?: string, clientId?: string) {
    const search = query?.trim();
    const limit = this.parseLookupLimit(take);
    const searchNumber = Number(search?.replace(',', '.') ?? NaN);
    const where: Prisma.GeneratorWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                assetTag: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                serialNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                brand: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                engineModelName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                installationSite: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              ...(Number.isFinite(searchNumber)
                ? [{ power: searchNumber }]
                : []),
            ],
          }
        : {}),
    };

    return this.prisma.generator.findMany({
      where,
      select: {
        id: true,
        name: true,
        assetTag: true,
        brand: true,
        serialNumber: true,
        power: true,
        voltage: true,
        engineModelName: true,
        installationSite: true,
        clientId: true,
        client: { select: { id: true, companyName: true, tradeName: true } },
        currentSite: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
    });
  }

  async createQuickGenerator(
    dto: QuickProposalGeneratorDto,
    actorUserId?: string,
  ) {
    await this.assertInternalActor(actorUserId);
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente nao encontrado para a maquina.');
    }

    if (dto.currentSiteId) {
      const site = await this.prisma.site.findUnique({
        where: { id: dto.currentSiteId },
        select: { id: true, clientId: true },
      });
      if (!site || site.clientId !== dto.clientId) {
        throw new BadRequestException(
          'Local/obra invalido para o cliente informado.',
        );
      }
    }

    if (dto.serialNumber) {
      const existing = await this.prisma.generator.findUnique({
        where: { serialNumber: dto.serialNumber },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Ja existe uma maquina com este numero de serie.',
        );
      }
    }

    return this.prisma.generator.create({
      data: {
        name: dto.name.trim(),
        assetTag: dto.assetTag?.trim() || undefined,
        brand: dto.brand?.trim() || 'Nao informado',
        engineModelName: dto.modelName?.trim() || undefined,
        serialNumber: dto.serialNumber?.trim() || undefined,
        power: Math.max(0, Number(dto.power || 0)),
        voltage: dto.voltage?.trim() || undefined,
        installationSite: dto.installationSite?.trim() || undefined,
        notes: dto.notes?.trim() || undefined,
        clientId: dto.clientId,
        currentSiteId: dto.currentSiteId,
        createdByUserId: actorUserId,
      },
      select: {
        id: true,
        name: true,
        assetTag: true,
        brand: true,
        serialNumber: true,
        power: true,
        voltage: true,
        engineModelName: true,
        installationSite: true,
        clientId: true,
        currentSite: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async findAll(actorUserId?: string) {
    const scope = await this.getActorScope(actorUserId);
    return this.prisma.proposal.findMany({
      where:
        scope?.role === UserRole.CLIENT
          ? { clientId: this.requireLinkedClientId(scope) }
          : undefined,
      include: {
        items: true,
        client: true,
        generator: true,
        salesOpportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
            pipeline: true,
            opportunityType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actorUserId?: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        items: {
          include: { catalogItem: true },
        },
        client: true,
        generator: true,
        salesOpportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
            pipeline: true,
            opportunityType: true,
          },
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

    if (!proposal) {
      throw new NotFoundException('Proposta nao encontrada.');
    }

    await this.assertProposalScope(proposal.clientId, actorUserId);
    return proposal;
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
    const scope = await this.getActorScope(actorUserId);
    return this.prisma.proposalMovement.findMany({
      where: {
        ...(scope?.role === UserRole.CLIENT
          ? {
              proposal: {
                clientId: this.requireLinkedClientId(scope),
              },
            }
          : {
              proposal: {
                userId: actorUserId,
              },
              actorUserId: {
                not: actorUserId,
              },
            }),
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
    await this.assertInternalActor(actorUserId);
    const current = await this.requireProposal(id, actorUserId);
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

  async remove(id: string, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    await this.requireProposal(id, actorUserId);
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

  async approve(id: string, actorUserId?: string) {
    return this.clientApprove(id, actorUserId);
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

  private async requireProposal(id: string, actorUserId?: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) {
      throw new NotFoundException('Proposta nao encontrada.');
    }
    await this.assertProposalScope(proposal.clientId, actorUserId);
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

  private calculateTotal(items: Array<{ totalPrice: number }>) {
    return items.reduce((acc, item) => acc + item.totalPrice, 0);
  }

  private async prepareProposalItems(
    tx: Prisma.TransactionClient,
    items: CreateProposalDto['items'],
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Adicione ao menos um item na proposta.');
    }

    const catalogIds = [
      ...new Set(
        items
          .map((item) => item.catalogItemId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const catalogItems =
      catalogIds.length > 0
        ? await tx.catalogItem.findMany({
            where: { id: { in: catalogIds }, isActive: true },
            select: { id: true, type: true, name: true },
          })
        : [];
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

    return items.map((item, index) => {
      const catalogItem = item.catalogItemId
        ? catalogById.get(item.catalogItemId)
        : null;
      if (item.catalogItemId && !catalogItem) {
        throw new BadRequestException(
          `Item ${index + 1}: catalogo informado nao existe ou esta inativo.`,
        );
      }

      const kind =
        item.kind ??
        (catalogItem?.type === 'SERVICE'
          ? ProposalItemKind.CATALOG_SERVICE
          : item.catalogItemId
            ? ProposalItemKind.PART_MATERIAL
            : ProposalItemKind.OTHER);

      if (
        (kind === ProposalItemKind.PART_MATERIAL ||
          kind === ProposalItemKind.CATALOG_SERVICE) &&
        !item.catalogItemId
      ) {
        throw new BadRequestException(
          `Item ${index + 1}: selecione um item de catalogo.`,
        );
      }

      if (kind === ProposalItemKind.HOURLY_SERVICE) {
        return this.prepareHourlyItem(item, index);
      }

      if (kind === ProposalItemKind.OTHER && !item.description?.trim()) {
        throw new BadRequestException(
          `Item ${index + 1}: descreva o item avulso.`,
        );
      }

      const quantity = Number(item.quantity ?? 1);
      const unitPrice = Number(item.unitPrice ?? 0);
      const discountPercent = this.normalizeDiscountPercent(
        item.discountPercent ?? 0,
        index,
      );
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `Item ${index + 1}: quantidade deve ser maior que zero.`,
        );
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          `Item ${index + 1}: valor de venda invalido.`,
        );
      }

      return {
        kind,
        description: item.description?.trim() || catalogItem?.name || null,
        catalogItemId: item.catalogItemId,
        quantity: Math.max(1, Math.trunc(quantity)),
        hours: null,
        unitPrice,
        discountPercent,
        hourType: null,
        technicianType: null,
        totalPrice: quantity * unitPrice * (1 - discountPercent / 100),
      };
    });
  }

  private prepareHourlyItem(
    item: CreateProposalDto['items'][number],
    index: number,
  ) {
    const hours = Number(item.hours ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const hourType = item.hourType ?? ProposalHourType.ONE_OFF;
    const discountPercent = this.normalizeDiscountPercent(
      item.discountPercent ?? (hourType === ProposalHourType.CONTRACT ? 20 : 0),
      index,
    );

    if (!Number.isFinite(hours) || hours <= 0) {
      throw new BadRequestException(
        `Item ${index + 1}: informe quantidade de horas maior que zero.`,
      );
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new BadRequestException(
        `Item ${index + 1}: informe valor hora de venda maior que zero.`,
      );
    }
    if (!item.technicianType) {
      throw new BadRequestException(
        `Item ${index + 1}: informe o tipo de tecnico.`,
      );
    }

    return {
      kind: ProposalItemKind.HOURLY_SERVICE,
      description:
        item.description?.trim() ||
        `Servico por hora - ${this.hourTypeLabel(hourType)}`,
      catalogItemId: item.catalogItemId,
      quantity: Math.max(1, Math.ceil(hours)),
      hours,
      unitPrice,
      discountPercent,
      hourType,
      technicianType: item.technicianType,
      totalPrice: hours * unitPrice * (1 - discountPercent / 100),
    };
  }

  private normalizeDiscountPercent(value: number, index: number) {
    const discount = Number(value || 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new BadRequestException(
        `Item ${index + 1}: desconto do item deve ficar entre 0 e 100%.`,
      );
    }
    return discount;
  }

  private async assertProposalSeller(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const seller = await tx.user.findFirst({
      where: { id: userId, role: UserRole.SALES, isActive: true },
      select: { id: true },
    });
    if (!seller) {
      throw new BadRequestException(
        'Vendedor da proposta deve ser um usuario comercial ativo.',
      );
    }
  }

  private normalizeOpportunityType(input?: string) {
    return input &&
      Object.values(SalesOpportunityType).includes(
        input as SalesOpportunityType,
      )
      ? (input as SalesOpportunityType)
      : undefined;
  }

  private parseLookupLimit(value?: string | number) {
    const parsed = Number(value ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.trunc(parsed), 1), 20);
  }

  private hourTypeLabel(hourType: ProposalHourType) {
    const labels: Record<ProposalHourType, string> = {
      [ProposalHourType.ONE_OFF]: 'Hora avulsa',
      [ProposalHourType.CONTRACT]: 'Hora contrato',
      [ProposalHourType.EMERGENCY]: 'Hora emergencia',
      [ProposalHourType.TRAVEL]: 'Hora deslocamento',
      [ProposalHourType.ENGINEERING]: 'Hora engenharia',
    };
    return labels[hourType] || hourType;
  }

  private async getActorScope(actorUserId?: string) {
    if (!actorUserId) {
      return null;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        role: true,
        linkedClientId: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return actor;
  }

  private requireLinkedClientId(actor: { linkedClientId: string | null }) {
    if (!actor.linkedClientId) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    return actor.linkedClientId;
  }

  private async assertInternalActor(actorUserId?: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Usuarios do portal do cliente nao podem executar esta acao.',
      );
    }
  }

  private async assertProposalScope(
    proposalClientId: string,
    actorUserId?: string,
  ) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role !== UserRole.CLIENT) {
      return;
    }

    if (proposalClientId !== this.requireLinkedClientId(actor)) {
      throw new NotFoundException('Proposta nao encontrada.');
    }
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
    actorUserId?: string,
  ) {
    const contract = await tx.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        equipments: true,
        sourceProposal: { select: { userId: true } },
      },
    });

    if (!contract) return;

    const competenceDates: Date[] = [];
    let cursor = new Date(contract.startDate);
    while (cursor <= contract.endDate) {
      competenceDates.push(new Date(cursor));
      cursor = this.addMonths(cursor, 1);
    }

    if (competenceDates.length > 0) {
      const invoiceData = competenceDates.map((competenceDate) => ({
        contractId,
        competenceDate,
        dueDate: this.buildDueDate(competenceDate, contract.dueDay),
        amount: contract.recurringAmount,
        variableAmount: 0,
        status: ContractInvoiceStatus.PENDING,
        description: `Mensalidade contrato ${contract.code}`,
      }));

      await tx.contractInvoice.createMany({
        data: invoiceData,
        skipDuplicates: true,
      });

      for (const invoice of invoiceData) {
        await this.syncReceivableFromContractInvoice(tx, {
          contractId,
          clientId: contract.clientId,
          costCenterId: contract.costCenterId,
          contractCode: contract.code,
          competenceDate: invoice.competenceDate,
          dueDate: invoice.dueDate,
          amount: invoice.amount,
          actorUserId,
          commissionUserId:
            contract.sourceProposal?.userId ?? contract.createdByUserId,
        });
      }
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
      await tx.contractPreventiveSchedule.createMany({
        data: scheduleData,
        skipDuplicates: true,
      });
    }

    await tx.generator.updateMany({
      where: {
        id: { in: contract.equipments.map((item) => item.generatorId) },
      },
      data: { hasMaintenanceContract: true },
    });
  }

  private async syncReceivableFromContractInvoice(
    tx: Prisma.TransactionClient,
    input: {
      contractId: string;
      clientId: string;
      costCenterId: string | null;
      contractCode: string;
      competenceDate: Date;
      dueDate: Date;
      amount: number;
      actorUserId?: string;
      commissionUserId?: string | null;
    },
  ) {
    const amount = Number(input.amount || 0);
    if (amount <= 0) return;

    const existing = await tx.accountsReceivable.findFirst({
      where: {
        contractId: input.contractId,
        competenceDate: input.competenceDate,
        status: { not: AccountsReceivableStatus.CANCELED },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      if (
        existing.status === AccountsReceivableStatus.OPEN ||
        existing.status === AccountsReceivableStatus.OVERDUE
      ) {
        await tx.accountsReceivable.update({
          where: { id: existing.id },
          data: {
            clientId: input.clientId,
            contractId: input.contractId,
            costCenterId: input.costCenterId,
            description: `Mensalidade contrato ${input.contractCode}`,
            competenceDate: input.competenceDate,
            dueDate: input.dueDate,
            grossAmount: amount,
            discountAmount: 0,
            netAmount: amount,
            status: AccountsReceivableStatus.OPEN,
          },
        });
      }

      await this.ensureCommissionProvision(tx, {
        userId: input.commissionUserId,
        receivableId: existing.id,
        contractId: input.contractId,
        baseAmount: amount,
        actorUserId: input.actorUserId,
      });

      return;
    }

    const receivable = await this.createContractReceivableSafely(tx, {
      clientId: input.clientId,
      contractId: input.contractId,
      costCenterId: input.costCenterId,
      description: `Mensalidade contrato ${input.contractCode}`,
      competenceDate: input.competenceDate,
      dueDate: input.dueDate,
      grossAmount: amount,
      discountAmount: 0,
      netAmount: amount,
      status: AccountsReceivableStatus.OPEN,
    });
    if (!receivable) return;

    if (input.costCenterId) {
      await tx.costCenterEntry.create({
        data: {
          costCenterId: input.costCenterId,
          entryType: CostCenterEntryType.REVENUE,
          sourceType: 'ACCOUNTS_RECEIVABLE',
          sourceId: receivable.id,
          amount,
          competenceDate: input.competenceDate,
        },
      });
    }

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivable.id,
        action: 'CREATE_FROM_CONTRACT',
        actorUserId: input.actorUserId,
        afterPayload: {
          contractId: input.contractId,
          clientId: input.clientId,
          competenceDate: input.competenceDate.toISOString(),
          dueDate: input.dueDate.toISOString(),
          amount,
        },
      },
      tx,
    );

    await this.ensureCommissionProvision(tx, {
      userId: input.commissionUserId,
      receivableId: receivable.id,
      contractId: input.contractId,
      baseAmount: amount,
      actorUserId: input.actorUserId,
    });
  }

  private async createContractReceivableSafely(
    tx: Prisma.TransactionClient,
    receivableData: Prisma.AccountsReceivableUncheckedCreateInput,
  ) {
    try {
      return await tx.accountsReceivable.create({ data: receivableData });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      return null;
    }
  }

  private async ensureCommissionProvision(
    tx: Prisma.TransactionClient,
    input: {
      userId?: string | null;
      receivableId: string;
      contractId: string;
      baseAmount: number;
      actorUserId?: string;
    },
  ) {
    if (!input.userId || input.baseAmount <= 0) return;

    const existing = await tx.commissionEntry.findFirst({
      where: {
        userId: input.userId,
        receivableId: input.receivableId,
        contractId: input.contractId,
        status: { not: CommissionStatus.CANCELED },
      },
      select: { id: true },
    });
    if (existing) return;

    const percent = await this.resolveCommissionPercent(tx, {
      userId: input.userId,
      trigger: CommissionRuleTrigger.RECEIVABLE_PAID,
    });
    const commission = await tx.commissionEntry.create({
      data: {
        userId: input.userId,
        receivableId: input.receivableId,
        contractId: input.contractId,
        baseAmount: input.baseAmount,
        percent,
        amount: Number(((input.baseAmount * percent) / 100).toFixed(2)),
        status: CommissionStatus.PENDING,
        notes:
          'Comissao provisionada automaticamente a partir de recebivel contratual.',
      },
    });

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: 'COMMISSION_ENTRY',
        entityId: commission.id,
        action: 'CREATE_FROM_CONTRACT_RECEIVABLE',
        actorUserId: input.actorUserId,
        afterPayload: {
          receivableId: input.receivableId,
          contractId: input.contractId,
          userId: input.userId,
          percent,
          amount: commission.amount,
        },
      },
      tx,
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private async resolveCommissionPercent(
    tx: Prisma.TransactionClient,
    input: {
      userId?: string | null;
      trigger: CommissionRuleTrigger;
    },
  ) {
    const now = new Date();
    const activeWindow: Prisma.CommissionRuleWhereInput = {
      active: true,
      trigger: input.trigger,
      OR: [
        { validFrom: null, validUntil: null },
        { validFrom: null, validUntil: { gte: now } },
        { validFrom: { lte: now }, validUntil: null },
        { validFrom: { lte: now }, validUntil: { gte: now } },
      ],
    };

    if (input.userId) {
      const sellerRule = await tx.commissionRule.findFirst({
        where: { ...activeWindow, sellerId: input.userId },
        orderBy: { createdAt: 'desc' },
      });
      if (sellerRule) return Number(sellerRule.percentage || 0);

      const seller = await tx.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });
      if (seller?.role) {
        const roleRule = await tx.commissionRule.findFirst({
          where: {
            ...activeWindow,
            role: seller.role,
            sellerId: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (roleRule) return Number(roleRule.percentage || 0);
      }
    }

    const generalRule = await tx.commissionRule.findFirst({
      where: { ...activeWindow, sellerId: null, role: null },
      orderBy: { createdAt: 'desc' },
    });

    return Number(
      generalRule?.percentage ?? this.defaultContractCommissionPercent,
    );
  }
}
