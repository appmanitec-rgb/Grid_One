import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  AccountsPayableStatus,
  InventoryMovementType,
  PayableCategory,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
} from './dto/purchase-orders.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');
      if (!dto.items?.length) {
        throw new BadRequestException('Pedido precisa de ao menos 1 item.');
      }

      const code = await this.generateCode(tx);
      const totalProducts = dto.items.reduce(
        (acc, item) => acc + Number(item.quantity) * Number(item.unitPrice),
        0,
      );
      const totalAmount =
        totalProducts +
        Number(dto.freightAmount || 0) +
        Number(dto.taxAmount || 0);

      const created = await tx.purchaseOrder.create({
        data: {
          code,
          supplierId: dto.supplierId,
          expectedDate: dto.expectedDate
            ? new Date(dto.expectedDate)
            : undefined,
          freightAmount: dto.freightAmount || 0,
          taxAmount: dto.taxAmount || 0,
          paymentTerm: dto.paymentTerm || supplier.paymentTerm,
          notes: dto.notes,
          totalProductsAmount: totalProducts,
          totalAmount,
          items: {
            create: dto.items.map((item) => ({
              catalogItemId: item.catalogItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxAmount: item.taxAmount || 0,
              totalPrice: Number(item.quantity) * Number(item.unitPrice),
            })),
          },
        },
        include: this.include(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PURCHASE_ORDERS,
          entityType: 'PURCHASE_ORDER',
          entityId: created.id,
          action: 'CREATE',
          actorUserId,
          afterPayload: {
            code: created.code,
            supplierId: created.supplierId,
            totalAmount: created.totalAmount,
          },
        },
        tx,
      );

      return created;
    });
  }

  findAll() {
    return this.prisma.purchaseOrder.findMany({
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!order) throw new NotFoundException('Pedido de compra nao encontrado.');
    return order;
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
    actorUserId?: string,
  ) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, status: true, totalAmount: true },
      });

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status,
          approvedAt:
            status === PurchaseOrderStatus.APPROVED ? new Date() : undefined,
        },
        include: this.include(),
      });

      if (status === PurchaseOrderStatus.APPROVED) {
        await this.ensureAccountsPayable(tx, updated, actorUserId);
      }

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PURCHASE_ORDERS,
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          action: 'STATUS_UPDATE',
          actorUserId,
          beforePayload: before as unknown as Prisma.InputJsonValue,
          afterPayload: {
            status,
            approvedAt: updated.approvedAt,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async receive(
    id: string,
    dto: ReceivePurchaseOrderDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: true,
          supplier: true,
        },
      });
      if (!order)
        throw new NotFoundException('Pedido de compra nao encontrado.');
      if (order.status === PurchaseOrderStatus.CANCELED) {
        throw new BadRequestException(
          'Pedido cancelado nao pode receber material.',
        );
      }
      if (
        order.status !== PurchaseOrderStatus.APPROVED &&
        order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new BadRequestException(
          'Pedido precisa estar aprovado para receber material.',
        );
      }
      if (Number(order.totalAmount || 0) <= 0) {
        throw new BadRequestException(
          'Pedido precisa ter valor total valido para gerar financeiro.',
        );
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse)
        throw new NotFoundException('Almoxarifado nao encontrado.');

      for (const receipt of dto.items) {
        const item = order.items.find(
          (x) => x.id === receipt.purchaseOrderItemId,
        );
        if (!item) {
          throw new BadRequestException(
            'Item de recebimento nao pertence ao pedido.',
          );
        }

        const pendingQty = Number(item.quantity) - Number(item.receivedQty);
        if (receipt.quantity > pendingQty) {
          throw new BadRequestException(
            'Quantidade de recebimento maior que saldo pendente.',
          );
        }

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: { increment: receipt.quantity } },
        });

        const balance = await tx.inventoryBalance.upsert({
          where: {
            warehouseId_catalogItemId: {
              warehouseId: dto.warehouseId,
              catalogItemId: item.catalogItemId,
            },
          },
          update: { physicalQty: { increment: receipt.quantity } },
          create: {
            warehouseId: dto.warehouseId,
            catalogItemId: item.catalogItemId,
            physicalQty: receipt.quantity,
            reservedQty: 0,
            minQty: 0,
            maxQty: 0,
          },
        });

        const unitCost =
          receipt.unitCost !== undefined
            ? receipt.unitCost
            : Number(item.unitPrice);

        await tx.inventoryMovement.create({
          data: {
            movementType: InventoryMovementType.PURCHASE_RECEIPT,
            warehouseId: dto.warehouseId,
            catalogItemId: item.catalogItemId,
            quantity: receipt.quantity,
            unitCost,
            referenceType: 'PURCHASE_ORDER',
            referenceId: order.id,
            note: dto.notes,
          },
        });

        await tx.catalogItem.update({
          where: { id: item.catalogItemId },
          data: {
            stockCurrent: { increment: receipt.quantity },
            averageCost: this.nextAverageCost(
              await tx.catalogItem.findUnique({
                where: { id: item.catalogItemId },
                select: { averageCost: true, stockCurrent: true },
              }),
              receipt.quantity,
              unitCost,
            ),
            lastCost: unitCost,
            costPrice: unitCost,
          },
        });

        if (
          Number(balance.minQty || 0) === 0 &&
          Number(balance.maxQty || 0) === 0
        ) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              minQty: 0,
              maxQty: 0,
            },
          });
        }
      }

      const receipt = await tx.purchaseOrderReceipt.create({
        data: {
          purchaseOrderId: id,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
        },
      });

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });
      const allReceived = refreshedItems.every(
        (item) => Number(item.receivedQty) >= Number(item.quantity),
      );
      const anyReceived = refreshedItems.some(
        (item) => Number(item.receivedQty) > 0,
      );

      const status = allReceived
        ? PurchaseOrderStatus.RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.PARTIALLY_RECEIVED
          : order.status;

      await tx.purchaseOrder.update({ where: { id }, data: { status } });

      const payable = await this.ensureAccountsPayable(tx, order, actorUserId);

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PURCHASE_ORDERS,
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          action: 'RECEIVE',
          actorUserId,
          afterPayload: {
            receiptId: receipt.id,
            warehouseId: dto.warehouseId,
            status,
            payableId: payable?.id,
          },
        },
        tx,
      );

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }

  private include() {
    return {
      supplier: true,
      items: {
        include: {
          catalogItem: {
            select: {
              id: true,
              name: true,
              sku: true,
              manufacturerPartNumber: true,
            },
          },
        },
      },
      receipts: {
        include: { warehouse: true },
        orderBy: { receivedAt: 'desc' as const },
      },
      payableEntries: true,
    };
  }

  private async ensureAccountsPayable(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      supplierId: string;
      code: string;
      paymentTerm: string | null;
      totalAmount: number;
      status?: PurchaseOrderStatus;
    },
    actorUserId?: string,
  ) {
    if (order.status === PurchaseOrderStatus.CANCELED) {
      throw new BadRequestException(
        'Pedido cancelado nao pode gerar conta a pagar.',
      );
    }
    if (!order.supplierId) {
      throw new BadRequestException(
        'Pedido precisa ter fornecedor para gerar conta a pagar.',
      );
    }
    if (Number(order.totalAmount || 0) <= 0) {
      throw new BadRequestException(
        'Pedido precisa ter valor total valido para gerar conta a pagar.',
      );
    }

    const existing = await tx.accountsPayable.findFirst({
      where: { purchaseOrderId: order.id },
      select: { id: true, status: true },
    });
    if (existing) return existing;

    const dueDate = this.computeDueDate(order.paymentTerm || '30');
    const duplicateHash = this.buildPayableDuplicateHash(
      order.supplierId,
      dueDate,
      Number(order.totalAmount || 0),
    );

    const payable = await tx.accountsPayable.create({
      data: {
        purchaseOrderId: order.id,
        supplierId: order.supplierId,
        description: `Pedido de Compra ${order.code}`,
        dueDate,
        amount: Number(order.totalAmount || 0),
        category: PayableCategory.SUPPLIERS,
        duplicateHash,
        status: AccountsPayableStatus.OPEN,
      },
    });

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: 'ACCOUNTS_PAYABLE',
        entityId: payable.id,
        action: 'CREATE_FROM_PURCHASE_ORDER',
        actorUserId,
        afterPayload: {
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          amount: payable.amount,
          dueDate: payable.dueDate,
        },
      },
      tx,
    );

    return payable;
  }

  private computeDueDate(paymentTerm: string) {
    const match = /\d+/.exec(paymentTerm);
    const days = match ? Number(match[0]) : 30;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private buildPayableDuplicateHash(
    supplierId: string,
    dueDate: Date,
    amount: number,
  ) {
    return `${supplierId}|${dueDate.toISOString().slice(0, 10)}|${Number(amount).toFixed(2)}`;
  }

  private nextAverageCost(
    current: { averageCost: number | null; stockCurrent: number | null } | null,
    receivedQty: number,
    unitCost: number,
  ) {
    const currQty = Number(current?.stockCurrent || 0);
    const currAvg = Number(current?.averageCost || 0);
    const prevQty = Math.max(0, currQty - receivedQty);
    const totalCost = prevQty * currAvg + receivedQty * unitCost;
    const nextQty = prevQty + receivedQty;
    if (nextQty <= 0) return currAvg;
    return Number((totalCost / nextQty).toFixed(6));
  }

  private async generateCode(tx: Prisma.TransactionClient) {
    const rows = await tx.purchaseOrder.findMany({ select: { code: true } });
    let max = 0;
    for (const row of rows) {
      const m = /^PO-(\d{5,})$/.exec(row.code);
      if (!m) continue;
      const n = Number(m[1]);
      if (n > max) max = n;
    }
    return `PO-${String(max + 1).padStart(5, '0')}`;
  }
}
