import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  ItemType,
  Prisma,
  ProposalStatus,
  ProposalType,
  SalesOrderStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { createApprovedProposalOrder } from '../proposals/proposal-work-order';
import { SalesDeliveryDto, SalesOrderStockDto } from './dto/sales-order.dto';

type Actor = {
  sub?: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: {
    proposals?: { view?: boolean; approve?: boolean; cancel?: boolean };
    inventory?: { view?: boolean; update?: boolean; reserve?: boolean; consume?: boolean };
    finance?: { view?: boolean };
  };
};

@Injectable()
export class SalesOrdersService {
  constructor(private readonly prisma: DatabaseService) {}

  async list(actorValue: unknown, filters: { status?: string; query?: string; proposalId?: string; orderId?: string }) {
    const actor = this.actor(actorValue);
    this.requirePermission(actor, 'view');
    const status = Object.values(SalesOrderStatus).includes(filters.status as SalesOrderStatus)
      ? (filters.status as SalesOrderStatus)
      : undefined;
    const query = filters.query?.trim().slice(0, 100);
    const rows = await this.prisma.salesOrder.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(filters.proposalId ? { proposalId: filters.proposalId } : {}),
        ...(filters.orderId ? { id: filters.orderId } : {}),
        ...(query ? {
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { proposal: { code: { contains: query, mode: 'insensitive' } } },
            { client: { companyName: { contains: query, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        proposal: { select: { id: true, code: true, generatorId: true } },
        items: { select: { quantity: true, deliveredQty: true, allocations: { select: { reservedQty: true, pickedQty: true } } } },
        deliveries: { select: { id: true } },
        receivables: { select: { id: true, status: true, netAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const pricesVisible = this.canSeePrices(actor);
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      proposalId: row.proposalId,
      proposal: row.proposal,
      client: row.client,
      status: row.status,
      totalValue: pricesVisible ? row.totalValue : null,
      paymentTerm: pricesVisible ? row.paymentTerm : null,
      createdAt: row.createdAt,
      itemCount: row.items.length,
      orderedQty: row.items.reduce((sum, item) => sum + item.quantity, 0),
      deliveredQty: row.items.reduce((sum, item) => sum + item.deliveredQty, 0),
      reservedQty: row.items.reduce((sum, item) => sum + item.allocations.reduce((part, allocation) => part + allocation.reservedQty, 0), 0),
      pickedQty: row.items.reduce((sum, item) => sum + item.allocations.reduce((part, allocation) => part + allocation.pickedQty, 0), 0),
      deliveryCount: row.deliveries.length,
      receivableCount: row.receivables.length,
    }));
  }

  async get(id: string, actorValue: unknown) {
    const actor = this.actor(actorValue);
    this.requirePermission(actor, 'view');
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true, tradeName: true, cnpj: true } },
        proposal: { select: { id: true, code: true, generatorId: true, status: true } },
        items: {
          include: {
            catalogItem: { select: { id: true, sku: true, manufacturerPartNumber: true, name: true, isActive: true } },
            allocations: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
          },
        },
        deliveries: {
          include: { items: { include: { salesOrderItem: { select: { description: true } }, warehouse: { select: { name: true } } } } },
          orderBy: { deliveredAt: 'desc' },
        },
        receivables: { select: { id: true, description: true, status: true, netAmount: true, dueDate: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido de venda nao encontrado.');
    const pricesVisible = this.canSeePrices(actor);
    return {
      ...order,
      totalValue: pricesVisible ? order.totalValue : null,
      paymentTerm: pricesVisible ? order.paymentTerm : null,
      items: order.items.map((item) => ({
        ...item,
        unitPrice: pricesVisible ? item.unitPrice : null,
        totalPrice: pricesVisible ? item.totalPrice : null,
      })),
      receivables: pricesVisible ? order.receivables : order.receivables.map((row) => ({ id: row.id, status: row.status })),
    };
  }

  async syncApproved(actorValue: unknown) {
    const actor = this.actor(actorValue);
    this.requirePermission(actor, 'manage');
    const proposals = await this.prisma.proposal.findMany({
      where: { type: ProposalType.PARTS, status: ProposalStatus.WON, salesOrder: { is: null } },
      select: { id: true, code: true, generatorId: true, type: true, totalValue: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const errors: Array<{ proposalCode: string; reason: string }> = [];
    let created = 0;
    for (const proposal of proposals) {
      try {
        await this.runWrite((tx) => createApprovedProposalOrder(tx, proposal));
        created += 1;
      } catch (error) {
        errors.push({ proposalCode: proposal.code, reason: error instanceof Error ? error.message : 'Falha desconhecida.' });
      }
    }
    return { created, errors, limit: 200 };
  }

  async linkCatalog(orderId: string, itemId: string, catalogItemId: string, actorValue: unknown) {
    this.requirePermission(this.actor(actorValue), 'manage');
    return this.runWrite(async (tx) => {
      await this.requireOpenOrder(tx, orderId);
      const item = await tx.salesOrderItem.findFirst({ where: { id: itemId, salesOrderId: orderId }, include: { allocations: true } });
      if (!item) throw new NotFoundException('Item do pedido nao encontrado.');
      if (item.catalogItemId) {
        throw new ConflictException('A peca deste item ja esta vinculada. Corrija o cadastro antes de aprovar a proposta.');
      }
      if (item.deliveredQty > 0 || item.allocations.some((allocation) => allocation.reservedQty > 0)) {
        throw new ConflictException('Nao e possivel alterar um item ja separado ou entregue.');
      }
      const catalogItem = await tx.catalogItem.findUnique({ where: { id: catalogItemId }, select: { id: true, type: true, isActive: true } });
      if (!catalogItem || !catalogItem.isActive || catalogItem.type !== ItemType.PART) {
        throw new BadRequestException('Selecione uma peca ativa do catalogo.');
      }
      return tx.salesOrderItem.update({ where: { id: item.id }, data: { catalogItemId } });
    });
  }

  async reserve(orderId: string, input: SalesOrderStockDto, actorValue: unknown) {
    this.requirePermission(this.actor(actorValue), 'reserve');
    return this.runWrite(async (tx) => {
      await this.requireOpenOrder(tx, orderId);
      const item = await this.requireItem(tx, orderId, input.itemId);
      if (!item.catalogItemId) throw new BadRequestException('Vincule a peca ao catalogo antes de separar.');
      const allocated = item.allocations.reduce((sum, allocation) => sum + allocation.reservedQty, 0);
      if (input.quantity > item.quantity - item.deliveredQty - allocated) {
        throw new BadRequestException('Quantidade excede o saldo ainda nao reservado do pedido.');
      }
      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId }, select: { isActive: true } });
      if (!warehouse?.isActive) throw new BadRequestException('Almoxarifado indisponivel.');
      const balance = await tx.inventoryBalance.findUnique({
        where: { warehouseId_catalogItemId: { warehouseId: input.warehouseId, catalogItemId: item.catalogItemId } },
      });
      if (!balance || Number(balance.physicalQty) - Number(balance.reservedQty) < input.quantity) {
        throw new BadRequestException('Estoque disponivel insuficiente para separacao.');
      }
      await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reservedQty: { increment: input.quantity } } });
      await tx.salesOrderAllocation.upsert({
        where: { salesOrderItemId_warehouseId: { salesOrderItemId: item.id, warehouseId: input.warehouseId } },
        update: { reservedQty: { increment: input.quantity } },
        create: { salesOrderItemId: item.id, warehouseId: input.warehouseId, reservedQty: input.quantity },
      });
      await tx.inventoryMovement.create({ data: {
        movementType: InventoryMovementType.RESERVATION,
        warehouseId: input.warehouseId,
        catalogItemId: item.catalogItemId,
        quantity: input.quantity,
        referenceType: 'SALES_ORDER',
        referenceId: orderId,
        note: `Separacao do item ${item.id}`,
      } });
      return { ok: true };
    });
  }

  async pick(orderId: string, input: SalesOrderStockDto, actorValue: unknown) {
    this.requirePermission(this.actor(actorValue), 'reserve');
    return this.runWrite(async (tx) => {
      await this.requireOpenOrder(tx, orderId);
      const item = await this.requireItem(tx, orderId, input.itemId);
      const allocation = item.allocations.find((row) => row.warehouseId === input.warehouseId);
      if (!allocation || allocation.reservedQty - allocation.pickedQty < input.quantity) {
        throw new BadRequestException('Quantidade maior que a reserva ainda nao separada.');
      }
      await tx.salesOrderAllocation.update({ where: { id: allocation.id }, data: { pickedQty: { increment: input.quantity } } });
      return { ok: true };
    });
  }

  async release(orderId: string, input: SalesOrderStockDto, actorValue: unknown) {
    this.requirePermission(this.actor(actorValue), 'reserve');
    return this.runWrite(async (tx) => {
      await this.requireOpenOrder(tx, orderId);
      const item = await this.requireItem(tx, orderId, input.itemId);
      const allocation = item.allocations.find((row) => row.warehouseId === input.warehouseId);
      if (!allocation || !item.catalogItemId || allocation.reservedQty - allocation.pickedQty < input.quantity) {
        throw new BadRequestException('Somente reservas ainda nao separadas podem ser liberadas.');
      }
      await tx.salesOrderAllocation.update({ where: { id: allocation.id }, data: { reservedQty: { decrement: input.quantity } } });
      await tx.inventoryBalance.update({
        where: { warehouseId_catalogItemId: { warehouseId: input.warehouseId, catalogItemId: item.catalogItemId } },
        data: { reservedQty: { decrement: input.quantity } },
      });
      await tx.inventoryMovement.create({ data: {
        movementType: InventoryMovementType.RELEASE,
        warehouseId: input.warehouseId,
        catalogItemId: item.catalogItemId,
        quantity: input.quantity,
        referenceType: 'SALES_ORDER',
        referenceId: orderId,
        note: `Liberacao do item ${item.id}`,
      } });
      return { ok: true };
    });
  }

  async deliver(orderId: string, input: SalesDeliveryDto, actorValue: unknown) {
    const actor = this.actor(actorValue);
    this.requirePermission(actor, 'deliver');
    const receivedByName = input.receivedByName.trim();
    if (!receivedByName) throw new BadRequestException('Informe quem recebeu as pecas.');
    const keys = input.items.map((item) => `${item.itemId}:${item.warehouseId}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Item e almoxarifado repetidos na entrega.');
    return this.runWrite(async (tx) => {
      await this.requireOpenOrder(tx, orderId);
      const delivery = await tx.salesDelivery.create({ data: {
        code: `ENT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`,
        salesOrderId: orderId,
        receivedByName,
        shippingReference: input.shippingReference?.trim() || null,
        notes: input.notes?.trim() || null,
        deliveredByUserId: actor.sub || null,
      } });
      const changedCatalogItems = new Set<string>();
      for (const line of input.items) {
        const item = await this.requireItem(tx, orderId, line.itemId);
        const allocation = item.allocations.find((row) => row.warehouseId === line.warehouseId);
        if (!item.catalogItemId || !allocation || allocation.pickedQty < line.quantity || item.deliveredQty + line.quantity > item.quantity) {
          throw new BadRequestException('Entrega excede a quantidade separada ou vendida.');
        }
        const balance = await tx.inventoryBalance.findUnique({
          where: { warehouseId_catalogItemId: { warehouseId: line.warehouseId, catalogItemId: item.catalogItemId } },
        });
        if (!balance || Number(balance.physicalQty) < line.quantity || Number(balance.reservedQty) < line.quantity) {
          throw new ConflictException('Estoque mudou antes da entrega. Atualize o pedido.');
        }
        await tx.salesOrderAllocation.update({ where: { id: allocation.id }, data: {
          reservedQty: { decrement: line.quantity }, pickedQty: { decrement: line.quantity },
        } });
        await tx.salesOrderItem.update({ where: { id: item.id }, data: { deliveredQty: { increment: line.quantity } } });
        await tx.inventoryBalance.update({ where: { id: balance.id }, data: {
          physicalQty: { decrement: line.quantity }, reservedQty: { decrement: line.quantity },
        } });
        await tx.salesDeliveryItem.create({ data: {
          salesDeliveryId: delivery.id, salesOrderItemId: item.id, warehouseId: line.warehouseId, quantity: line.quantity,
        } });
        await tx.inventoryMovement.create({ data: {
          movementType: InventoryMovementType.SALES_DELIVERY,
          warehouseId: line.warehouseId,
          catalogItemId: item.catalogItemId,
          quantity: -line.quantity,
          referenceType: 'SALES_DELIVERY',
          referenceId: delivery.id,
          note: `Pedido ${orderId}`,
        } });
        changedCatalogItems.add(item.catalogItemId);
      }
      for (const catalogItemId of changedCatalogItems) {
        const aggregate = await tx.inventoryBalance.aggregate({ where: { catalogItemId }, _sum: { physicalQty: true } });
        await tx.catalogItem.update({ where: { id: catalogItemId }, data: { stockCurrent: aggregate._sum.physicalQty ?? 0 } });
      }
      const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: orderId }, select: { quantity: true, deliveredQty: true } });
      const status = items.every((item) => item.deliveredQty === item.quantity)
        ? SalesOrderStatus.DELIVERED : SalesOrderStatus.PARTIALLY_DELIVERED;
      await tx.salesOrder.update({ where: { id: orderId }, data: { status } });
      return { deliveryId: delivery.id, deliveryCode: delivery.code, status };
    });
  }

  async close(orderId: string, reasonValue: string, actorValue: unknown) {
    this.requirePermission(this.actor(actorValue), 'manage');
    const reason = reasonValue.trim();
    if (!reason) throw new BadRequestException('Informe o motivo do encerramento.');
    return this.runWrite(async (tx) => {
      const order = await this.requireOpenOrder(tx, orderId);
      const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: orderId }, include: { allocations: true } });
      for (const item of items) {
        for (const allocation of item.allocations.filter((row) => row.reservedQty > 0)) {
          if (!item.catalogItemId) throw new ConflictException('Reserva sem peca de catalogo.');
          await tx.inventoryBalance.update({
            where: { warehouseId_catalogItemId: { warehouseId: allocation.warehouseId, catalogItemId: item.catalogItemId } },
            data: { reservedQty: { decrement: allocation.reservedQty } },
          });
          await tx.salesOrderAllocation.update({ where: { id: allocation.id }, data: { reservedQty: 0, pickedQty: 0 } });
          await tx.inventoryMovement.create({ data: {
            movementType: InventoryMovementType.RELEASE,
            warehouseId: allocation.warehouseId,
            catalogItemId: item.catalogItemId,
            quantity: allocation.reservedQty,
            referenceType: 'SALES_ORDER', referenceId: orderId,
            note: `Encerramento: ${reason}`,
          } });
        }
      }
      const hasDelivery = items.some((item) => item.deliveredQty > 0);
      return tx.salesOrder.update({ where: { id: order.id }, data: {
        status: hasDelivery ? SalesOrderStatus.CLOSED : SalesOrderStatus.CANCELED,
        closedReason: reason,
        closedAt: new Date(),
      } });
    });
  }

  private async requireOpenOrder(tx: Prisma.TransactionClient, id: string) {
    const order = await tx.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido de venda nao encontrado.');
    if (order.status !== SalesOrderStatus.OPEN && order.status !== SalesOrderStatus.PARTIALLY_DELIVERED) {
      throw new ConflictException('Este pedido nao aceita novas movimentacoes.');
    }
    return order;
  }

  private async requireItem(tx: Prisma.TransactionClient, orderId: string, itemId: string) {
    const item = await tx.salesOrderItem.findFirst({ where: { id: itemId, salesOrderId: orderId }, include: { allocations: true } });
    if (!item) throw new NotFoundException('Item do pedido nao encontrado.');
    return item;
  }

  private actor(value: unknown): Actor {
    return (value || {}) as Actor;
  }

  private canSeePrices(actor: Actor) {
    return actor.isSystemMaster || actor.role === 'ADMIN' || actor.accessPolicy?.proposals?.view === true || actor.accessPolicy?.finance?.view === true;
  }

  private requirePermission(actor: Actor, action: 'view' | 'reserve' | 'deliver' | 'manage') {
    if (actor.isSystemMaster || actor.role === 'ADMIN') return;
    const access = actor.accessPolicy;
    const allowed = action === 'view'
      ? access?.proposals?.view || access?.inventory?.view || access?.finance?.view
      : action === 'reserve'
        ? access?.inventory?.reserve
        : action === 'deliver'
          ? access?.inventory?.consume
          : access?.inventory?.update || access?.proposals?.approve;
    if (!allowed) throw new ForbiddenException('Seu perfil nao possui permissao para esta etapa do pedido.');
  }

  private async runWrite<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('O estoque mudou durante a operacao. Atualize o pedido e tente novamente.');
      }
      throw error;
    }
  }
}
