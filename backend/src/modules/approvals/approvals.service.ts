import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ApprovalType,
  AuditDomain,
  OrderStatus,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type CreateApprovalInput = {
  type: ApprovalType;
  entityType: string;
  entityId: string;
  requesterUserId: string;
  requestNote?: string;
  approverUserId?: string;
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listPending(actorUserId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    });
    if (!actor) throw new ForbiddenException('Usuario nao encontrado.');

    const where =
      actor.role === UserRole.ADMIN
        ? { status: ApprovalStatus.PENDING }
        : {
            status: ApprovalStatus.PENDING,
            approverUserId: actorUserId,
          };

    return this.prisma.approvalRequest.findMany({
      where,
      include: {
        requesterUser: {
          select: { id: true, name: true, email: true, role: true },
        },
        approverUser: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, actorUserId: string, decisionNote?: string) {
    return this.decide(id, actorUserId, ApprovalStatus.APPROVED, decisionNote);
  }

  async reject(id: string, actorUserId: string, decisionNote?: string) {
    return this.decide(id, actorUserId, ApprovalStatus.REJECTED, decisionNote);
  }

  async create(input: CreateApprovalInput) {
    const requester = await this.prisma.user.findUnique({
      where: { id: input.requesterUserId },
      select: { id: true, managerId: true },
    });
    if (!requester)
      throw new BadRequestException('Solicitante nao encontrado.');

    const approverUserId =
      input.approverUserId ??
      requester.managerId ??
      (await this.findFallbackApproverId());

    const created = await this.prisma.approvalRequest.create({
      data: {
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        requesterUserId: input.requesterUserId,
        approverUserId,
        requestNote: input.requestNote,
      },
    });

    await this.auditLogsService.record({
      domain:
        input.entityType === 'MAINTENANCE_ORDER'
          ? AuditDomain.MAINTENANCE_ORDERS
          : AuditDomain.PROPOSALS,
      entityType: input.entityType,
      entityId: input.entityId,
      action: 'APPROVAL_REQUESTED',
      actorUserId: input.requesterUserId,
      afterPayload: {
        approvalRequestId: created.id,
        type: input.type,
        approverUserId,
      },
      reason: input.requestNote,
    });

    return created;
  }

  private async decide(
    id: string,
    actorUserId: string,
    status: ApprovalStatus,
    decisionNote?: string,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    });
    if (!actor) throw new ForbiddenException('Usuario nao encontrado.');

    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!approval) throw new NotFoundException('Solicitacao nao encontrada.');
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Solicitacao ja decidida.');
    }

    const canDecide =
      actor.role === UserRole.ADMIN || approval.approverUserId === actorUserId;
    if (!canDecide) {
      throw new ForbiddenException(
        'Apenas o aprovador designado (ou admin) pode decidir.',
      );
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status,
        decisionNote,
        decidedAt: new Date(),
      },
    });
    await this.applyDecisionEffects(
      approval,
      status,
      actorUserId,
      decisionNote,
    );

    await this.auditLogsService.record({
      domain:
        approval.entityType === 'MAINTENANCE_ORDER'
          ? AuditDomain.MAINTENANCE_ORDERS
          : AuditDomain.PROPOSALS,
      entityType: approval.entityType,
      entityId: approval.entityId,
      action:
        status === ApprovalStatus.APPROVED
          ? 'APPROVAL_APPROVED'
          : 'APPROVAL_REJECTED',
      actorUserId,
      afterPayload: {
        approvalRequestId: approval.id,
        status,
      },
      reason: decisionNote,
    });

    return updated;
  }

  private async applyDecisionEffects(
    approval: {
      id: string;
      type: ApprovalType;
      entityType: string;
      entityId: string;
    },
    status: ApprovalStatus,
    actorUserId: string,
    reason?: string,
  ) {
    if (
      approval.type === ApprovalType.BUDGET_DISCOUNT &&
      approval.entityType === 'PROPOSAL'
    ) {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: approval.entityId },
        select: { id: true, status: true },
      });
      if (!proposal) return;

      const nextStatus =
        status === ApprovalStatus.APPROVED
          ? ProposalStatus.CLIENT_REVIEW
          : ProposalStatus.REVISION_REQUIRED;

      if (proposal.status !== nextStatus) {
        await this.prisma.proposal.update({
          where: { id: proposal.id },
          data: { status: nextStatus },
        });
      }

      await this.auditLogsService.record({
        domain: AuditDomain.PROPOSALS,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        action:
          status === ApprovalStatus.APPROVED
            ? 'BUDGET_DISCOUNT_APPROVED'
            : 'BUDGET_DISCOUNT_REJECTED',
        actorUserId,
        reason,
      });
      return;
    }

    if (
      approval.type === ApprovalType.RVT_SIGNOFF &&
      approval.entityType === 'MAINTENANCE_ORDER'
    ) {
      const order = await this.prisma.maintenanceOrder.findUnique({
        where: { id: approval.entityId },
        select: { id: true, status: true, finishedAt: true, closedAt: true },
      });
      if (!order) return;

      if (status === ApprovalStatus.APPROVED) {
        await this.prisma.maintenanceOrder.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            finishedAt: order.finishedAt ?? new Date(),
            closedAt: order.closedAt ?? new Date(),
          },
        });
      } else if (order.status === OrderStatus.COMPLETED) {
        await this.prisma.maintenanceOrder.update({
          where: { id: order.id },
          data: { status: OrderStatus.IN_PROGRESS, closedAt: null },
        });
      }

      await this.auditLogsService.record({
        domain: AuditDomain.MAINTENANCE_ORDERS,
        entityType: 'MAINTENANCE_ORDER',
        entityId: order.id,
        action:
          status === ApprovalStatus.APPROVED
            ? 'RVT_SIGNOFF_APPROVED'
            : 'RVT_SIGNOFF_REJECTED',
        actorUserId,
        reason,
      });
    }
  }

  private async findFallbackApproverId() {
    const admin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new BadRequestException(
        'Nao existe aprovador disponivel (gestor direto ou administrador).',
      );
    }
    return admin.id;
  }
}
