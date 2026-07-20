import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  UserRole,
  WarehouseType,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import {
  StockAdjustmentDto,
  StockReservationDto,
  StockTransferDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: DatabaseService) {}

  async warehouses() {
    await this.ensureMainWarehouse();
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async summary(warehouseId?: string, actor?: any) {
    const canViewCosts = this.canViewCostData(actor);
    const where = warehouseId ? { warehouseId } : {};
    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        warehouse: true,
        catalogItem: {
          select: {
            id: true,
            sku: true,
            manufacturerPartNumber: true,
            name: true,
            stockMin: true,
            stockMax: true,
            averageCost: true,
            brand: true,
            storageLocation: true,
          },
        },
      },
      orderBy: [
        { warehouse: { name: 'asc' } },
        { catalogItem: { name: 'asc' } },
      ],
    });

    return balances.map((b) => ({
      id: b.id,
      warehouseId: b.warehouseId,
      warehouse: b.warehouse.name,
      catalogItemId: b.catalogItemId,
      sku: b.catalogItem.sku,
      partNumber: b.catalogItem.manufacturerPartNumber,
      item: b.catalogItem.name,
      physicalQty: b.physicalQty,
      reservedQty: b.reservedQty,
      availableQty: Number(b.physicalQty) - Number(b.reservedQty),
      minQty: b.minQty,
      maxQty: b.maxQty,
      reorderPoint: b.reorderPoint,
      brand: b.catalogItem.brand,
      storageLocation: b.catalogItem.storageLocation,
      avgCost: canViewCosts ? b.catalogItem.averageCost : null,
    }));
  }

  async replenishmentDrafts(warehouseId?: string, actor?: any) {
    const canViewCosts = this.canViewCostData(actor);
    const where = warehouseId ? { warehouseId } : {};
    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      include: {
        warehouse: true,
        catalogItem: {
          include: {
            supplierItems: {
              include: { supplier: true },
              orderBy: [{ leadTimeDays: 'asc' }, { supplierPrice: 'asc' }],
            },
          },
        },
      },
    });

    return balances
      .filter(
        (b) =>
          Number(b.physicalQty) - Number(b.reservedQty) < Number(b.minQty || 0),
      )
      .map((b) => {
        const best = b.catalogItem.supplierItems[0];
        const shortage = Math.max(
          0,
          Number(b.maxQty || b.minQty || 0) -
            (Number(b.physicalQty) - Number(b.reservedQty)),
        );
        return {
          warehouseId: b.warehouseId,
          warehouse: b.warehouse.name,
          catalogItemId: b.catalogItemId,
          item: b.catalogItem.name,
          availableQty: Number(b.physicalQty) - Number(b.reservedQty),
          minQty: b.minQty,
          maxQty: b.maxQty,
          suggestedQty: shortage,
          supplierSuggestion: best
            ? {
                supplierId: best.supplierId,
                supplierName: best.supplier.companyName,
                leadTimeDays: best.leadTimeDays,
                supplierPrice: canViewCosts ? best.supplierPrice : null,
              }
            : null,
        };
      });
  }

  async adjustStock(dto: StockAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureWarehouse(tx, dto.warehouseId);
      const itemIds: string[] = [];

      for (const item of dto.items) {
        const balance = await tx.inventoryBalance.upsert({
          where: {
            warehouseId_catalogItemId: {
              warehouseId: dto.warehouseId,
              catalogItemId: item.catalogItemId,
            },
          },
          update: {
            physicalQty: { increment: item.delta },
          },
          create: {
            warehouseId: dto.warehouseId,
            catalogItemId: item.catalogItemId,
            physicalQty: Math.max(0, item.delta),
            reservedQty: 0,
            minQty: 0,
            maxQty: 0,
          },
        });

        if (Number(balance.physicalQty) < 0) {
          throw new BadRequestException('Ajuste gera estoque fisico negativo.');
        }

        await tx.inventoryMovement.create({
          data: {
            movementType: InventoryMovementType.ADJUSTMENT,
            warehouseId: dto.warehouseId,
            catalogItemId: item.catalogItemId,
            quantity: item.delta,
            unitCost: item.unitCost,
            referenceType: 'MANUAL_ADJUSTMENT',
            note: dto.reason,
          },
        });

        itemIds.push(item.catalogItemId);
      }

      await this.syncCatalogStockCurrent(tx, itemIds);
      return { ok: true };
    });
  }

  async transfer(dto: StockTransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'Transferencia exige almoxarifados diferentes.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureWarehouse(tx, dto.fromWarehouseId);
      await this.ensureWarehouse(tx, dto.toWarehouseId);

      const fromBalance = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: dto.fromWarehouseId,
            catalogItemId: dto.catalogItemId,
          },
        },
      });

      const available =
        Number(fromBalance?.physicalQty || 0) -
        Number(fromBalance?.reservedQty || 0);
      if (available < dto.quantity) {
        throw new BadRequestException(
          'Estoque disponivel insuficiente para transferencia.',
        );
      }

      await tx.inventoryBalance.update({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: dto.fromWarehouseId,
            catalogItemId: dto.catalogItemId,
          },
        },
        data: {
          physicalQty: { decrement: dto.quantity },
        },
      });

      await tx.inventoryBalance.upsert({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: dto.toWarehouseId,
            catalogItemId: dto.catalogItemId,
          },
        },
        update: {
          physicalQty: { increment: dto.quantity },
        },
        create: {
          warehouseId: dto.toWarehouseId,
          catalogItemId: dto.catalogItemId,
          physicalQty: dto.quantity,
          reservedQty: 0,
          minQty: 0,
          maxQty: 0,
        },
      });

      await tx.inventoryMovement.createMany({
        data: [
          {
            movementType: InventoryMovementType.TRANSFER_OUT,
            warehouseId: dto.fromWarehouseId,
            catalogItemId: dto.catalogItemId,
            quantity: -dto.quantity,
            referenceType: 'TRANSFER',
            note: dto.reason,
          },
          {
            movementType: InventoryMovementType.TRANSFER_IN,
            warehouseId: dto.toWarehouseId,
            catalogItemId: dto.catalogItemId,
            quantity: dto.quantity,
            referenceType: 'TRANSFER',
            note: dto.reason,
          },
        ],
      });

      await this.syncCatalogStockCurrent(tx, [dto.catalogItemId]);
      return { ok: true };
    });
  }

  async reserve(dto: StockReservationDto) {
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.pickBalanceForReservation(
        tx,
        dto.catalogItemId,
        dto.quantity,
      );
      if (!balance) {
        throw new BadRequestException(
          'Nao ha estoque disponivel para reserva.',
        );
      }

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reservedQty: { increment: dto.quantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          movementType: InventoryMovementType.RESERVATION,
          warehouseId: balance.warehouseId,
          catalogItemId: dto.catalogItemId,
          quantity: dto.quantity,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        },
      });

      return {
        ok: true,
        warehouseId: balance.warehouseId,
      };
    });
  }

  async release(dto: StockReservationDto) {
    return this.prisma.$transaction(async (tx) => {
      const balances = await tx.inventoryBalance.findMany({
        where: { catalogItemId: dto.catalogItemId, reservedQty: { gt: 0 } },
        orderBy: [{ reservedQty: 'desc' }],
      });

      let remaining = dto.quantity;
      for (const balance of balances) {
        if (remaining <= 0) break;
        const releaseQty = Math.min(remaining, Number(balance.reservedQty));

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { reservedQty: { decrement: releaseQty } },
        });

        await tx.inventoryMovement.create({
          data: {
            movementType: InventoryMovementType.RELEASE,
            warehouseId: balance.warehouseId,
            catalogItemId: dto.catalogItemId,
            quantity: releaseQty,
            referenceType: dto.referenceType,
            referenceId: dto.referenceId,
          },
        });

        remaining -= releaseQty;
      }

      if (remaining > 0) {
        throw new BadRequestException(
          'Reserva insuficiente para liberar quantidade solicitada.',
        );
      }

      return { ok: true };
    });
  }

  async ensureMainWarehouse(tx?: Prisma.TransactionClient) {
    const prisma = tx || this.prisma;
    const existing = await prisma.warehouse.findFirst({
      where: { type: WarehouseType.MAIN },
    });
    if (existing) return existing;

    return prisma.warehouse.create({
      data: {
        code: 'MATRIZ',
        name: 'Almoxarifado Matriz',
        type: WarehouseType.MAIN,
      },
    });
  }

  private async ensureWarehouse(tx: Prisma.TransactionClient, id: string) {
    const wh = await tx.warehouse.findUnique({ where: { id } });
    if (!wh) throw new NotFoundException('Almoxarifado nao encontrado.');
    return wh;
  }

  private async pickBalanceForReservation(
    tx: Prisma.TransactionClient,
    catalogItemId: string,
    quantity: number,
  ) {
    const balances = await tx.inventoryBalance.findMany({
      where: { catalogItemId },
      orderBy: [{ warehouse: { type: 'asc' } }, { physicalQty: 'desc' }],
    });

    return balances.find(
      (item) => Number(item.physicalQty) - Number(item.reservedQty) >= quantity,
    );
  }

  private async syncCatalogStockCurrent(
    tx: Prisma.TransactionClient,
    catalogItemIds: string[],
  ) {
    const uniqueIds = [...new Set(catalogItemIds)];
    for (const catalogItemId of uniqueIds) {
      const agg = await tx.inventoryBalance.aggregate({
        where: { catalogItemId },
        _sum: { physicalQty: true },
      });
      await tx.catalogItem.update({
        where: { id: catalogItemId },
        data: { stockCurrent: Number(agg._sum.physicalQty || 0) },
      });
    }
  }

  private canViewCostData(actor?: any) {
    if (!actor) return false;
    if (actor.isSystemMaster || actor.role === UserRole.ADMIN) return true;
    return actor?.accessPolicy?.catalog?.viewCosts === true;
  }
}
