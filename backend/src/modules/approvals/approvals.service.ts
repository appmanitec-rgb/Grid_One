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
  Prisma,
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
  requestPayload?: Prisma.InputJsonValue;
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
    const reason = this.requireRejectionReason(decisionNote);
    return this.decide(id, actorUserId, ApprovalStatus.REJECTED, reason);
  }

  async requestAdjustments(
    id: string,
    actorUserId: string,
    decisionNote?: string,
  ) {
    const reason = this.requireRejectionReason(decisionNote);
    return this.decide(
      id,
      actorUserId,
      ApprovalStatus.ADJUSTMENTS_REQUESTED,
      reason,
      {
        generatorProposalStatus: ProposalStatus.REVISION_REQUIRED,
        generatorProposalAction: 'GENERATOR_PROPOSAL_ADJUSTMENTS_REQUESTED',
      },
    );
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
      (input.type === ApprovalType.CATALOG_PRICING
        ? await this.findFinancialApproverId(input.requesterUserId)
        : (requester.managerId ?? (await this.findFallbackApproverId())));

    const created = await this.prisma.approvalRequest.create({
      data: {
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        requesterUserId: input.requesterUserId,
        approverUserId,
        requestNote: input.requestNote,
        requestPayload: input.requestPayload,
      },
    });

    await this.auditLogsService.record({
      domain:
        input.entityType === 'MAINTENANCE_ORDER'
          ? AuditDomain.MAINTENANCE_ORDERS
          : input.entityType === 'CATALOG_ITEM'
            ? AuditDomain.INVENTORY
            : AuditDomain.PROPOSALS,
      entityType: input.entityType,
      entityId: input.entityId,
      action: 'APPROVAL_REQUESTED',
      actorUserId: input.requesterUserId,
      afterPayload: {
        approvalRequestId: created.id,
        type: input.type,
        approverUserId,
        requestPayload: input.requestPayload,
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
    effects?: {
      generatorProposalStatus?: ProposalStatus;
      generatorProposalAction?: string;
    },
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

    const isCatalogPricingApproval =
      approval.type === ApprovalType.CATALOG_PRICING &&
      approval.entityType === 'CATALOG_ITEM' &&
      status === ApprovalStatus.APPROVED;
    const decisionData = {
      status,
      decisionNote,
      decidedAt: new Date(),
    };
    const updated = isCatalogPricingApproval
      ? await this.prisma.$transaction(async (tx) => {
          await this.applyCatalogPricingApproval(approval, actorUserId, tx);
          return tx.approvalRequest.update({
            where: { id, status: ApprovalStatus.PENDING },
            data: decisionData,
          });
        })
      : await this.prisma.approvalRequest.update({
          where: { id, status: ApprovalStatus.PENDING },
          data: decisionData,
        });
    if (!isCatalogPricingApproval) {
      await this.applyDecisionEffects(
        approval,
        status,
        actorUserId,
        decisionNote,
        effects,
      );
    }

    await this.auditLogsService.record({
      domain:
        approval.entityType === 'MAINTENANCE_ORDER'
          ? AuditDomain.MAINTENANCE_ORDERS
          : approval.entityType === 'CATALOG_ITEM'
            ? AuditDomain.INVENTORY
            : AuditDomain.PROPOSALS,
      entityType: approval.entityType,
      entityId: approval.entityId,
      action:
        status === ApprovalStatus.APPROVED
          ? 'APPROVAL_APPROVED'
          : status === ApprovalStatus.ADJUSTMENTS_REQUESTED
            ? 'APPROVAL_ADJUSTMENTS_REQUESTED'
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
      requestPayload: Prisma.JsonValue | null;
    },
    status: ApprovalStatus,
    actorUserId: string,
    reason?: string,
    effects?: {
      generatorProposalStatus?: ProposalStatus;
      generatorProposalAction?: string;
    },
  ) {
    if (
      approval.type === ApprovalType.CATALOG_PRICING &&
      approval.entityType === 'CATALOG_ITEM'
    ) {
      if (status === ApprovalStatus.APPROVED) {
        await this.applyCatalogPricingApproval(approval, actorUserId);
      }
      return;
    }

    if (
      approval.type === ApprovalType.GENERATOR_PROPOSAL &&
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
          : (effects?.generatorProposalStatus ?? ProposalStatus.REJECTED);
      await this.prisma.$transaction(async (tx) => {
        await tx.proposal.update({
          where: { id: proposal.id },
          data: { status: nextStatus },
        });
        await tx.proposalMovement.create({
          data: {
            proposalId: proposal.id,
            actorUserId,
            action:
              status === ApprovalStatus.APPROVED
                ? 'GENERATOR_PROPOSAL_APPROVED'
                : (effects?.generatorProposalAction ??
                  'GENERATOR_PROPOSAL_REJECTED'),
            note:
              reason ||
              (status === ApprovalStatus.APPROVED
                ? 'Diretoria liberou a proposta de gerador para o cliente.'
                : nextStatus === ProposalStatus.REVISION_REQUIRED
                  ? 'Diretoria solicitou ajustes na proposta de gerador.'
                  : 'Diretoria reprovou definitivamente a proposta de gerador.'),
            fromStatus: proposal.status,
            toStatus: nextStatus,
          },
        });
      });
      return;
    }

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

  private async applyCatalogPricingApproval(
    approval: {
      id: string;
      entityId: string;
      requestPayload: Prisma.JsonValue | null;
    },
    actorUserId: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const db = transaction ?? this.prisma;
    const payload = this.requirePricingPayload(approval.requestPayload);
    const item = await db.catalogItem.findUnique({
      where: { id: approval.entityId },
    });
    if (!item) throw new NotFoundException('Item do catalogo nao encontrado.');

    if (payload.changeKind === 'PARAMETERS') {
      const icmsPercent = this.payloadNumber(payload, 'icmsPercent');
      const pisPercent = this.payloadNumber(payload, 'pisPercent');
      const cofinsPercent = this.payloadNumber(payload, 'cofinsPercent');
      const ipiPercent = this.payloadNumber(payload, 'ipiPercent');
      const issPercent = this.payloadNumber(payload, 'issPercent');
      const irpjPercent = this.payloadNumber(payload, 'irpjPercent');
      const csllPercent = this.payloadNumber(payload, 'csllPercent');
      const cppPercent = this.payloadNumber(payload, 'cppPercent');
      const commissionPercent = this.payloadNumber(
        payload,
        'commissionPercent',
      );
      const profitMarginPercent = this.payloadNumber(
        payload,
        'profitMarginPercent',
      );
      const operationalCostPercent = this.payloadNumber(
        payload,
        'operationalCostPercent',
      );
      const salesTaxPercent = Number(
        (
          icmsPercent +
          pisPercent +
          cofinsPercent +
          ipiPercent +
          issPercent +
          irpjPercent +
          csllPercent +
          cppPercent
        ).toFixed(4),
      );
      const purchaseCost = Math.max(0, Number(item.costPrice || 0));
      const suggestedSalePrice = Number(
        Math.max(
          purchaseCost,
          purchaseCost *
            (1 +
              (salesTaxPercent +
                commissionPercent +
                profitMarginPercent +
                operationalCostPercent) /
                100),
        ).toFixed(2),
      );

      await db.catalogItem.update({
        where: { id: approval.entityId },
        data: {
          icmsPercent,
          pisPercent,
          cofinsPercent,
          ipiPercent,
          issPercent,
          irpjPercent,
          csllPercent,
          cppPercent,
          commissionPercent,
          profitMargin: profitMarginPercent,
          operationalCostPercent,
          taxPercentage: salesTaxPercent,
          basePrice: suggestedSalePrice,
          taxProfile: {
            ...(item.taxProfile && typeof item.taxProfile === 'object'
              ? (item.taxProfile as Record<string, unknown>)
              : {}),
            icmsPercent,
            pisPercent,
            cofinsPercent,
            ipiPercent,
            issPercent,
            irpjPercent,
            csllPercent,
            cppPercent,
            salesTaxPercent,
            commissionPercent,
            profitMarginPercent,
            operationalCostPercent,
            suggestedSalePrice,
            pricingNeedsReview: false,
            lastPricingApprovalId: approval.id,
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const supplierId = this.payloadText(payload, 'supplierId', true)!;
    const supplierName = this.payloadText(payload, 'supplierName', true)!;
    const purchaseInvoiceValue = this.payloadNumber(
      payload,
      'purchaseInvoiceValue',
    );
    const purchaseTaxMode =
      this.payloadText(payload, 'purchaseTaxMode') === 'PERCENT'
        ? 'PERCENT'
        : 'AMOUNT';
    const purchaseTaxPercent = this.payloadNumber(
      payload,
      'purchaseTaxPercent',
    );
    const purchaseTaxAmount = this.payloadNumber(payload, 'purchaseTaxAmount');
    const freightAmount = this.payloadNumber(payload, 'freightAmount');
    const insuranceAmount = this.payloadNumber(payload, 'insuranceAmount');
    const discountAmount = this.payloadNumber(payload, 'discountAmount');
    const recoverableCreditAmount = this.payloadNumber(
      payload,
      'recoverableCreditAmount',
    );
    const otherPurchaseCosts = this.payloadNumber(
      payload,
      'otherPurchaseCosts',
    );
    const calculatedPurchaseCost = this.payloadNumber(
      payload,
      'calculatedPurchaseCost',
    );
    const netOtherPurchaseCosts =
      insuranceAmount +
      otherPurchaseCosts -
      discountAmount -
      recoverableCreditAmount;
    const recalculatedPurchaseCost = Number(
      (
        purchaseInvoiceValue +
        purchaseTaxAmount +
        freightAmount +
        netOtherPurchaseCosts
      ).toFixed(2),
    );
    if (Math.abs(recalculatedPurchaseCost - calculatedPurchaseCost) > 0.01) {
      throw new BadRequestException(
        'O custo calculado da solicitacao nao confere com seus componentes.',
      );
    }
    const icmsPercent = this.payloadNumber(payload, 'icmsPercent');
    const pisPercent = this.payloadNumber(payload, 'pisPercent');
    const cofinsPercent = this.payloadNumber(payload, 'cofinsPercent');
    const ipiPercent = this.payloadNumber(payload, 'ipiPercent');
    const issPercent = this.payloadNumber(payload, 'issPercent');
    const irpjPercent = this.payloadNumber(payload, 'irpjPercent');
    const csllPercent = this.payloadNumber(payload, 'csllPercent');
    const cppPercent = this.payloadNumber(payload, 'cppPercent');
    const salesTaxPercent = this.payloadNumber(payload, 'salesTaxPercent');
    const commissionPercent = this.payloadNumber(payload, 'commissionPercent');
    const profitMarginPercent = this.payloadNumber(
      payload,
      'profitMarginPercent',
    );
    const operationalCostPercent = this.payloadNumber(
      payload,
      'operationalCostPercent',
    );
    const suggestedSalePrice = this.payloadNumber(
      payload,
      'suggestedSalePrice',
    );
    const finalSalePrice = this.payloadNumber(payload, 'finalSalePrice');
    if (finalSalePrice < calculatedPurchaseCost) {
      throw new BadRequestException(
        'O preco aprovado nao pode ser menor que o custo total do produto.',
      );
    }

    const validFrom = this.payloadDate(payload, 'validFrom');
    const validUntil = this.payloadDate(payload, 'validUntil');
    const setAsPrimary = payload.setAsPrimary !== false;
    const notes = this.payloadText(payload, 'notes');

    const applyPricing = async (tx: Prisma.TransactionClient) => {
      if (setAsPrimary) {
        await tx.supplierCatalogItem.updateMany({
          where: {
            catalogItemId: approval.entityId,
            supplierId: { not: supplierId },
          },
          data: { isPrimary: false },
        });
      }

      await tx.supplierCatalogItem.upsert({
        where: {
          supplierId_catalogItemId: {
            supplierId,
            catalogItemId: approval.entityId,
          },
        },
        update: {
          supplierSku: this.payloadText(payload, 'supplierSku'),
          supplierPrice: calculatedPurchaseCost,
          leadTimeDays: this.payloadOptionalNumber(payload, 'leadTimeDays'),
          isPrimary: setAsPrimary,
          purchasePaymentTerm: this.payloadText(payload, 'purchasePaymentTerm'),
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts: netOtherPurchaseCosts,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: new Date(),
          priceNotes: notes,
        },
        create: {
          supplierId,
          catalogItemId: approval.entityId,
          supplierSku: this.payloadText(payload, 'supplierSku'),
          supplierPrice: calculatedPurchaseCost,
          leadTimeDays: this.payloadOptionalNumber(payload, 'leadTimeDays'),
          isPrimary: setAsPrimary,
          purchasePaymentTerm: this.payloadText(payload, 'purchasePaymentTerm'),
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts: netOtherPurchaseCosts,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: new Date(),
          priceNotes: notes,
        },
      });

      await tx.catalogItem.update({
        where: { id: approval.entityId },
        data: {
          supplier: supplierName,
          costPrice: calculatedPurchaseCost,
          lastCost: calculatedPurchaseCost,
          basePrice: finalSalePrice,
          taxPercentage: salesTaxPercent,
          profitMargin: profitMarginPercent,
          icmsPercent,
          pisPercent,
          cofinsPercent,
          ipiPercent,
          issPercent,
          irpjPercent,
          csllPercent,
          cppPercent,
          commissionPercent,
          operationalCostPercent,
          taxProfile: {
            ...(item.taxProfile && typeof item.taxProfile === 'object'
              ? (item.taxProfile as Record<string, unknown>)
              : {}),
            icmsPercent,
            pisPercent,
            cofinsPercent,
            ipiPercent,
            issPercent,
            irpjPercent,
            csllPercent,
            cppPercent,
            salesTaxPercent,
            commissionPercent,
            operationalCostPercent,
            suggestedSalePrice,
            insuranceAmount,
            discountAmount,
            recoverableCreditAmount,
            pricingSupplierId: supplierId,
            pricingSupplierName: supplierName,
            priceValidFrom: validFrom?.toISOString() ?? null,
            priceValidUntil: validUntil?.toISOString() ?? null,
            pricingNeedsReview: false,
            lastPricingApprovalId: approval.id,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.catalogPriceRevision.create({
        data: {
          catalogItemId: approval.entityId,
          supplierId,
          previousCostPrice: item.costPrice,
          previousBasePrice: item.basePrice,
          purchaseInvoiceValue,
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts: netOtherPurchaseCosts,
          calculatedPurchaseCost,
          salesTaxPercent,
          commissionPercent,
          profitMarginPercent,
          operationalCostPercent,
          finalSalePrice,
          validFrom,
          validUntil,
          notes,
          createdById: actorUserId,
        },
      });
    };

    if (transaction) {
      await applyPricing(transaction);
    } else {
      await this.prisma.$transaction(applyPricing);
    }
  }

  private requirePricingPayload(value: Prisma.JsonValue | null) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(
        'A solicitacao nao possui dados validos de formacao de preco.',
      );
    }
    return value as Record<string, Prisma.JsonValue>;
  }

  private payloadNumber(
    payload: Record<string, Prisma.JsonValue>,
    key: string,
  ) {
    const value = Number(payload[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`Valor invalido na precificacao: ${key}.`);
    }
    return value;
  }

  private payloadOptionalNumber(
    payload: Record<string, Prisma.JsonValue>,
    key: string,
  ) {
    if (payload[key] === null || payload[key] === undefined) return undefined;
    return this.payloadNumber(payload, key);
  }

  private payloadText(
    payload: Record<string, Prisma.JsonValue>,
    key: string,
    required = false,
  ) {
    const value = typeof payload[key] === 'string' ? payload[key].trim() : '';
    if (required && !value) {
      throw new BadRequestException(`Campo ausente na precificacao: ${key}.`);
    }
    return value || null;
  }

  private payloadDate(payload: Record<string, Prisma.JsonValue>, key: string) {
    const text = this.payloadText(payload, key);
    if (!text) return null;
    const value = new Date(text);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`Data invalida na precificacao: ${key}.`);
    }
    return value;
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

  private async findFinancialApproverId(requesterUserId: string) {
    const finance = await this.prisma.user.findFirst({
      where: {
        role: UserRole.FINANCE,
        isActive: true,
        id: { not: requesterUserId },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return finance?.id ?? this.findFallbackApproverId();
  }

  private requireRejectionReason(reason?: string) {
    const normalized = reason?.trim();
    if (!normalized || normalized.length < 5) {
      throw new BadRequestException(
        'Informe uma justificativa com pelo menos 5 caracteres.',
      );
    }
    return normalized;
  }
}
