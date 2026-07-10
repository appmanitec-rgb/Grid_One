import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractInvoiceStatus,
  ContractStatus,
  OrderStatus,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { allAccessPolicy, effectiveAccessPolicy } from '../users/access-policy';

type DocumentState = 'ready' | 'attention' | 'pending';
type DocumentKind = 'proposal' | 'contract' | 'order';
type DocumentAudience = 'shared' | 'client' | 'internal';

type ActorScope = {
  id: string;
  role: UserRole;
  linkedClientId: string | null;
  access: ReturnType<typeof effectiveAccessPolicy>;
};

type HubItem = {
  id: string;
  code: string;
  kind: DocumentKind;
  title: string;
  counterpart: string;
  status: string;
  statusLabel: string;
  documentState: DocumentState;
  updatedAt: string;
  href: string;
  sourceHref: string;
  audience: DocumentAudience;
  issues: string[];
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: DatabaseService) {}

  async getHub(userId: string) {
    const actor = await this.getActorScope(userId);
    const company = await this.getCompanyProfile();

    const [proposals, contracts, orders] = await Promise.all([
      actor.role === UserRole.CLIENT || actor.access.pages.proposals
        ? this.loadProposalHubItems(actor)
        : Promise.resolve([]),
      actor.role === UserRole.CLIENT || actor.access.pages.contracts
        ? this.loadContractHubItems(actor)
        : Promise.resolve([]),
      actor.role === UserRole.CLIENT || actor.access.pages.orders
        ? this.loadOrderHubItems(actor)
        : Promise.resolve([]),
    ]);

    const allItems = [...proposals, ...contracts, ...orders].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );

    return {
      company,
      summary: {
        total: allItems.length,
        ready: allItems.filter((item) => item.documentState === 'ready').length,
        attention: allItems.filter((item) => item.documentState === 'attention')
          .length,
        pending: allItems.filter((item) => item.documentState === 'pending')
          .length,
        shared: allItems.filter((item) => item.audience === 'shared').length,
        byKind: {
          proposal: proposals.length,
          contract: contracts.length,
          order: orders.length,
        },
      },
      sections: {
        proposals,
        contracts,
        orders,
      },
    };
  }

  async getProposalDocument(id: string, userId: string) {
    const actor = await this.getActorScope(userId);
    const company = await this.getCompanyProfile();

    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            cnpj: true,
            contactName: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            state: true,
          },
        },
        generator: {
          select: {
            id: true,
            name: true,
            brand: true,
            serialNumber: true,
            power: true,
            currentSite: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        salesOpportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
          },
        },
        generatedContract: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        parentProposal: {
          select: {
            id: true,
            code: true,
          },
        },
        revisions: {
          select: {
            id: true,
            code: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        items: {
          include: {
            catalogItem: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
              },
            },
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Documento de proposta nao encontrado.');
    }

    this.assertProposalAccess(actor, proposal.clientId);

    return {
      kind: 'proposal' as const,
      company,
      viewerRole: actor.role,
      sourceHref: `/dashboard/proposals/${proposal.id}`,
      document: {
        id: proposal.id,
        code: proposal.code,
        status: proposal.status,
        statusLabel: this.labelProposalStatus(proposal.status),
        type: proposal.type,
        totalValue: proposal.totalValue,
        validUntil: proposal.validUntil?.toISOString() || null,
        revision: proposal.revision ?? 0,
        issuedAt: proposal.updatedAt.toISOString(),
        scope: proposal.scope,
        freight: proposal.freight,
        paymentTerm: proposal.paymentTerm,
        deliveryLeadTimeDays: proposal.deliveryLeadTimeDays,
        paymentDetails: proposal.paymentDetails,
        hasDownPayment: proposal.hasDownPayment,
        downPaymentAmount: proposal.downPaymentAmount,
        installmentCount: proposal.installmentCount,
        installmentIntervalDays: proposal.installmentIntervalDays,
        firstDueDate: proposal.firstDueDate?.toISOString() || null,
        externalNotes: proposal.externalNotes,
        generatedContract: proposal.generatedContract,
      },
      client: proposal.client,
      generator: proposal.generator,
      seller: proposal.user,
      salesOpportunity: proposal.salesOpportunity,
      related: {
        parentProposal: proposal.parentProposal,
        revisions: proposal.revisions.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          statusLabel: this.labelProposalStatus(item.status),
        })),
      },
      items: proposal.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        catalogItem: item.catalogItem,
      })),
    };
  }

  async getContractDocument(id: string, userId: string) {
    const actor = await this.getActorScope(userId);
    const company = await this.getCompanyProfile();

    const contract = await this.prisma.serviceContract.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            cnpj: true,
            contactName: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            state: true,
            isDelinquent: true,
          },
        },
        sourceProposal: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        equipments: {
          include: {
            generator: {
              select: {
                id: true,
                name: true,
                serialNumber: true,
                currentSite: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
        invoices: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('Documento de contrato nao encontrado.');
    }

    this.assertContractAccess(actor, contract.clientId);

    const overdueInvoices = contract.invoices.filter(
      (invoice) => invoice.status === ContractInvoiceStatus.OVERDUE,
    );

    return {
      kind: 'contract' as const,
      company,
      viewerRole: actor.role,
      sourceHref:
        actor.role === UserRole.CLIENT
          ? '/dashboard/client-portal'
          : `/dashboard/contracts/${contract.id}`,
      document: {
        id: contract.id,
        code: contract.code,
        title: contract.title,
        status: contract.status,
        statusLabel: this.labelContractStatus(contract.status),
        issuedAt: contract.updatedAt.toISOString(),
        startDate: contract.startDate.toISOString(),
        endDate: contract.endDate.toISOString(),
        alertDays: contract.alertDays,
        preventiveRecurrence: contract.preventiveRecurrence,
        responseTimeHours: contract.responseTimeHours,
        correctiveVisitAllowance: contract.correctiveVisitAllowance,
        partsCoverage: contract.partsCoverage,
        recurringAmount: contract.recurringAmount,
        dueDay: contract.dueDay,
        adjustmentIndex: contract.adjustmentIndex,
        adjustmentBaseMonth: contract.adjustmentBaseMonth,
        includesFuelManagement: contract.includesFuelManagement,
        notes: contract.notes,
      },
      client: contract.client,
      sourceProposal: contract.sourceProposal,
      createdByUser: contract.createdByUser,
      summary: {
        equipments: contract.equipments.length,
        overdueInvoices: overdueInvoices.length,
        pendingInvoices: contract.invoices.filter(
          (invoice) => invoice.status === ContractInvoiceStatus.PENDING,
        ).length,
      },
      equipments: contract.equipments.map((item) => ({
        id: item.id,
        coverageAmount: item.coverageAmount,
        generator: item.generator,
      })),
      invoices: contract.invoices.map((invoice) => ({
        id: invoice.id,
        dueDate: invoice.dueDate.toISOString(),
        competenceDate: invoice.competenceDate.toISOString(),
        amount: invoice.amount,
        status: invoice.status,
        statusLabel: this.labelContractInvoiceStatus(invoice.status),
        paidAt: invoice.paidAt?.toISOString() || null,
      })),
    };
  }

  async getOrderDocument(id: string, userId: string) {
    const actor = await this.getActorScope(userId);
    const company = await this.getCompanyProfile();

    const order = await this.prisma.maintenanceOrder.findUnique({
      where: { id },
      include: {
        generator: {
          select: {
            id: true,
            name: true,
            brand: true,
            serialNumber: true,
            currentSite: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            client: {
              select: {
                id: true,
                companyName: true,
                tradeName: true,
                cnpj: true,
                contactName: true,
                phone: true,
                email: true,
                address: true,
                city: true,
                state: true,
              },
            },
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
            id: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                skillLevel: true,
                department: true,
                digitalSignatureUrl: true,
              },
            },
          },
        },
        contract: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        materials: {
          include: {
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            catalogItem: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Documento de O.S. nao encontrado.');
    }

    this.assertOrderAccess(actor, order.generator.client.id);

    return {
      kind: 'order' as const,
      company,
      viewerRole: actor.role,
      sourceHref:
        actor.role === UserRole.CLIENT
          ? '/dashboard/client-portal'
          : `/dashboard/orders/${order.id}`,
      document: {
        id: order.id,
        title: order.title,
        status: order.status,
        statusLabel: this.labelOrderStatus(order.status),
        type: order.type,
        priority: order.priority,
        openedAt: order.openedAt.toISOString(),
        scheduledTo: order.scheduledTo?.toISOString() || null,
        startedAt: order.startedAt?.toISOString() || null,
        pausedAt: order.pausedAt?.toISOString() || null,
        finishedAt: order.finishedAt?.toISOString() || null,
        laborHours: order.laborHours,
        hourMeterAfter: order.hourMeterAfter,
        description: order.description,
        customerReport: order.customerReport,
        customerSignatureUrl: order.customerSignatureUrl,
        auvoId: order.auvoId,
        auvoLink: order.auvoLink,
      },
      client: order.generator.client,
      generator: {
        id: order.generator.id,
        name: order.generator.name,
        brand: order.generator.brand,
        serialNumber: order.generator.serialNumber,
        currentSite: order.generator.currentSite,
      },
      site: order.site,
      contract: order.contract,
      technician: order.technician,
      summary: {
        hasReport: Boolean(order.customerReport),
        hasSignature: Boolean(order.customerSignatureUrl),
        materials: order.materials.length,
        materialCost: order.materials.reduce(
          (sum, item) =>
            sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
          0,
        ),
      },
      checklist: this.summarizeChecklist(order.checklistData),
      materials: order.materials.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitCost: item.unitCost,
        reservedAt: item.reservedAt?.toISOString() || null,
        warehouse: item.warehouse,
        catalogItem: item.catalogItem,
      })),
    };
  }

  private async loadProposalHubItems(actor: ActorScope) {
    const proposals = await this.prisma.proposal.findMany({
      where:
        actor.role === UserRole.CLIENT
          ? {
              clientId: this.requireLinkedClientId(actor),
              status: {
                in: [
                  ProposalStatus.CLIENT_REVIEW,
                  ProposalStatus.REVISION_REQUIRED,
                  ProposalStatus.WON,
                  ProposalStatus.LOST,
                ],
              },
            }
          : actor.role === UserRole.ADMIN
            ? {
                status: {
                  not: ProposalStatus.DRAFT,
                },
              }
            : {
                userId: actor.id,
              },
      include: {
        client: {
          select: {
            companyName: true,
            tradeName: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    return proposals.map((proposal) => {
      const issues: string[] = [];
      let documentState: DocumentState = 'ready';

      if (
        proposal._count.items === 0 ||
        proposal.status === ProposalStatus.DRAFT
      ) {
        documentState = 'pending';
      }

      if (
        (
          [
            ProposalStatus.BOARD_REVIEW,
            ProposalStatus.DISCOUNT_REVIEW,
            ProposalStatus.REVISION_REQUIRED,
          ] as ProposalStatus[]
        ).includes(proposal.status)
      ) {
        documentState = 'attention';
      }

      if (proposal._count.items === 0) {
        issues.push('Sem itens comerciais vinculados.');
      }
      if (proposal.status === ProposalStatus.DRAFT) {
        issues.push('Documento ainda em rascunho.');
      }
      if (proposal.status === ProposalStatus.REVISION_REQUIRED) {
        issues.push('Versao pede ajustes antes do envio final.');
      }
      if (proposal.status === ProposalStatus.BOARD_REVIEW) {
        issues.push('Aguardando decisao da diretoria.');
      }
      if (proposal.status === ProposalStatus.DISCOUNT_REVIEW) {
        issues.push('Desconto acima do limite em avaliacao.');
      }

      return {
        id: proposal.id,
        code: proposal.code,
        kind: 'proposal',
        title: `Proposta ${proposal.code}`,
        counterpart: proposal.client.tradeName || proposal.client.companyName,
        status: proposal.status,
        statusLabel: this.labelProposalStatus(proposal.status),
        documentState,
        updatedAt: proposal.updatedAt.toISOString(),
        href: `/dashboard/documents/proposals/${proposal.id}`,
        sourceHref: `/dashboard/proposals/${proposal.id}`,
        audience: 'shared',
        issues,
      } satisfies HubItem;
    });
  }

  private async loadContractHubItems(actor: ActorScope) {
    const contracts = await this.prisma.serviceContract.findMany({
      where:
        actor.role === UserRole.CLIENT
          ? {
              clientId: this.requireLinkedClientId(actor),
            }
          : undefined,
      include: {
        client: {
          select: {
            companyName: true,
            tradeName: true,
          },
        },
        invoices: {
          where: {
            status: {
              in: [
                ContractInvoiceStatus.PENDING,
                ContractInvoiceStatus.OVERDUE,
              ],
            },
          },
          take: 3,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    return contracts.map((contract) => {
      const issues: string[] = [];
      let documentState: DocumentState = 'ready';

      if (
        contract.status === ContractStatus.SUSPENDED ||
        contract.status === ContractStatus.RENEWAL
      ) {
        documentState = 'attention';
      }

      if (
        contract.invoices.some(
          (invoice) => invoice.status === ContractInvoiceStatus.OVERDUE,
        )
      ) {
        documentState = 'attention';
        issues.push('Existe faturamento vencido ligado ao contrato.');
      }

      if (contract.status === ContractStatus.SUSPENDED) {
        issues.push('Contrato suspenso.');
      }
      if (contract.status === ContractStatus.RENEWAL) {
        issues.push('Contrato em janela de renovacao.');
      }

      return {
        id: contract.id,
        code: contract.code,
        kind: 'contract',
        title: `Contrato ${contract.code}`,
        counterpart: contract.client.tradeName || contract.client.companyName,
        status: contract.status,
        statusLabel: this.labelContractStatus(contract.status),
        documentState,
        updatedAt: contract.updatedAt.toISOString(),
        href: `/dashboard/documents/contracts/${contract.id}`,
        sourceHref:
          actor.role === UserRole.CLIENT
            ? '/dashboard/client-portal'
            : `/dashboard/contracts/${contract.id}`,
        audience: 'shared',
        issues,
      } satisfies HubItem;
    });
  }

  private async loadOrderHubItems(actor: ActorScope) {
    const orders = await this.prisma.maintenanceOrder.findMany({
      where:
        actor.role === UserRole.CLIENT
          ? {
              generator: {
                clientId: this.requireLinkedClientId(actor),
              },
              status: {
                in: [
                  OrderStatus.OPEN,
                  OrderStatus.IN_PROGRESS,
                  OrderStatus.COMPLETED,
                ],
              },
            }
          : {
              status: {
                in: [
                  OrderStatus.OPEN,
                  OrderStatus.IN_PROGRESS,
                  OrderStatus.COMPLETED,
                ],
              },
            },
      include: {
        generator: {
          select: {
            client: {
              select: {
                companyName: true,
                tradeName: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    return orders.map((order) => {
      const issues: string[] = [];
      let documentState: DocumentState = 'ready';
      let audience: DocumentAudience = 'shared';

      if (!order.customerReport) {
        documentState = 'pending';
        audience = 'internal';
        issues.push('Relatorio tecnico ainda nao foi submetido.');
      } else if (!order.customerSignatureUrl) {
        documentState = 'attention';
        issues.push('Assinatura do cliente ainda nao foi anexada.');
      }

      return {
        id: order.id,
        code: order.id.slice(0, 8).toUpperCase(),
        kind: 'order',
        title: order.title,
        counterpart:
          order.generator.client.tradeName ||
          order.generator.client.companyName,
        status: order.status,
        statusLabel: this.labelOrderStatus(order.status),
        documentState,
        updatedAt: order.updatedAt.toISOString(),
        href: `/dashboard/documents/orders/${order.id}`,
        sourceHref:
          actor.role === UserRole.CLIENT
            ? '/dashboard/client-portal'
            : `/dashboard/orders/${order.id}`,
        audience,
        issues,
      } satisfies HubItem;
    });
  }

  private async getActorScope(userId: string): Promise<ActorScope> {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isSystemMaster: true,
        accessPolicy: true,
        linkedClientId: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return {
      id: actor.id,
      role: actor.role,
      linkedClientId: actor.linkedClientId,
      access: actor.isSystemMaster
        ? allAccessPolicy
        : effectiveAccessPolicy(actor.role, actor.accessPolicy),
    };
  }

  private assertProposalAccess(actor: ActorScope, clientId: string) {
    if (actor.role === UserRole.CLIENT) {
      if (this.requireLinkedClientId(actor) !== clientId) {
        throw new ForbiddenException(
          'Documento de proposta fora do escopo deste cliente.',
        );
      }

      return;
    }

    if (!actor.access.pages.proposals) {
      throw new ForbiddenException(
        'Seu perfil nao possui acesso a documentos de proposta.',
      );
    }
  }

  private assertContractAccess(actor: ActorScope, clientId: string) {
    if (actor.role === UserRole.CLIENT) {
      if (this.requireLinkedClientId(actor) !== clientId) {
        throw new ForbiddenException(
          'Documento de contrato fora do escopo deste cliente.',
        );
      }

      return;
    }

    if (!actor.access.pages.contracts) {
      throw new ForbiddenException(
        'Seu perfil nao possui acesso a documentos de contrato.',
      );
    }
  }

  private assertOrderAccess(actor: ActorScope, clientId: string) {
    if (actor.role === UserRole.CLIENT) {
      if (this.requireLinkedClientId(actor) !== clientId) {
        throw new ForbiddenException(
          'Documento de O.S. fora do escopo deste cliente.',
        );
      }

      return;
    }

    if (!actor.access.pages.orders) {
      throw new ForbiddenException(
        'Seu perfil nao possui acesso a documentos de O.S.',
      );
    }
  }

  private requireLinkedClientId(actor: ActorScope) {
    if (!actor.linkedClientId) {
      throw new ForbiddenException(
        'Conta do cliente sem empresa vinculada ao portal.',
      );
    }

    return actor.linkedClientId;
  }

  private async getCompanyProfile() {
    const company =
      (await this.prisma.companySettings.findFirst({
        where: { isPrimary: true },
        select: {
          companyName: true,
          tradeName: true,
          cnpj: true,
          phone: true,
          email: true,
          billingEmail: true,
          address: true,
          addressNumber: true,
          district: true,
          city: true,
          state: true,
          zipCode: true,
          logoUrl: true,
          website: true,
          primaryColor: true,
          secondaryColor: true,
        },
      })) ||
      (await this.prisma.companySettings.findFirst({
        select: {
          companyName: true,
          tradeName: true,
          cnpj: true,
          phone: true,
          email: true,
          billingEmail: true,
          address: true,
          addressNumber: true,
          district: true,
          city: true,
          state: true,
          zipCode: true,
          logoUrl: true,
          website: true,
          primaryColor: true,
          secondaryColor: true,
        },
      }));

    return {
      companyName: company?.companyName || 'MANITEC',
      tradeName: company?.tradeName || company?.companyName || 'MANITEC',
      cnpj: company?.cnpj || null,
      phone: company?.phone || null,
      email: company?.email || null,
      billingEmail: company?.billingEmail || null,
      address: company?.address || null,
      addressNumber: company?.addressNumber || null,
      district: company?.district || null,
      city: company?.city || null,
      state: company?.state || null,
      zipCode: company?.zipCode || null,
      logoUrl: company?.logoUrl || null,
      website: company?.website || null,
      primaryColor: company?.primaryColor || null,
      secondaryColor: company?.secondaryColor || null,
    };
  }

  private summarizeChecklist(checklistData: unknown) {
    if (!checklistData || typeof checklistData !== 'object') {
      return [] as Array<{ label: string; value: string }>;
    }

    return Object.entries(checklistData as Record<string, unknown>)
      .map(([key, value]) => ({
        label: this.humanizeKey(key),
        value: this.describeChecklistValue(value),
      }))
      .filter((entry) => entry.value.length > 0)
      .slice(0, 12);
  }

  private humanizeKey(value: string) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  private describeChecklistValue(value: unknown): string {
    if (value == null) {
      return '';
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Nao';
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.describeChecklistValue(item))
        .filter(Boolean)
        .join(', ');
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(
          ([key, itemValue]) =>
            `${this.humanizeKey(key)}: ${this.describeChecklistValue(itemValue)}`,
        )
        .filter(Boolean)
        .join(' | ');
    }

    if (typeof value === 'symbol') {
      return value.description || 'Simbolo';
    }

    return 'Valor registrado';
  }

  private labelProposalStatus(status: ProposalStatus) {
    const labels: Record<ProposalStatus, string> = {
      DRAFT: 'Rascunho',
      BOARD_REVIEW: 'Diretoria',
      REVISION_REQUIRED: 'Revisao',
      CLIENT_REVIEW: 'Cliente',
      DISCOUNT_REVIEW: 'Desconto',
      WON: 'Ganha',
      LOST: 'Perdida',
      SENT: 'Enviada',
      APPROVED: 'Aprovada',
      REJECTED: 'Rejeitada',
    };

    return labels[status];
  }

  private labelContractStatus(status: ContractStatus) {
    const labels: Record<ContractStatus, string> = {
      ACTIVE: 'Ativo',
      SUSPENDED: 'Suspenso',
      CANCELED: 'Cancelado',
      RENEWAL: 'Renovacao',
    };

    return labels[status];
  }

  private labelContractInvoiceStatus(status: ContractInvoiceStatus) {
    const labels: Record<ContractInvoiceStatus, string> = {
      PENDING: 'Pendente',
      PAID: 'Paga',
      OVERDUE: 'Vencida',
      CANCELED: 'Cancelada',
    };

    return labels[status];
  }

  private labelOrderStatus(status: OrderStatus) {
    const labels: Record<OrderStatus, string> = {
      OPEN: 'Aberta',
      IN_PROGRESS: 'Em andamento',
      COMPLETED: 'Concluida',
      CANCELED: 'Cancelada',
    };

    return labels[status];
  }
}
