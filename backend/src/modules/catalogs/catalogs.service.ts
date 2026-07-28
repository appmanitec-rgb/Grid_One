import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemType, Prisma, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

export type CatalogActor = {
  isSystemMaster?: boolean;
  role?: UserRole;
  accessPolicy?: {
    catalog?: {
      viewCosts?: boolean;
    };
  };
};

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(createCatalogDto: CreateCatalogDto) {
    this.assertNoDirectStockMutation(createCatalogDto);

    if (createCatalogDto.type === 'PART' && !createCatalogDto.sku) {
      throw new BadRequestException(
        'Pecas fisicas necessitam de um codigo SKU.',
      );
    }

    if (createCatalogDto.sku) {
      const existingItem = await this.prisma.catalogItem.findUnique({
        where: { sku: createCatalogDto.sku },
      });
      if (existingItem) {
        throw new ConflictException(
          `O SKU ${createCatalogDto.sku} ja esta registrado.`,
        );
      }
    }

    const { catalogData } = this.prepareCatalogWriteData(createCatalogDto);
    return this.prisma.catalogItem.create({ data: catalogData });
  }

  async findAll(actor?: CatalogActor) {
    const canViewCosts = this.canViewCostData(actor);

    const items = await this.prisma.catalogItem.findMany({
      where: { isActive: true },
      include: {
        inventoryBalances: {
          include: {
            warehouse: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
        supplierItems: {
          include: {
            supplier: {
              select: { id: true, companyName: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 3,
        },
      },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => this.maskCatalogValues(item, canViewCosts));
  }

  async findOne(id: string, actor?: CatalogActor) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: this.operationalDetailInclude(),
    });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }

    return this.maskCatalogValues(
      this.withOperationalSummary(item),
      this.canViewCostData(actor),
    );
  }

  async lookup(
    query?: string,
    type?: string,
    take?: string | number,
    actor?: CatalogActor,
  ) {
    const search = query?.trim();
    const limit = this.parseLookupLimit(take);
    const normalizedType = Object.values(ItemType).includes(type as ItemType)
      ? (type as ItemType)
      : undefined;
    const where: Prisma.CatalogItemWhereInput = {
      isActive: true,
      ...(normalizedType ? { type: normalizedType } : {}),
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
                sku: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                commercialDescription: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                category: {
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
            ],
          }
        : {}),
    };

    const items = await this.prisma.catalogItem.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        commercialDescription: true,
        type: true,
        unit: true,
        basePrice: true,
        brand: true,
        category: true,
        costPrice: true,
        averageCost: true,
        lastCost: true,
        profitMargin: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return items.map((item) =>
      this.maskCatalogValues(item, this.canViewCostData(actor)),
    );
  }

  async update(
    id: string,
    updateCatalogDto: UpdateCatalogDto,
    actor?: CatalogActor,
  ) {
    this.assertNoDirectStockMutation(updateCatalogDto);
    await this.ensureItemExists(id);

    if (updateCatalogDto.sku) {
      const existingSku = await this.prisma.catalogItem.findUnique({
        where: { sku: updateCatalogDto.sku },
      });
      if (existingSku && existingSku.id !== id) {
        throw new ConflictException(
          `O SKU ${updateCatalogDto.sku} ja pertence a outro item.`,
        );
      }
    }

    const { catalogData, inventoryTargets } =
      this.prepareCatalogWriteData(updateCatalogDto);

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogItem.update({
        where: { id },
        data: catalogData,
      });

      if (Object.keys(inventoryTargets).length > 0) {
        await tx.inventoryBalance.updateMany({
          where: { catalogItemId: id },
          data: inventoryTargets,
        });
      }
    });

    return this.findOne(id, actor);
  }

  async remove(id: string) {
    await this.ensureItemExists(id);
    return this.prisma.catalogItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async movements(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { catalogItemId: id },
      include: {
        warehouse: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(movements, this.canViewCostData(actor));
  }

  async purchaseOrders(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { catalogItemId: id },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            code: true,
            status: true,
            issueDate: true,
            expectedDate: true,
            totalAmount: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(items, this.canViewCostData(actor));
  }

  async orders(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const materials = await this.prisma.maintenanceOrderMaterial.findMany({
      where: { catalogItemId: id },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        order: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            scheduledTo: true,
            openedAt: true,
            closedAt: true,
            generator: {
              select: {
                id: true,
                name: true,
                assetTag: true,
                serialNumber: true,
                client: { select: { id: true, companyName: true } },
              },
            },
            contract: { select: { id: true, code: true, title: true } },
            serviceReport: { select: { id: true, code: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(materials, this.canViewCostData(actor));
  }

  async suppliers(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const suppliers = await this.prisma.supplierCatalogItem.findMany({
      where: { catalogItemId: id },
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            cnpj: true,
            paymentTerm: true,
            qualityScore: true,
            punctualityScore: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 30,
    });
    return this.maskOperationalCosts(suppliers, this.canViewCostData(actor));
  }

  private async ensureItemExists(id: string) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }
  }

  private canViewCostData(actor?: CatalogActor) {
    if (!actor) return false;
    if (actor.isSystemMaster || actor.role === UserRole.ADMIN) return true;
    return actor?.accessPolicy?.catalog?.viewCosts === true;
  }

  private maskCatalogValues(item: any, canViewCosts: boolean) {
    if (canViewCosts) return item;
    return this.maskOperationalCosts(item, false);
  }

  private maskOperationalCosts<T>(item: T, canViewCosts: boolean): T {
    if (canViewCosts || item == null) return item;
    if (Array.isArray(item)) {
      return item.map((entry) =>
        this.maskOperationalCosts(entry, canViewCosts),
      ) as T;
    }
    if (typeof item !== 'object') return item;

    const current = item as Record<string, any>;
    const masked: Record<string, any> = { ...current };
    for (const key of [
      'costPrice',
      'averageCost',
      'lastCost',
      'taxPercentage',
      'profitMargin',
      'supplierPrice',
      'unitPrice',
      'unitCost',
      'totalPrice',
      'totalAmount',
      'avgCost',
      'stockValue',
    ]) {
      if (Object.prototype.hasOwnProperty.call(masked, key)) {
        masked[key] = null;
      }
    }

    for (const [key, value] of Object.entries(masked)) {
      if (Array.isArray(value)) {
        masked[key] = value.map((entry) =>
          this.maskOperationalCosts(entry, canViewCosts),
        );
      } else if (
        value &&
        typeof value === 'object' &&
        value instanceof Date === false
      ) {
        masked[key] = this.maskOperationalCosts(value, canViewCosts);
      }
    }

    return masked as T;
  }

  private parseLookupLimit(value?: string | number) {
    const parsed = Number(value ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.trunc(parsed), 1), 20);
  }

  private assertNoDirectStockMutation(dto: Record<string, any>) {
    const forbidden = ['stockCurrent', 'physicalQty', 'reservedQty'];
    const received = forbidden.filter((key) =>
      Object.prototype.hasOwnProperty.call(dto, key),
    );
    if (received.length > 0) {
      throw new BadRequestException(
        'Saldo de estoque nao pode ser alterado diretamente pelo cadastro. Use movimentacao, compra, reserva, consumo ou ajuste auditado.',
      );
    }
  }

  private prepareCatalogWriteData(dto: CreateCatalogDto | UpdateCatalogDto): {
    catalogData: Prisma.CatalogItemUncheckedCreateInput &
      Prisma.CatalogItemUncheckedUpdateInput;
    inventoryTargets: Prisma.InventoryBalanceUpdateManyMutationInput;
  } {
    const rawData = { ...(dto as Record<string, any>) };
    const reorderPoint = rawData.reorderPoint;
    delete rawData.reorderPoint;
    delete rawData.stockCurrent;

    const inventoryTargets: Prisma.InventoryBalanceUpdateManyMutationInput = {};
    if (typeof rawData.stockMin === 'number') {
      inventoryTargets.minQty = rawData.stockMin;
    }
    if (typeof rawData.stockMax === 'number') {
      inventoryTargets.maxQty = rawData.stockMax;
    }
    if (typeof reorderPoint === 'number') {
      inventoryTargets.reorderPoint = reorderPoint;
    }

    return {
      catalogData: rawData as Prisma.CatalogItemUncheckedCreateInput &
        Prisma.CatalogItemUncheckedUpdateInput,
      inventoryTargets,
    };
  }

  private operationalDetailInclude() {
    return {
      supplierItems: {
        include: {
          supplier: {
            select: {
              id: true,
              companyName: true,
              tradeName: true,
              cnpj: true,
              paymentTerm: true,
              qualityScore: true,
              punctualityScore: true,
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { createdAt: 'asc' as const },
        ],
        take: 10,
      },
      inventoryBalances: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: [{ warehouse: { name: 'asc' as const } }],
      },
      inventoryMovements: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 15,
      },
      purchaseOrderItems: {
        include: {
          purchaseOrder: {
            select: {
              id: true,
              code: true,
              status: true,
              issueDate: true,
              expectedDate: true,
              totalAmount: true,
              supplier: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      maintenanceOrderMaterials: {
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          order: {
            select: {
              id: true,
              title: true,
              status: true,
              type: true,
              scheduledTo: true,
              openedAt: true,
              closedAt: true,
              generator: {
                select: {
                  id: true,
                  name: true,
                  assetTag: true,
                  serialNumber: true,
                  client: { select: { id: true, companyName: true } },
                },
              },
              contract: { select: { id: true, code: true, title: true } },
              serviceReport: { select: { id: true, code: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      generatorBaseItems: {
        include: {
          generator: {
            select: {
              id: true,
              name: true,
              assetTag: true,
              serialNumber: true,
              client: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' as const },
        take: 10,
      },
    };
  }

  private withOperationalSummary(item: any) {
    type BalanceLike = {
      physicalQty?: number | string | null;
      reservedQty?: number | string | null;
      minQty?: number | string | null;
      maxQty?: number | string | null;
      reorderPoint?: number | string | null;
    };
    type SupplierItemLike = {
      id: string;
      supplierId: string;
      isPrimary?: boolean | null;
      supplierSku?: string | null;
      supplierPrice?: number | null;
      leadTimeDays?: number | null;
      supplier?: { companyName?: string | null };
    };
    type CatalogItemLike = {
      stockMin?: number | string | null;
      stockMax?: number | string | null;
      inventoryMovements?: unknown[];
      purchaseOrderItems?: unknown[];
      maintenanceOrderMaterials?: unknown[];
      generatorBaseItems?: unknown[];
    };

    const catalogItem = item as CatalogItemLike;
    const balances = (
      Array.isArray(item.inventoryBalances) ? item.inventoryBalances : []
    ) as BalanceLike[];
    const supplierItems = (
      Array.isArray(item.supplierItems) ? item.supplierItems : []
    ) as SupplierItemLike[];
    const physicalQty = balances.reduce(
      (sum, balance) => sum + Number(balance.physicalQty || 0),
      0,
    );
    const reservedQty = balances.reduce(
      (sum, balance) => sum + Number(balance.reservedQty || 0),
      0,
    );
    const availableQty = physicalQty - reservedQty;
    const minQty = this.maxNumber([
      catalogItem.stockMin,
      ...balances.map((balance) => balance.minQty),
    ]);
    const maxQty = this.maxNumber([
      catalogItem.stockMax,
      ...balances.map((balance) => balance.maxQty),
    ]);
    const reorderPoint = this.maxNumber(
      balances.map((balance) => balance.reorderPoint),
    );
    const effectiveTrigger = reorderPoint ?? minQty ?? 0;
    const primarySupplier =
      supplierItems.find((entry) => entry.isPrimary) ||
      supplierItems[0] ||
      null;

    return {
      ...item,
      operationalSummary: {
        physicalQty,
        reservedQty,
        availableQty,
        minQty,
        maxQty,
        reorderPoint,
        isLowStock: availableQty <= Number(effectiveTrigger || 0),
        warehouseCount: balances.length,
        movementCount: catalogItem.inventoryMovements?.length || 0,
        purchaseOrderCount: catalogItem.purchaseOrderItems?.length || 0,
        maintenanceOrderCount:
          catalogItem.maintenanceOrderMaterials?.length || 0,
        relatedGeneratorCount: catalogItem.generatorBaseItems?.length || 0,
        primarySupplier: primarySupplier
          ? {
              id: primarySupplier.supplierId,
              supplierItemId: primarySupplier.id,
              companyName: primarySupplier.supplier?.companyName,
              supplierSku: primarySupplier.supplierSku,
              leadTimeDays: primarySupplier.leadTimeDays,
              supplierPrice: primarySupplier.supplierPrice,
            }
          : null,
      },
    };
  }

  private maxNumber(values: Array<number | string | null | undefined>) {
    const finiteValues = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (finiteValues.length === 0) return null;
    return Math.max(...finiteValues);
  }
}
