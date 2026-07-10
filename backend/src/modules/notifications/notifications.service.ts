import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  ApprovalStatus,
  ApprovalType,
  ContractInvoiceStatus,
  ContractStatus,
  OrderStatus,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { allAccessPolicy, effectiveAccessPolicy } from '../users/access-policy';

type NotificationTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
type NotificationPriority = 'high' | 'medium' | 'low';
type NotificationCategory =
  | 'approval'
  | 'proposal'
  | 'contract'
  | 'order'
  | 'finance'
  | 'update';

type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  href: string;
  entityType: string;
  entityId: string;
  tone: NotificationTone;
  priority: NotificationPriority;
  statusLabel?: string;
  actionLabel?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: DatabaseService) {}

  async getInbox(userId: string, limit = 40) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        isSystemMaster: true,
        accessPolicy: true,
        linkedClientId: true,
        technicianProfile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const access = actor.isSystemMaster
      ? allAccessPolicy
      : effectiveAccessPolicy(actor.role, actor.accessPolicy);

    const items =
      actor.role === UserRole.CLIENT
        ? await this.buildClientInbox(actor.id, actor.linkedClientId)
        : await this.buildInternalInbox({
            ...actor,
            access,
          });

    const sorted = items.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
    const limited = sorted.slice(0, Math.max(1, Math.min(limit, 80)));

    return {
      userRole: actor.role,
      summary: {
        total: sorted.length,
        actionRequired: sorted.filter((item) => item.priority !== 'low').length,
        highPriority: sorted.filter((item) => item.priority === 'high').length,
        byCategory: this.countByCategory(sorted),
      },
      items: limited,
    };
  }

  private async buildInternalInbox(input: {
    id: string;
    role: UserRole;
    linkedClientId: string | null;
    technicianProfile: { id: string } | null;
    access: ReturnType<typeof effectiveAccessPolicy>;
  }) {
    const now = new Date();
    const dueSoon = new Date(now);
    dueSoon.setDate(dueSoon.getDate() + 7);

    const [
      approvals,
      proposalAlerts,
      proposalUpdates,
      contractAlerts,
      orderAlerts,
      receivableAlerts,
    ] = await Promise.all([
      this.fetchPendingApprovals(input.id, input.role),
      input.access.pages.proposals
        ? this.fetchInternalProposalAlerts(input.id, input.role)
        : Promise.resolve([]),
      input.access.pages.proposals && input.role !== UserRole.ADMIN
        ? this.fetchProposalUpdates(input.id)
        : Promise.resolve([]),
      input.access.pages.contracts
        ? this.fetchContractAlerts()
        : Promise.resolve([]),
      input.access.pages.orders
        ? this.fetchOrderAlerts(input.role, input.technicianProfile?.id)
        : Promise.resolve([]),
      input.access.pages.contracts
        ? this.fetchReceivableAlerts(now, dueSoon)
        : Promise.resolve([]),
    ]);

    return [
      ...approvals.map((approval) => this.mapApprovalNotification(approval)),
      ...proposalAlerts.map((proposal) =>
        this.mapInternalProposalNotification(proposal, input.role),
      ),
      ...proposalUpdates.map((movement) =>
        this.mapProposalUpdateNotification(movement),
      ),
      ...contractAlerts.map((contract) =>
        this.mapContractNotification(contract),
      ),
      ...orderAlerts.map((order) =>
        this.mapInternalOrderNotification(order, input.role),
      ),
      ...receivableAlerts.map((entry) =>
        this.mapReceivableNotification(entry, false),
      ),
    ];
  }

  private async buildClientInbox(
    userId: string,
    linkedClientId: string | null,
  ) {
    if (!linkedClientId) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    const now = new Date();
    const dueSoon = new Date(now);
    dueSoon.setDate(dueSoon.getDate() + 7);

    const [proposals, contracts, orders, receivables] = await Promise.all([
      this.prisma.proposal.findMany({
        where: {
          clientId: linkedClientId,
          status: {
            in: [
              ProposalStatus.CLIENT_REVIEW,
              ProposalStatus.REVISION_REQUIRED,
              ProposalStatus.WON,
            ],
          },
        },
        include: {
          client: {
            select: { companyName: true, tradeName: true },
          },
          generator: {
            select: { id: true, name: true, serialNumber: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.serviceContract.findMany({
        where: {
          clientId: linkedClientId,
          OR: [
            {
              status: {
                in: [ContractStatus.SUSPENDED, ContractStatus.RENEWAL],
              },
            },
            {
              invoices: {
                some: {
                  status: ContractInvoiceStatus.OVERDUE,
                },
              },
            },
          ],
        },
        include: {
          client: {
            select: { companyName: true, tradeName: true },
          },
          invoices: {
            where: {
              status: {
                in: [
                  ContractInvoiceStatus.OVERDUE,
                  ContractInvoiceStatus.PENDING,
                ],
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 2,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.maintenanceOrder.findMany({
        where: {
          generator: {
            clientId: linkedClientId,
          },
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
            include: {
              client: {
                select: { companyName: true, tradeName: true },
              },
            },
          },
          technician: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.accountsReceivable.findMany({
        where: {
          clientId: linkedClientId,
          status: {
            in: [
              AccountsReceivableStatus.OPEN,
              AccountsReceivableStatus.OVERDUE,
            ],
          },
        },
        include: {
          client: {
            select: { companyName: true, tradeName: true },
          },
          contract: {
            select: { id: true, code: true },
          },
          maintenanceOrder: {
            select: { id: true, title: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }],
        take: 8,
      }),
    ]);

    return [
      ...proposals.map((proposal) =>
        this.mapClientProposalNotification(proposal),
      ),
      ...contracts.map((contract) =>
        this.mapClientContractNotification(contract),
      ),
      ...orders.map((order) => this.mapClientOrderNotification(order)),
      ...receivables.map((entry) =>
        this.mapReceivableNotification(entry, true, now, dueSoon),
      ),
    ];
  }

  private async fetchPendingApprovals(userId: string, role: UserRole) {
    return this.prisma.approvalRequest.findMany({
      where:
        role === UserRole.ADMIN
          ? { status: ApprovalStatus.PENDING }
          : {
              status: ApprovalStatus.PENDING,
              approverUserId: userId,
            },
      include: {
        requesterUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
  }

  private async fetchInternalProposalAlerts(userId: string, role: UserRole) {
    return this.prisma.proposal.findMany({
      where:
        role === UserRole.ADMIN
          ? {
              status: ProposalStatus.BOARD_REVIEW,
            }
          : {
              userId,
              status: {
                in: [
                  ProposalStatus.CLIENT_REVIEW,
                  ProposalStatus.REVISION_REQUIRED,
                  ProposalStatus.DISCOUNT_REVIEW,
                ],
              },
            },
      include: {
        client: {
          select: { companyName: true, tradeName: true },
        },
        generator: {
          select: { name: true, serialNumber: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });
  }

  private async fetchProposalUpdates(userId: string) {
    return this.prisma.proposalMovement.findMany({
      where: {
        proposal: {
          userId,
        },
        actorUserId: {
          not: userId,
        },
      },
      include: {
        proposal: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        actorUser: {
          select: {
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
  }

  private async fetchContractAlerts() {
    return this.prisma.serviceContract.findMany({
      where: {
        status: {
          in: [ContractStatus.SUSPENDED, ContractStatus.RENEWAL],
        },
      },
      include: {
        client: {
          select: { companyName: true, tradeName: true },
        },
        invoices: {
          where: {
            status: ContractInvoiceStatus.OVERDUE,
          },
          orderBy: { dueDate: 'asc' },
          take: 2,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    });
  }

  private async fetchOrderAlerts(role: UserRole, technicianId?: string) {
    return this.prisma.maintenanceOrder.findMany({
      where:
        role === UserRole.TECHNICIAN && technicianId
          ? {
              technicianId,
              status: {
                in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS],
              },
            }
          : {
              OR: [
                {
                  status: OrderStatus.OPEN,
                  technicianId: null,
                },
                {
                  status: OrderStatus.IN_PROGRESS,
                },
              ],
            },
      include: {
        generator: {
          include: {
            client: {
              select: { companyName: true, tradeName: true },
            },
          },
        },
        technician: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: [{ scheduledTo: 'asc' }, { updatedAt: 'desc' }],
      take: 6,
    });
  }

  private async fetchReceivableAlerts(now: Date, dueSoon: Date) {
    return this.prisma.accountsReceivable.findMany({
      where: {
        OR: [
          { status: AccountsReceivableStatus.OVERDUE },
          {
            status: AccountsReceivableStatus.OPEN,
            dueDate: {
              lte: dueSoon,
              gte: now,
            },
          },
        ],
      },
      include: {
        client: {
          select: { companyName: true, tradeName: true },
        },
        contract: {
          select: { id: true, code: true },
        },
        maintenanceOrder: {
          select: { id: true, title: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 6,
    });
  }

  private mapApprovalNotification(approval: {
    id: string;
    type: ApprovalType;
    entityType: string;
    entityId: string;
    requestNote: string | null;
    createdAt: Date;
    requesterUser: { id: string; name: string };
  }): NotificationItem {
    const href =
      approval.entityType === 'PROPOSAL'
        ? `/dashboard/proposals/${approval.entityId}`
        : approval.entityType === 'MAINTENANCE_ORDER'
          ? `/dashboard/orders/${approval.entityId}`
          : '/dashboard/dispatch';

    const title =
      approval.type === ApprovalType.BUDGET_DISCOUNT
        ? 'Aprovacao de desconto pendente'
        : approval.entityType === 'MAINTENANCE_ORDER_ASSIGNMENT'
          ? 'Override de despacho pendente'
          : 'Relatorio tecnico aguardando aprovacao';

    return {
      id: `approval:${approval.id}`,
      category: 'approval',
      title,
      message:
        approval.requestNote?.trim() ||
        `${approval.requesterUser.name} registrou uma solicitacao que precisa de decisao.`,
      createdAt: approval.createdAt.toISOString(),
      href,
      entityType: approval.entityType,
      entityId: approval.entityId,
      tone: 'amber',
      priority: 'high',
      statusLabel: 'Pendente',
      actionLabel: 'Revisar',
    };
  }

  private mapInternalProposalNotification(
    proposal: {
      id: string;
      code: string;
      status: ProposalStatus;
      updatedAt: Date;
      client: { companyName: string; tradeName: string | null };
      generator: { name: string | null; serialNumber: string | null } | null;
    },
    role: UserRole,
  ): NotificationItem {
    const clientName = proposal.client.tradeName || proposal.client.companyName;
    const equipmentName =
      proposal.generator?.name ||
      proposal.generator?.serialNumber ||
      'equipamento';

    const dictionary: Record<
      ProposalStatus,
      {
        title: string;
        message: string;
        tone: NotificationTone;
        priority: NotificationPriority;
      }
    > = {
      DRAFT: {
        title: 'Proposta em rascunho',
        message: `${proposal.code} continua em aberto para ${clientName}.`,
        tone: 'slate',
        priority: 'low',
      },
      BOARD_REVIEW: {
        title: 'Diretoria precisa decidir',
        message: `${proposal.code} de ${clientName} entrou em analise de diretoria.`,
        tone: 'amber',
        priority: 'high',
      },
      REVISION_REQUIRED: {
        title: 'Proposta pede revisao',
        message: `${proposal.code} voltou com ajustes para ${clientName}.`,
        tone: 'rose',
        priority: 'medium',
      },
      CLIENT_REVIEW: {
        title:
          role === UserRole.ADMIN
            ? 'Cliente em analise'
            : 'Cliente aguardando retorno',
        message: `${proposal.code} de ${clientName} esta em decisao final para ${equipmentName}.`,
        tone: 'blue',
        priority: 'high',
      },
      DISCOUNT_REVIEW: {
        title: 'Desconto em validacao',
        message: `${proposal.code} de ${clientName} aguarda tratamento comercial.`,
        tone: 'amber',
        priority: 'medium',
      },
      WON: {
        title: 'Proposta ganha',
        message: `${proposal.code} foi fechada com ${clientName}.`,
        tone: 'emerald',
        priority: 'low',
      },
      LOST: {
        title: 'Proposta perdida',
        message: `${proposal.code} foi perdida para ${clientName}.`,
        tone: 'slate',
        priority: 'low',
      },
      SENT: {
        title: 'Proposta enviada',
        message: `${proposal.code} foi enviada para ${clientName}.`,
        tone: 'slate',
        priority: 'low',
      },
      APPROVED: {
        title: 'Proposta aprovada',
        message: `${proposal.code} foi aprovada.`,
        tone: 'emerald',
        priority: 'low',
      },
      REJECTED: {
        title: 'Proposta rejeitada',
        message: `${proposal.code} foi rejeitada.`,
        tone: 'rose',
        priority: 'low',
      },
    };

    const descriptor = dictionary[proposal.status];
    return {
      id: `proposal:${proposal.id}`,
      category: 'proposal',
      title: descriptor.title,
      message: descriptor.message,
      createdAt: proposal.updatedAt.toISOString(),
      href: `/dashboard/proposals/${proposal.id}`,
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      tone: descriptor.tone,
      priority: descriptor.priority,
      statusLabel: this.labelProposalStatus(proposal.status),
      actionLabel: 'Abrir proposta',
    };
  }

  private mapProposalUpdateNotification(movement: {
    id: string;
    action: string;
    note: string | null;
    createdAt: Date;
    proposal: { id: string; code: string; status: ProposalStatus };
    actorUser: { name: string; role: UserRole } | null;
  }): NotificationItem {
    return {
      id: `proposal-update:${movement.id}`,
      category: 'update',
      title: `Atualizacao na proposta ${movement.proposal.code}`,
      message:
        movement.note?.trim() ||
        `${movement.actorUser?.name || 'Outro usuario'} movimentou a proposta no fluxo.`,
      createdAt: movement.createdAt.toISOString(),
      href: `/dashboard/proposals/${movement.proposal.id}`,
      entityType: 'PROPOSAL',
      entityId: movement.proposal.id,
      tone: 'blue',
      priority: 'low',
      statusLabel: this.labelProposalStatus(movement.proposal.status),
      actionLabel: 'Ver historico',
    };
  }

  private mapContractNotification(contract: {
    id: string;
    code: string;
    status: ContractStatus;
    updatedAt: Date;
    client: { companyName: string; tradeName: string | null };
    invoices: Array<{ id: string; dueDate: Date }>;
  }): NotificationItem {
    const clientName = contract.client.tradeName || contract.client.companyName;
    const overdueCount = contract.invoices.length;

    return {
      id: `contract:${contract.id}`,
      category: 'contract',
      title:
        contract.status === ContractStatus.SUSPENDED
          ? `Contrato ${contract.code} suspenso`
          : `Contrato ${contract.code} em renovacao`,
      message:
        contract.status === ContractStatus.SUSPENDED
          ? `${clientName} tem ${overdueCount} fatura(s) vencida(s) associada(s).`
          : `${clientName} precisa tratar renovacao contratual.`,
      createdAt: contract.updatedAt.toISOString(),
      href: `/dashboard/contracts/${contract.id}`,
      entityType: 'CONTRACT',
      entityId: contract.id,
      tone: contract.status === ContractStatus.SUSPENDED ? 'rose' : 'amber',
      priority: 'high',
      statusLabel: this.labelContractStatus(contract.status),
      actionLabel: 'Abrir contrato',
    };
  }

  private mapInternalOrderNotification(
    order: {
      id: string;
      title: string;
      status: OrderStatus;
      priority: string;
      scheduledTo: Date | null;
      updatedAt: Date;
      generator: {
        client: { companyName: string; tradeName: string | null };
        name: string | null;
        serialNumber: string | null;
      };
      technician: { user: { name: string } } | null;
    },
    role: UserRole,
  ): NotificationItem {
    const clientName =
      order.generator.client.tradeName || order.generator.client.companyName;
    const equipmentName =
      order.generator.name || order.generator.serialNumber || 'equipamento';
    const missingTechnician = !order.technician;

    return {
      id: `order:${order.id}`,
      category: 'order',
      title:
        missingTechnician && role !== UserRole.TECHNICIAN
          ? 'Ordem sem alocacao'
          : 'Ordem em acompanhamento',
      message: missingTechnician
        ? `${order.title} de ${clientName} ainda nao recebeu tecnico para ${equipmentName}.`
        : `${order.title} segue ${this.labelOrderStatus(order.status).toLowerCase()} com ${order.technician?.user.name || 'equipe tecnica'}.`,
      createdAt: (order.scheduledTo || order.updatedAt).toISOString(),
      href: `/dashboard/orders/${order.id}`,
      entityType: 'MAINTENANCE_ORDER',
      entityId: order.id,
      tone: missingTechnician ? 'amber' : 'blue',
      priority: missingTechnician ? 'high' : 'medium',
      statusLabel: this.labelOrderStatus(order.status),
      actionLabel:
        role === UserRole.TECHNICIAN ? 'Abrir agenda' : 'Abrir ordem',
    };
  }

  private mapClientProposalNotification(proposal: {
    id: string;
    code: string;
    status: ProposalStatus;
    updatedAt: Date;
    generator: { name: string | null; serialNumber: string | null } | null;
  }): NotificationItem {
    const equipment =
      proposal.generator?.name ||
      proposal.generator?.serialNumber ||
      'equipamento';

    const title =
      proposal.status === ProposalStatus.CLIENT_REVIEW
        ? 'Proposta aguardando sua decisao'
        : proposal.status === ProposalStatus.REVISION_REQUIRED
          ? 'Nova revisao disponivel'
          : 'Proposta convertida com sucesso';

    const message =
      proposal.status === ProposalStatus.CLIENT_REVIEW
        ? `${proposal.code} esta pronta para sua aprovacao final em ${equipment}.`
        : proposal.status === ProposalStatus.REVISION_REQUIRED
          ? `${proposal.code} voltou revisada e pode ser acompanhada no portal.`
          : `${proposal.code} foi encerrada e pode seguir para contrato/atendimento.`;

    return {
      id: `client-proposal:${proposal.id}`,
      category: 'proposal',
      title,
      message,
      createdAt: proposal.updatedAt.toISOString(),
      href:
        proposal.status === ProposalStatus.CLIENT_REVIEW
          ? `/dashboard/proposals/${proposal.id}`
          : '/dashboard/client-portal',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      tone:
        proposal.status === ProposalStatus.CLIENT_REVIEW
          ? 'amber'
          : proposal.status === ProposalStatus.REVISION_REQUIRED
            ? 'blue'
            : 'emerald',
      priority:
        proposal.status === ProposalStatus.CLIENT_REVIEW ? 'high' : 'medium',
      statusLabel: this.labelProposalStatus(proposal.status),
      actionLabel:
        proposal.status === ProposalStatus.CLIENT_REVIEW
          ? 'Responder'
          : 'Ver portal',
    };
  }

  private mapClientContractNotification(contract: {
    id: string;
    code: string;
    status: ContractStatus;
    updatedAt: Date;
    invoices: Array<{ dueDate: Date; status: ContractInvoiceStatus }>;
  }): NotificationItem {
    const overdue = contract.invoices.find(
      (invoice) => invoice.status === ContractInvoiceStatus.OVERDUE,
    );

    return {
      id: `client-contract:${contract.id}`,
      category: 'contract',
      title:
        contract.status === ContractStatus.SUSPENDED
          ? `Contrato ${contract.code} com restricao`
          : `Contrato ${contract.code} pede atencao`,
      message: overdue
        ? `Existe faturamento vencido ligado ao contrato ${contract.code}.`
        : `O contrato ${contract.code} entrou em renovacao e merece acompanhamento.`,
      createdAt: contract.updatedAt.toISOString(),
      href: '/dashboard/client-portal',
      entityType: 'CONTRACT',
      entityId: contract.id,
      tone: overdue ? 'rose' : 'amber',
      priority: overdue ? 'high' : 'medium',
      statusLabel: this.labelContractStatus(contract.status),
      actionLabel: 'Abrir portal',
    };
  }

  private mapClientOrderNotification(order: {
    id: string;
    title: string;
    status: OrderStatus;
    updatedAt: Date;
    technician: { user: { name: string } } | null;
  }): NotificationItem {
    return {
      id: `client-order:${order.id}`,
      category: 'order',
      title:
        order.status === OrderStatus.IN_PROGRESS
          ? 'Equipe em atendimento'
          : order.status === OrderStatus.COMPLETED
            ? 'Atendimento concluido'
            : 'Atendimento aberto',
      message:
        order.status === OrderStatus.IN_PROGRESS
          ? `${order.title} esta em execucao com ${order.technician?.user.name || 'a equipe tecnica'}.`
          : order.status === OrderStatus.COMPLETED
            ? `${order.title} foi concluida e segue registrada no portal.`
            : `${order.title} foi aberta e sera acompanhada por aqui.`,
      createdAt: order.updatedAt.toISOString(),
      href: '/dashboard/client-portal',
      entityType: 'MAINTENANCE_ORDER',
      entityId: order.id,
      tone: order.status === OrderStatus.COMPLETED ? 'emerald' : 'blue',
      priority: order.status === OrderStatus.IN_PROGRESS ? 'medium' : 'low',
      statusLabel: this.labelOrderStatus(order.status),
      actionLabel: 'Ver portal',
    };
  }

  private mapReceivableNotification(
    entry: {
      id: string;
      description: string;
      dueDate: Date;
      createdAt: Date;
      status: AccountsReceivableStatus;
      client: { companyName: string; tradeName: string | null };
      contract: { id: string; code: string } | null;
      maintenanceOrder: { id: string; title: string } | null;
    },
    isClient: boolean,
    now?: Date,
    dueSoon?: Date,
  ): NotificationItem {
    const clientName = entry.client.tradeName || entry.client.companyName;
    const source =
      entry.contract?.code ||
      entry.maintenanceOrder?.title ||
      'titulo financeiro';
    const overdue = entry.status === AccountsReceivableStatus.OVERDUE;
    const nearDue =
      !overdue &&
      Boolean(
        now &&
        dueSoon &&
        entry.dueDate.getTime() >= now.getTime() &&
        entry.dueDate.getTime() <= dueSoon.getTime(),
      );

    return {
      id: `receivable:${entry.id}`,
      category: 'finance',
      title: overdue ? 'Titulo vencido' : 'Titulo proximo do vencimento',
      message: isClient
        ? `${source} venceu ou vence em breve no portal financeiro do cliente.`
        : `${clientName} possui cobranca ligada a ${source}.`,
      createdAt: (overdue ? entry.dueDate : entry.createdAt).toISOString(),
      href: isClient
        ? '/dashboard/client-portal'
        : '/dashboard/finance/accounts-receivable',
      entityType: 'ACCOUNTS_RECEIVABLE',
      entityId: entry.id,
      tone: overdue ? 'rose' : nearDue ? 'amber' : 'slate',
      priority: overdue ? 'high' : nearDue ? 'medium' : 'low',
      statusLabel: this.labelReceivableStatus(entry.status),
      actionLabel: isClient ? 'Ver portal' : 'Abrir recebiveis',
    };
  }

  private countByCategory(items: NotificationItem[]) {
    return items.reduce<Record<NotificationCategory, number>>(
      (accumulator, item) => {
        accumulator[item.category] += 1;
        return accumulator;
      },
      {
        approval: 0,
        proposal: 0,
        contract: 0,
        order: 0,
        finance: 0,
        update: 0,
      },
    );
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

  private labelOrderStatus(status: OrderStatus) {
    const labels: Record<OrderStatus, string> = {
      OPEN: 'Aberta',
      IN_PROGRESS: 'Em andamento',
      COMPLETED: 'Concluida',
      CANCELED: 'Cancelada',
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

  private labelReceivableStatus(status: AccountsReceivableStatus) {
    const labels: Record<AccountsReceivableStatus, string> = {
      OPEN: 'Em aberto',
      PAID: 'Pago',
      PARTIAL: 'Parcial',
      OVERDUE: 'Vencido',
      CANCELED: 'Cancelado',
    };

    return labels[status];
  }
}
