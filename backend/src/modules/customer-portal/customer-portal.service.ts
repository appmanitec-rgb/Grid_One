import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  AuditDomain,
  OpportunityTemperature,
  OrderStatus,
  Prisma,
  ProposalStatus,
  SalesOpportunityStage,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateCustomerQuoteRequestDto,
  CustomerProposalDecisionDto,
} from './dto/customer-portal.dto';

const CUSTOMER_PORTAL_SOURCE = 'CUSTOMER_PORTAL';

type RequestMetadata = {
  ip?: string;
  userAgent?: string;
};

type CustomerScope = {
  userId: string;
  clientId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  client: {
    id: string;
    companyName: string;
    tradeName: string | null;
    email: string | null;
    phone: string;
    contactName: string | null;
    city: string;
    state: string;
    isDelinquent: boolean;
  };
};

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async me(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return {
      user: scope.user,
      client: scope.client,
    };
  }

  async dashboard(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    const now = new Date();
    const openOpportunityStages = [
      SalesOpportunityStage.PROSPECTION,
      SalesOpportunityStage.SITE_SURVEY_SCHEDULED,
      SalesOpportunityStage.PROPOSAL_SENT,
      SalesOpportunityStage.NEGOTIATION,
    ];

    const [
      equipmentCount,
      awaitingProposals,
      openOrders,
      openQuoteRequests,
      activeContracts,
      recentDocuments,
      recentOrders,
      recentProposals,
      upcomingPreventives,
    ] = await Promise.all([
      this.prisma.generator.count({ where: { clientId: scope.clientId } }),
      this.prisma.proposal.count({
        where: {
          clientId: scope.clientId,
          status: ProposalStatus.CLIENT_REVIEW,
        },
      }),
      this.prisma.maintenanceOrder.count({
        where: {
          generator: { clientId: scope.clientId },
          status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.salesOpportunity.count({
        where: {
          clientId: scope.clientId,
          source: CUSTOMER_PORTAL_SOURCE,
          stage: { in: openOpportunityStages },
        },
      }),
      this.prisma.serviceContract.count({
        where: { clientId: scope.clientId, status: 'ACTIVE' },
      }),
      this.prisma.documentDelivery.findMany({
        where: { clientId: scope.clientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          documentType: true,
          documentId: true,
          documentCode: true,
          documentTitle: true,
          status: true,
          channel: true,
          sentAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      }),
      this.listOrdersInternal(scope.clientId, 5),
      this.listProposalsInternal(scope.clientId, 5),
      this.prisma.contractPreventiveSchedule.findMany({
        where: {
          generator: { clientId: scope.clientId },
          scheduledDate: { gte: now },
          status: 'PLANNED',
        },
        orderBy: { scheduledDate: 'asc' },
        take: 5,
        select: {
          id: true,
          scheduledDate: true,
          status: true,
          generator: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
            },
          },
          contract: {
            select: {
              id: true,
              code: true,
              title: true,
            },
          },
        },
      }),
    ]);

    return {
      client: scope.client,
      stats: {
        equipmentCount,
        awaitingProposals,
        openOrders,
        openQuoteRequests,
        activeContracts,
        recentDocuments: recentDocuments.length,
      },
      recentOrders,
      recentProposals,
      recentDocuments,
      upcomingPreventives,
    };
  }

  async listEquipment(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    const rows = await this.prisma.generator.findMany({
      where: { clientId: scope.clientId },
      orderBy: { name: 'asc' },
      include: {
        model: { select: { id: true, name: true, brand: true } },
        currentSite: { select: { id: true, name: true, code: true } },
        orders: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            scheduledTo: true,
            finishedAt: true,
            updatedAt: true,
          },
        },
        contractSchedules: {
          where: {
            scheduledDate: { gte: new Date() },
            status: 'PLANNED',
          },
          orderBy: { scheduledDate: 'asc' },
          take: 1,
          select: {
            id: true,
            scheduledDate: true,
            status: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      ...row,
      lastOrder: row.orders[0] ?? null,
      nextPreventive: row.contractSchedules[0] ?? null,
      orders: undefined,
      contractSchedules: undefined,
    }));
  }

  async getEquipment(userId: string | undefined, equipmentId: string) {
    const scope = await this.requireCustomerScope(userId);
    const equipment = await this.prisma.generator.findFirst({
      where: {
        id: equipmentId,
        clientId: scope.clientId,
      },
      include: {
        model: { select: { id: true, name: true, brand: true } },
        currentSite: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        orders: {
          orderBy: { updatedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            type: true,
            priority: true,
            scheduledTo: true,
            openedAt: true,
            closedAt: true,
            finishedAt: true,
            customerReport: true,
            technician: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        contractSchedules: {
          where: {
            scheduledDate: { gte: new Date() },
            status: 'PLANNED',
          },
          orderBy: { scheduledDate: 'asc' },
          take: 6,
          select: {
            id: true,
            scheduledDate: true,
            status: true,
            contract: { select: { id: true, code: true, title: true } },
          },
        },
        contractLinks: {
          select: {
            contract: {
              select: {
                id: true,
                code: true,
                title: true,
                status: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
      },
    });

    if (!equipment) {
      throw new NotFoundException('Equipamento nao encontrado.');
    }

    return equipment;
  }

  async listProposals(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return this.listProposalsInternal(scope.clientId, 50);
  }

  async getProposal(userId: string | undefined, proposalId: string) {
    const scope = await this.requireCustomerScope(userId);
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id: proposalId,
        clientId: scope.clientId,
      },
      select: this.customerProposalSelect(),
    });

    if (!proposal) {
      throw new NotFoundException('Proposta nao encontrada.');
    }

    return proposal;
  }

  async approveProposal(
    userId: string | undefined,
    proposalId: string,
    dto: CustomerProposalDecisionDto,
    metadata: RequestMetadata,
  ) {
    return this.decideProposal(userId, proposalId, ProposalStatus.WON, {
      action: 'CUSTOMER_PORTAL_APPROVE',
      note: dto.note || 'Cliente aprovou a proposta pelo portal.',
      metadata,
    });
  }

  async rejectProposal(
    userId: string | undefined,
    proposalId: string,
    dto: CustomerProposalDecisionDto,
    metadata: RequestMetadata,
  ) {
    return this.decideProposal(userId, proposalId, ProposalStatus.LOST, {
      action: 'CUSTOMER_PORTAL_REJECT',
      note: dto.note || 'Cliente recusou a proposta pelo portal.',
      metadata,
    });
  }

  async createQuoteRequest(
    userId: string | undefined,
    dto: CreateCustomerQuoteRequestDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const [equipment, site] = await Promise.all([
      dto.equipmentId
        ? this.prisma.generator.findFirst({
            where: { id: dto.equipmentId, clientId: scope.clientId },
            select: {
              id: true,
              name: true,
              serialNumber: true,
              currentSiteId: true,
            },
          })
        : Promise.resolve(null),
      dto.siteId
        ? this.prisma.site.findFirst({
            where: { id: dto.siteId, clientId: scope.clientId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (dto.equipmentId && !equipment) {
      throw new NotFoundException('Equipamento nao encontrado.');
    }

    if (dto.siteId && !site) {
      throw new NotFoundException('Local nao encontrado.');
    }

    const resolvedSiteId = dto.siteId ?? equipment?.currentSiteId ?? undefined;
    const notes = [
      `Origem: ${CUSTOMER_PORTAL_SOURCE}`,
      `Tipo de servico: ${dto.serviceType}`,
      `Urgencia: ${dto.urgency}`,
      `Contato: ${dto.contactName}`,
      dto.contactPhone ? `Telefone: ${dto.contactPhone}` : null,
      dto.contactEmail ? `E-mail: ${dto.contactEmail}` : null,
      equipment
        ? `Equipamento: ${equipment.name}${equipment.serialNumber ? ` (${equipment.serialNumber})` : ''}`
        : null,
      '',
      dto.description,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const created = await this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.salesOpportunity.create({
        data: {
          title: `[Portal] ${dto.serviceType} - ${
            scope.client.tradeName || scope.client.companyName
          }`,
          clientId: scope.clientId,
          siteId: resolvedSiteId,
          stage: SalesOpportunityStage.PROSPECTION,
          temperature: this.mapUrgencyToTemperature(dto.urgency),
          source: CUSTOMER_PORTAL_SOURCE,
          notes,
        },
        include: {
          client: { select: { id: true, companyName: true, tradeName: true } },
          site: { select: { id: true, name: true } },
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.OPPORTUNITIES,
          entityType: 'SALES_OPPORTUNITY',
          entityId: opportunity.id,
          action: 'CUSTOMER_PORTAL_QUOTE_REQUEST',
          actorUserId: scope.userId,
          afterPayload: {
            clientId: scope.clientId,
            equipmentId: equipment?.id ?? null,
            siteId: resolvedSiteId ?? null,
            serviceType: dto.serviceType,
            urgency: dto.urgency,
            contactName: dto.contactName,
            ip: metadata.ip ?? null,
            userAgent: metadata.userAgent ?? null,
          },
        },
        tx,
      );

      return opportunity;
    });

    return {
      message: 'Solicitacao registrada com sucesso.',
      quoteRequest: created,
    };
  }

  async listQuoteRequests(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return this.prisma.salesOpportunity.findMany({
      where: {
        clientId: scope.clientId,
        source: CUSTOMER_PORTAL_SOURCE,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        stage: true,
        temperature: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, name: true } },
      },
    });
  }

  async listOrders(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return this.listOrdersInternal(scope.clientId, 50);
  }

  async getOrder(userId: string | undefined, orderId: string) {
    const scope = await this.requireCustomerScope(userId);
    const order = await this.prisma.maintenanceOrder.findFirst({
      where: {
        id: orderId,
        generator: { clientId: scope.clientId },
      },
      select: this.customerOrderSelect(),
    });

    if (!order) {
      throw new NotFoundException('OS nao encontrada.');
    }

    return order;
  }

  async listDocuments(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return this.prisma.documentDelivery.findMany({
      where: { clientId: scope.clientId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        documentType: true,
        documentId: true,
        documentCode: true,
        documentTitle: true,
        channel: true,
        status: true,
        recipientName: true,
        subject: true,
        sentAt: true,
        deliveredAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async listFinancial(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    return this.prisma.accountsReceivable.findMany({
      where: {
        clientId: scope.clientId,
        status: { not: AccountsReceivableStatus.CANCELED },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 80,
      select: {
        id: true,
        description: true,
        dueDate: true,
        grossAmount: true,
        netAmount: true,
        paidAmount: true,
        status: true,
        contract: { select: { id: true, code: true, title: true } },
        maintenanceOrder: { select: { id: true, title: true, status: true } },
      },
    });
  }

  private async decideProposal(
    userId: string | undefined,
    proposalId: string,
    nextStatus: ProposalStatus,
    input: {
      action: string;
      note: string;
      metadata: RequestMetadata;
    },
  ) {
    const scope = await this.requireCustomerScope(userId);
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findFirst({
        where: {
          id: proposalId,
          clientId: scope.clientId,
        },
      });

      if (!proposal) {
        throw new NotFoundException('Proposta nao encontrada.');
      }

      if (proposal.status !== ProposalStatus.CLIENT_REVIEW) {
        throw new BadRequestException(
          'A proposta nao esta disponivel para decisao do cliente.',
        );
      }

      if (
        nextStatus === ProposalStatus.WON &&
        proposal.validUntil &&
        proposal.validUntil.getTime() < Date.now()
      ) {
        throw new BadRequestException(
          'Proposta vencida nao pode ser aprovada.',
        );
      }

      const now = new Date();
      const updated = await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          status: nextStatus,
          requestedDiscountPercent: null,
          requestedDiscountReason: null,
          customerDecisionAt: now,
          customerDecisionByUserId: scope.userId,
          customerDecisionSource: CUSTOMER_PORTAL_SOURCE,
          customerDecisionNote: input.note,
        },
        select: this.customerProposalSelect(),
      });

      await tx.proposalMovement.create({
        data: {
          proposalId: proposal.id,
          actorUserId: scope.userId,
          action: input.action,
          fromStatus: proposal.status,
          toStatus: nextStatus,
          note: input.note,
        },
      });

      if (proposal.salesOpportunityId) {
        await tx.salesOpportunity.update({
          where: { id: proposal.salesOpportunityId },
          data: {
            stage:
              nextStatus === ProposalStatus.WON
                ? SalesOpportunityStage.WON
                : SalesOpportunityStage.LOST,
            wonAt: nextStatus === ProposalStatus.WON ? now : undefined,
            lostAt: nextStatus === ProposalStatus.LOST ? now : undefined,
          },
        });
      }

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          action: input.action,
          actorUserId: scope.userId,
          beforePayload: {
            status: proposal.status,
            customerDecisionAt:
              proposal.customerDecisionAt?.toISOString() ?? null,
          },
          afterPayload: {
            status: nextStatus,
            clientId: scope.clientId,
            customerDecisionAt: now.toISOString(),
            customerDecisionByUserId: scope.userId,
            customerDecisionSource: CUSTOMER_PORTAL_SOURCE,
            note: input.note,
            ip: input.metadata.ip ?? null,
            userAgent: input.metadata.userAgent ?? null,
          },
          reason: input.note,
        },
        tx,
      );

      return {
        message:
          nextStatus === ProposalStatus.WON
            ? 'Proposta aprovada com sucesso.'
            : 'Proposta recusada com sucesso.',
        proposal: updated,
      };
    });
  }

  private async requireCustomerScope(
    userId: string | undefined,
  ): Promise<CustomerScope> {
    if (!userId) {
      throw new UnauthorizedException('Usuario nao identificado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        linkedClientId: true,
        linkedClient: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            email: true,
            phone: true,
            contactName: true,
            city: true,
            state: true,
            isDelinquent: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario indisponivel para o portal.');
    }

    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'A area do cliente e exclusiva para usuarios externos.',
      );
    }

    if (!user.linkedClientId || !user.linkedClient) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    return {
      userId: user.id,
      clientId: user.linkedClientId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      client: user.linkedClient,
    };
  }

  private listProposalsInternal(clientId: string, take: number) {
    return this.prisma.proposal.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        code: true,
        status: true,
        type: true,
        totalValue: true,
        validUntil: true,
        externalNotes: true,
        customerDecisionAt: true,
        customerDecisionSource: true,
        generator: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
          },
        },
        generatedContract: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  private listOrdersInternal(clientId: string, take: number) {
    return this.prisma.maintenanceOrder.findMany({
      where: { generator: { clientId } },
      orderBy: [{ scheduledTo: 'asc' }, { updatedAt: 'desc' }],
      take,
      select: this.customerOrderSelect(),
    });
  }

  private customerProposalSelect() {
    return {
      id: true,
      code: true,
      status: true,
      type: true,
      totalValue: true,
      validUntil: true,
      scope: true,
      freight: true,
      paymentTerm: true,
      paymentDetails: true,
      deliveryLeadTimeDays: true,
      externalNotes: true,
      customerDecisionAt: true,
      customerDecisionSource: true,
      customerDecisionNote: true,
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          power: true,
        },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          catalogItem: {
            select: {
              id: true,
              sku: true,
              name: true,
              commercialDescription: true,
              unit: true,
              type: true,
            },
          },
        },
      },
      generatedContract: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
        },
      },
      movements: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          note: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
        },
      },
      updatedAt: true,
      createdAt: true,
    } satisfies Prisma.ProposalSelect;
  }

  private customerOrderSelect() {
    return {
      id: true,
      title: true,
      description: true,
      status: true,
      type: true,
      priority: true,
      customerReport: true,
      customerSignatureUrl: true,
      scheduledTo: true,
      openedAt: true,
      closedAt: true,
      startedAt: true,
      finishedAt: true,
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          power: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      technician: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      contract: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
        },
      },
      updatedAt: true,
    } satisfies Prisma.MaintenanceOrderSelect;
  }

  private mapUrgencyToTemperature(
    urgency: CreateCustomerQuoteRequestDto['urgency'],
  ) {
    if (urgency === 'HIGH' || urgency === 'EMERGENCY') {
      return OpportunityTemperature.HOT;
    }

    if (urgency === 'LOW') {
      return OpportunityTemperature.COLD;
    }

    return OpportunityTemperature.WARM;
  }
}
