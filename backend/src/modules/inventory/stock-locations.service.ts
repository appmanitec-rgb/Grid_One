import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { DatabaseService } from '../../database/database.service';
import { assertScreen } from '../auth/rules/access-rules';
import { managedProposalScope } from '../auth/rules/commercial-management';
import { assertProposalFinancialRelease } from '../proposals/proposal-financial-release';
import {
  assertStockQuantity,
  assertStockState,
  isLoopbackUrl,
  qrBaseUrl,
  stockRound,
  stockState,
  operationHash,
} from './stock-locations.domain';
import {
  CountLocationItemDto,
  CreateLocationDto,
  LocationBalanceDto,
  LocationDemandDto,
  LocationLabelsDto,
  LocationOperationDto,
  LocationOptionsDto,
  LocationPageDto,
  MoveLocationItemDto,
  PlaceLocationItemDto,
  ReleaseLocationReservationDto,
  ReserveLocationItemDto,
  TransferLocationReservationDto,
  UpdateLocationDto,
  WarehouseQrAccessDto,
} from './dto/stock-locations.dto';

export type StockLocationActor = {
  sub: string;
  name?: string;
  role: string;
  isSystemMaster?: boolean;
  accessRules?: unknown;
  accessPolicy?: Record<string, Record<string, boolean>>;
};
type Tx = Prisma.TransactionClient;
type Action = 'view' | 'create' | 'update' | 'adjust' | 'reserve';
const size = 10;
const itemSelect = {
  id: true,
  name: true,
  sku: true,
  manufacturerPartNumber: true,
  unit: true,
  photoUrl: true,
  type: true,
  isActive: true,
} as const;
const clientSelect = { id: true, companyName: true, tradeName: true } as const;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Change = {
  before?: unknown;
  after?: unknown;
  balanceId?: string;
  result?: Record<string, unknown>;
};

@Injectable()
export class StockLocationsService {
  constructor(private readonly db: DatabaseService) {}

  private allowed(
    actor: StockLocationActor,
    screen: string,
    section: string,
    action = 'view',
  ) {
    if (actor.role === 'CLIENT') return false;
    if (actor.isSystemMaster || actor.role === 'ADMIN') return true;
    try {
      assertScreen(actor, screen, action === 'view' ? undefined : action);
    } catch {
      return false;
    }
    return actor.accessPolicy?.[section]?.[action] === true;
  }
  private check(actor: StockLocationActor, action: Action = 'view') {
    if (
      !this.allowed(actor, 'stockLocations', 'inventory', 'view') ||
      !this.allowed(actor, 'stockLocations', 'inventory', action) ||
      (!(actor.isSystemMaster || actor.role === 'ADMIN') &&
        actor.accessPolicy?.pages?.inventory !== true)
    )
      throw new ForbiddenException(
        'Seu perfil não permite esta operação nas posições do almoxarifado.',
      );
  }
  capabilities(actor: StockLocationActor) {
    this.check(actor);
    return {
      ...Object.fromEntries(
        ['view', 'create', 'update', 'adjust', 'reserve'].map((a) => [
          a,
          this.allowed(actor, 'stockLocations', 'inventory', a),
        ]),
      ),
      handoff: this.allowed(actor, 'salesOrders', 'inventory', 'reserve'),
      catalog: this.allowed(actor, 'catalog', 'catalog'),
    };
  }
  private salesScope(actor: StockLocationActor): Prisma.SalesOrderWhereInput {
    return ['ADMIN', 'MANAGER', 'SALES', 'ENGINEER_APPLICATION'].includes(
      actor.role,
    ) ||
      (actor.accessPolicy?.proposals?.view &&
        !actor.accessPolicy?.finance?.view)
      ? { proposal: managedProposalScope(actor) }
      : {};
  }
  private async location(tx: Tx, id: string, active = false) {
    const location = await tx.warehouseLocation.findUnique({
      where: { id },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            qrBaseUrl: true,
          },
        },
      },
    });
    if (!location)
      throw new NotFoundException(
        'Posição não encontrada. Confira a etiqueta.',
      );
    if (active && (!location.isActive || !location.warehouse.isActive))
      throw new ConflictException('Esta posição ou almoxarifado está inativo.');
    return location;
  }
  private async balance(
    tx: Tx,
    locationId: string,
    id: string,
    expected: string,
  ) {
    const balance = await tx.inventoryBalance.findFirst({
      where: { id, locationId },
      include: { catalogItem: { select: itemSelect } },
    });
    if (!balance)
      throw new NotFoundException(
        'O item não está mais nesta posição. Atualize a tela.',
      );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM inventory_balances WHERE id=${id} FOR UPDATE`,
    );
    assertStockState(balance, expected);
    return balance;
  }
  private async operation<T extends LocationOperationDto>(
    actor: StockLocationActor,
    action: string,
    locationId: string,
    dto: T,
    apply: (tx: Tx) => Promise<Change>,
  ) {
    const hash = operationHash({
      action,
      target: action === 'CREATE' ? null : locationId,
      dto,
    });
    for (let attempt = 0; attempt < 2; attempt++)
      try {
        return await this.db.$transaction(
          async (tx) => {
            const prior = await tx.stockLocationOperation.findUnique({
              where: { requestKey: dto.requestKey },
            });
            if (prior) {
              if (prior.actorId !== actor.sub || prior.payloadHash !== hash)
                throw new ConflictException(
                  'Esta confirmação já foi usada com outros dados. Atualize a operação.',
                );
              return {
                ...(prior.result as Record<string, unknown>),
                replayed: true,
              };
            }
            if (action !== 'CREATE') {
              const ids = [
                locationId,
                ...('toLocationId' in dto ? [String(dto.toLocationId)] : []),
              ].sort();
              for (const id of [...new Set(ids)])
                await tx.$queryRaw(
                  Prisma.sql`SELECT id FROM warehouse_locations WHERE id=${id} FOR UPDATE`,
                );
            }
            const user = await tx.user.findUnique({
              where: { id: actor.sub },
              select: { name: true },
            });
            if (!user)
              throw new ForbiddenException(
                'Usuário não encontrado. Entre novamente.',
              );
            const change = await apply(tx),
              result = { ok: true, locationId, ...change.result };
            await tx.stockLocationOperation.create({
              data: {
                requestKey: dto.requestKey,
                payloadHash: hash,
                locationId,
                balanceId: change.balanceId,
                action,
                actorId: actor.sub,
                actorName: user.name,
                reason: dto.reason?.trim() || null,
                beforeData:
                  change.before === undefined ? undefined : json(change.before),
                afterData:
                  change.after === undefined ? undefined : json(change.after),
                result: json(result),
              },
            });
            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 15000,
            maxWait: 10000,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code)
        ) {
          if (attempt === 0) continue;
          throw new ConflictException(
            'O estoque ou o código da posição mudou. Atualize a tela e confira novamente.',
          );
        }
        throw error;
      }
    throw new ConflictException('Não foi possível concluir. Atualize a tela.');
  }
  async list(query: LocationPageDto, actor: StockLocationActor) {
    this.check(actor);
    const where: Prisma.WarehouseLocationWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status === 'ALL'
        ? {}
        : { isActive: query.status === 'ACTIVE' }),
      ...(query.q.trim()
        ? {
            OR: ['code', 'name', 'aisle', 'shelf', 'level', 'compartment'].map(
              (key) => ({
                [key]: { contains: query.q.trim(), mode: 'insensitive' },
              }),
            ),
          }
        : {}),
    };
    const [items, total, unlocated] = await Promise.all([
      this.db.warehouseLocation.findMany({
        where,
        include: {
          warehouse: {
            select: { id: true, name: true, code: true, qrBaseUrl: true },
          },
          _count: { select: { balances: true } },
        },
        orderBy: [{ warehouse: { name: 'asc' } }, { code: 'asc' }],
        skip: (query.page - 1) * size,
        take: size,
      }),
      this.db.warehouseLocation.count({ where }),
      this.db.inventoryBalance.count({
        where: {
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
          locationId: null,
          catalogItem: { type: 'PART', isActive: true },
        },
      }),
    ]);
    const unchecked = items.length
      ? await this.db.inventoryBalance.groupBy({
          by: ['locationId'],
          where: {
            locationId: { in: items.map((x) => x.id) },
            lastVerifiedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    return {
      items: items.map((x) => ({
        ...x,
        itemCount: x._count.balances,
        uncheckedCount:
          unchecked.find((n) => n.locationId === x.id)?._count._all ?? 0,
      })),
      total,
      unlocated,
      page: query.page,
      pageSize: size,
      capabilities: this.capabilities(actor),
    };
  }
  async detail(id: string, actor: StockLocationActor) {
    this.check(actor);
    return {
      ...(await this.location(this.db, id)),
      capabilities: this.capabilities(actor),
      demandSources: {
        SALES: this.allowed(actor, 'salesOrders', 'inventory'),
        WORK: this.allowed(actor, 'orders', 'orders'),
        PROCUREMENT: this.allowed(actor, 'purchaseRequests', 'purchaseOrders'),
      },
    };
  }
  async items(id: string, query: LocationPageDto, actor: StockLocationActor) {
    this.check(actor);
    await this.location(this.db, id);
    const where: Prisma.InventoryBalanceWhereInput = {
      locationId: id,
      ...(query.q.trim()
        ? {
            catalogItem: {
              OR: [
                { name: { contains: query.q.trim(), mode: 'insensitive' } },
                { sku: { contains: query.q.trim(), mode: 'insensitive' } },
                {
                  manufacturerPartNumber: {
                    contains: query.q.trim(),
                    mode: 'insensitive',
                  },
                },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.inventoryBalance.findMany({
        where,
        include: { catalogItem: { select: itemSelect } },
        orderBy: [{ catalogItem: { name: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * size,
        take: size,
      }),
      this.db.inventoryBalance.count({ where }),
    ]);
    const holds = rows.length
      ? await this.db.inventoryClientReservation.groupBy({
          by: ['balanceId'],
          where: {
            balanceId: { in: rows.map((x) => x.id) },
            remainingQty: { gt: 0 },
          },
          _sum: { remainingQty: true },
        })
      : [];
    return {
      items: rows.map((b) => ({
        ...b,
        availableQty: stockRound(b.physicalQty - b.reservedQty),
        clientReservedQty:
          holds.find((h) => h.balanceId === b.id)?._sum.remainingQty ?? 0,
        expectedState: stockState(b),
      })),
      total,
      page: query.page,
      pageSize: size,
    };
  }
  async reservations(
    id: string,
    query: LocationPageDto,
    actor: StockLocationActor,
  ) {
    this.check(actor);
    await this.location(this.db, id);
    const where: Prisma.InventoryClientReservationWhereInput = {
      balance: { locationId: id },
      remainingQty: { gt: 0 },
    };
    const [rows, total] = await Promise.all([
      this.db.inventoryClientReservation.findMany({
        where,
        include: {
          client: { select: clientSelect },
          balance: { include: { catalogItem: { select: itemSelect } } },
        },
        orderBy: [{ neededAt: 'asc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * size,
        take: size,
      }),
      this.db.inventoryClientReservation.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ ...r, expectedState: stockState(r.balance) })),
      total,
      page: query.page,
      pageSize: size,
    };
  }
  async history(id: string, query: LocationPageDto, actor: StockLocationActor) {
    this.check(actor);
    await this.location(this.db, id);
    const where: Prisma.StockLocationOperationWhereInput = {
      OR: [
        { locationId: id },
        {
          action: 'MOVE',
          afterData: { path: ['targetLocationId'], equals: id },
        },
      ],
    };
    const [items, total] = await Promise.all([
      this.db.stockLocationOperation.findMany({
        where,
        select: {
          id: true,
          action: true,
          actorName: true,
          reason: true,
          beforeData: true,
          afterData: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * size,
        take: size,
      }),
      this.db.stockLocationOperation.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: size };
  }

  async create(dto: CreateLocationDto, actor: StockLocationActor) {
    this.check(actor, 'create');
    const id = randomUUID();
    return this.operation(actor, 'CREATE', id, dto, async (tx) => {
      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse?.isActive)
        throw new BadRequestException('Selecione um almoxarifado ativo.');
      const location = await tx.warehouseLocation.create({
        data: {
          id,
          warehouseId: dto.warehouseId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name,
          aisle: dto.aisle,
          shelf: dto.shelf,
          level: dto.level,
          compartment: dto.compartment,
        },
      });
      return { after: location, result: { id } };
    });
  }
  async update(id: string, dto: UpdateLocationDto, actor: StockLocationActor) {
    this.check(actor, 'update');
    return this.operation(actor, 'UPDATE', id, dto, async (tx) => {
      const previous = await this.location(tx, id);
      if (previous.version !== dto.version)
        throw new ConflictException(
          'Esta posição foi alterada por outra pessoa. Atualize a tela.',
        );
      if (
        !dto.isActive &&
        (await tx.inventoryBalance.count({ where: { locationId: id } }))
      )
        throw new ConflictException(
          'Mova ou desvincule os itens antes de inativar a posição.',
        );
      const next = await tx.warehouseLocation.update({
        where: { id },
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name,
          aisle: dto.aisle,
          shelf: dto.shelf,
          level: dto.level,
          compartment: dto.compartment,
          isActive: dto.isActive,
          version: { increment: 1 },
        },
      });
      return { before: previous, after: next };
    });
  }
  async place(
    id: string,
    dto: PlaceLocationItemDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'update');
    return this.operation(actor, 'PLACE', id, dto, async (tx) => {
      const loc = await this.location(tx, id, true),
        item = await tx.catalogItem.findUnique({
          where: { id: dto.catalogItemId },
          select: itemSelect,
        });
      if (!item?.isActive || item.type !== 'PART')
        throw new BadRequestException(
          'Selecione uma peça ativa. Serviços não são armazenados em prateleiras.',
        );
      let balance = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: loc.warehouseId,
            catalogItemId: item.id,
          },
        },
      });
      if (balance) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM inventory_balances WHERE id=${balance.id} FOR UPDATE`,
        );
        assertStockState(balance, dto.expectedState);
        if (balance.locationId && balance.locationId !== id)
          throw new ConflictException(
            'O item já possui posição neste almoxarifado. Use Mover posição.',
          );
      } else {
        if (dto.expectedState !== 'NEW')
          throw new ConflictException(
            'O saldo mudou. Pesquise novamente o item.',
          );
        balance = await tx.inventoryBalance.create({
          data: { warehouseId: loc.warehouseId, catalogItemId: item.id },
        });
      }
      const next = await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { locationId: id },
      });
      return {
        balanceId: balance.id,
        before: { item: item.name, locationId: balance.locationId },
        after: {
          item: item.name,
          locationId: next.locationId,
          quantity: next.physicalQty,
        },
      };
    });
  }
  async move(id: string, dto: MoveLocationItemDto, actor: StockLocationActor) {
    this.check(actor, 'update');
    if (!dto.reason?.trim())
      throw new BadRequestException('Informe o motivo da mudança de posição.');
    if (dto.toLocationId === id)
      throw new BadRequestException('Escolha outra posição.');
    return this.operation(actor, 'MOVE', id, dto, async (tx) => {
      const source = await this.location(tx, id, true),
        target = await this.location(tx, dto.toLocationId, true);
      if (source.warehouseId !== target.warehouseId)
        throw new BadRequestException(
          'A mudança de posição deve permanecer no mesmo almoxarifado. Para outro almoxarifado, use transferência de estoque.',
        );
      const balance = await this.balance(
        tx,
        id,
        dto.balanceId,
        dto.expectedState,
      );
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { locationId: target.id },
      });
      return {
        balanceId: balance.id,
        before: { item: balance.catalogItem.name, position: source.code },
        after: {
          item: balance.catalogItem.name,
          position: target.code,
          targetLocationId: target.id,
          quantity: balance.physicalQty,
        },
        result: { destinationId: target.id },
      };
    });
  }
  async unplace(
    id: string,
    dto: LocationBalanceDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'update');
    if (!dto.reason?.trim())
      throw new BadRequestException('Informe o motivo para desvincular.');
    return this.operation(actor, 'UNPLACE', id, dto, async (tx) => {
      await this.location(tx, id, true);
      const b = await this.balance(tx, id, dto.balanceId, dto.expectedState);
      if (b.physicalQty !== 0 || b.reservedQty !== 0)
        throw new ConflictException(
          'Somente itens com saldo físico e reservado zerados podem ficar sem posição. Para os demais, use Mover posição.',
        );
      await tx.inventoryBalance.update({
        where: { id: b.id },
        data: { locationId: null },
      });
      return {
        balanceId: b.id,
        before: { item: b.catalogItem.name, position: id },
        after: { item: b.catalogItem.name, position: null },
      };
    });
  }
  async count(
    id: string,
    dto: CountLocationItemDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'adjust');
    return this.operation(actor, 'COUNT', id, dto, async (tx) => {
      await this.location(tx, id, true);
      const b = await this.balance(tx, id, dto.balanceId, dto.expectedState);
      assertStockQuantity(dto.countedQty, b.catalogItem.unit);
      if (dto.countedQty < stockRound(b.reservedQty))
        throw new ConflictException(
          'A contagem ficou abaixo do reservado. Revise ou libere as reservas antes de ajustar.',
        );
      const delta = stockRound(dto.countedQty - b.physicalQty);
      if (delta !== 0 && !dto.reason?.trim())
        throw new BadRequestException(
          'Descreva o motivo da divergência encontrada.',
        );
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.sub },
        select: { name: true },
      });
      await tx.inventoryBalance.update({
        where: { id: b.id },
        data: {
          physicalQty: dto.countedQty,
          lastVerifiedAt: new Date(),
          lastVerifiedById: actor.sub,
          lastVerifiedByName: user.name,
        },
      });
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            movementType: 'ADJUSTMENT',
            warehouseId: b.warehouseId,
            catalogItemId: b.catalogItemId,
            quantity: delta,
            referenceType: 'LOCATION_COUNT',
            referenceId: dto.requestKey,
            note: dto.reason,
          },
        });
        const sum = await tx.inventoryBalance.aggregate({
          where: { catalogItemId: b.catalogItemId },
          _sum: { physicalQty: true },
        });
        await tx.catalogItem.update({
          where: { id: b.catalogItemId },
          data: { stockCurrent: stockRound(sum._sum.physicalQty ?? 0) },
        });
      }
      return {
        balanceId: b.id,
        before: {
          item: b.catalogItem.name,
          quantity: b.physicalQty,
          reserved: b.reservedQty,
        },
        after: { item: b.catalogItem.name, quantity: dto.countedQty, delta },
        result: { delta },
      };
    });
  }
  async reserve(
    id: string,
    dto: ReserveLocationItemDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'reserve');
    return this.operation(actor, 'RESERVE', id, dto, async (tx) => {
      await this.location(tx, id, true);
      const b = await this.balance(tx, id, dto.balanceId, dto.expectedState);
      assertStockQuantity(dto.quantity, b.catalogItem.unit);
      if (!b.catalogItem.isActive)
        throw new BadRequestException(
          'O item está inativo no catálogo. Revise seu cadastro antes de criar uma reserva antecipada.',
        );
      if (
        dto.quantity <= 0 ||
        dto.quantity > stockRound(b.physicalQty - b.reservedQty)
      )
        throw new ConflictException(
          'Quantidade maior que o estoque disponível.',
        );
      const client = await tx.client.findUnique({
        where: { id: dto.clientId },
        select: { ...clientSelect, isActive: true },
      });
      if (!client?.isActive)
        throw new BadRequestException('Selecione um cliente ativo.');
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.sub },
        select: { name: true },
      });
      await tx.inventoryBalance.update({
        where: { id: b.id },
        data: { reservedQty: stockRound(b.reservedQty + dto.quantity) },
      });
      const reservation = await tx.inventoryClientReservation.create({
        data: {
          balanceId: b.id,
          clientId: client.id,
          quantity: dto.quantity,
          remainingQty: dto.quantity,
          createdById: actor.sub,
          createdByName: user.name,
          notes: dto.reason,
          neededAt: dto.neededAt ? new Date(dto.neededAt) : null,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          movementType: 'RESERVATION',
          warehouseId: b.warehouseId,
          catalogItemId: b.catalogItemId,
          quantity: dto.quantity,
          referenceType: 'CLIENT_HOLD',
          referenceId: reservation.id,
          note: dto.reason,
        },
      });
      return {
        balanceId: b.id,
        before: { reserved: b.reservedQty },
        after: {
          item: b.catalogItem.name,
          client: client.tradeName || client.companyName,
          quantity: dto.quantity,
          reserved: stockRound(b.reservedQty + dto.quantity),
        },
        result: { reservationId: reservation.id },
      };
    });
  }
  private async held(
    tx: Tx,
    id: string,
    reservationId: string,
    expected: string,
  ) {
    const hold = await tx.inventoryClientReservation.findUnique({
      where: { id: reservationId },
      include: {
        client: { select: clientSelect },
        balance: { include: { catalogItem: { select: itemSelect } } },
      },
    });
    if (!hold || hold.balance.locationId !== id)
      throw new NotFoundException('Reserva não encontrada nesta posição.');
    await this.balance(tx, id, hold.balanceId, expected);
    return hold;
  }
  async release(
    id: string,
    reservationId: string,
    dto: ReleaseLocationReservationDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'reserve');
    if (!dto.reason?.trim())
      throw new BadRequestException('Informe o motivo da liberação.');
    return this.operation(
      actor,
      'RELEASE',
      id,
      { ...dto, reservationId },
      async (tx) => {
        await this.location(tx, id, true);
        const hold = await this.held(tx, id, reservationId, dto.expectedState);
        if (dto.quantity > stockRound(hold.remainingQty))
          throw new ConflictException(
            'Quantidade maior que a reserva antecipada restante.',
          );
        assertStockQuantity(dto.quantity, hold.balance.catalogItem.unit);
        await tx.inventoryClientReservation.update({
          where: { id: hold.id },
          data: { remainingQty: stockRound(hold.remainingQty - dto.quantity) },
        });
        await tx.inventoryBalance.update({
          where: { id: hold.balanceId },
          data: {
            reservedQty: stockRound(hold.balance.reservedQty - dto.quantity),
          },
        });
        await tx.inventoryMovement.create({
          data: {
            movementType: 'RELEASE',
            warehouseId: hold.balance.warehouseId,
            catalogItemId: hold.balance.catalogItemId,
            quantity: dto.quantity,
            referenceType: 'CLIENT_HOLD',
            referenceId: hold.id,
            note: dto.reason,
          },
        });
        return {
          balanceId: hold.balanceId,
          before: {
            client: hold.client.tradeName || hold.client.companyName,
            remaining: hold.remainingQty,
          },
          after: {
            remaining: stockRound(hold.remainingQty - dto.quantity),
            released: dto.quantity,
          },
        };
      },
    );
  }
  async transferReservation(
    id: string,
    reservationId: string,
    dto: TransferLocationReservationDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'reserve');
    if (!this.allowed(actor, 'salesOrders', 'inventory', 'reserve'))
      throw new ForbiddenException(
        'Seu perfil não permite reservar em pedidos de venda.',
      );
    return this.operation(
      actor,
      'HANDOFF',
      id,
      { ...dto, reservationId },
      async (tx) => {
        await this.location(tx, id, true);
        const hold = await this.held(tx, id, reservationId, dto.expectedState);
        if (
          !Number.isInteger(dto.quantity) ||
          dto.quantity <= 0 ||
          dto.quantity > stockRound(hold.remainingQty)
        )
          throw new BadRequestException(
            'Informe uma quantidade inteira dentro da reserva restante.',
          );
        const item = await tx.salesOrderItem.findFirst({
          where: {
            id: dto.salesOrderItemId,
            catalogItemId: hold.balance.catalogItemId,
            salesOrder: {
              ...this.salesScope(actor),
              clientId: hold.clientId,
              status: { in: ['OPEN', 'PARTIALLY_DELIVERED'] },
            },
          },
          include: {
            allocations: true,
            salesOrder: { select: { id: true, code: true, proposalId: true } },
          },
        });
        if (!item)
          throw new NotFoundException(
            'Pedido compatível não encontrado ou não autorizado.',
          );
        await assertProposalFinancialRelease(tx, item.salesOrder.proposalId);
        if (
          dto.quantity >
          item.quantity -
            item.deliveredQty -
            item.allocations.reduce((n, a) => n + a.reservedQty, 0)
        )
          throw new ConflictException(
            'Esta quantidade já foi reservada ou excede o restante do pedido.',
          );
        await tx.inventoryClientReservation.update({
          where: { id: hold.id },
          data: { remainingQty: stockRound(hold.remainingQty - dto.quantity) },
        });
        await tx.salesOrderAllocation.upsert({
          where: {
            salesOrderItemId_warehouseId: {
              salesOrderItemId: item.id,
              warehouseId: hold.balance.warehouseId,
            },
          },
          create: {
            salesOrderItemId: item.id,
            warehouseId: hold.balance.warehouseId,
            reservedQty: dto.quantity,
          },
          update: { reservedQty: { increment: dto.quantity } },
        });
        await tx.inventoryBalance.update({
          where: { id: hold.balanceId },
          data: { updatedAt: new Date() },
        });
        await tx.inventoryMovement.createMany({
          data: [
            {
              movementType: 'RELEASE',
              warehouseId: hold.balance.warehouseId,
              catalogItemId: hold.balance.catalogItemId,
              quantity: dto.quantity,
              referenceType: 'CLIENT_HOLD',
              referenceId: hold.id,
              note: 'Vinculada ao pedido ' + item.salesOrder.code,
            },
            {
              movementType: 'RESERVATION',
              warehouseId: hold.balance.warehouseId,
              catalogItemId: hold.balance.catalogItemId,
              quantity: dto.quantity,
              referenceType: 'SALES_ORDER',
              referenceId: item.salesOrder.id,
              note: 'Origem: reserva antecipada ' + hold.id,
            },
          ],
        });
        return {
          balanceId: hold.balanceId,
          before: { reservation: hold.id, remaining: hold.remainingQty },
          after: {
            order: item.salesOrder.code,
            quantity: dto.quantity,
            remaining: stockRound(hold.remainingQty - dto.quantity),
          },
          result: { salesOrderId: item.salesOrder.id },
        };
      },
    );
  }

  async options(query: LocationOptionsDto, actor: StockLocationActor) {
    this.check(actor);
    if (query.kind === 'CLIENTS' || query.kind === 'SALES_TARGETS')
      this.check(actor, 'reserve');
    if (query.kind === 'ITEMS') this.check(actor, 'update');
    const q = query.q.trim(),
      contains = { contains: q, mode: 'insensitive' } as const;
    if (query.kind === 'CLIENTS')
      return (
        await this.db.client.findMany({
          where: {
            isActive: true,
            ...(q
              ? {
                  OR: [
                    { companyName: contains },
                    { tradeName: contains },
                    { code: contains },
                  ],
                }
              : {}),
          },
          select: clientSelect,
          take: size,
          orderBy: { companyName: 'asc' },
        })
      ).map((x) => ({ id: x.id, label: x.tradeName || x.companyName }));
    if (query.kind === 'LOCATIONS')
      return (
        await this.db.warehouseLocation.findMany({
          where: {
            isActive: true,
            warehouse: { isActive: true },
            ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            ...(q ? { OR: [{ code: contains }, { name: contains }] } : {}),
          },
          select: {
            id: true,
            code: true,
            name: true,
            warehouse: { select: { name: true } },
          },
          take: size,
          orderBy: { code: 'asc' },
        })
      ).map((x) => ({
        id: x.id,
        label: [x.code, x.name, x.warehouse.name].filter(Boolean).join(' · '),
      }));
    if (query.kind === 'ITEMS') {
      if (!query.warehouseId)
        throw new BadRequestException('Selecione o almoxarifado.');
      const rows = await this.db.catalogItem.findMany({
        where: {
          type: 'PART',
          isActive: true,
          ...(q
            ? {
                OR: [
                  { name: contains },
                  { sku: contains },
                  { manufacturerPartNumber: contains },
                ],
              }
            : {}),
        },
        select: {
          ...itemSelect,
          inventoryBalances: {
            where: { warehouseId: query.warehouseId },
            include: { location: { select: { id: true, code: true } } },
          },
        },
        take: size,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return rows.map((x) => {
        const b = x.inventoryBalances[0];
        return {
          id: x.id,
          label: [x.sku, x.name].filter(Boolean).join(' · '),
          expectedState: b ? stockState(b) : 'NEW',
          location: b?.location ?? null,
          physicalQty: b?.physicalQty ?? 0,
          unit: x.unit,
        };
      });
    }
    if (
      !query.reservationId ||
      !this.allowed(actor, 'salesOrders', 'inventory', 'reserve')
    )
      return [];
    const hold = await this.db.inventoryClientReservation.findUnique({
      where: { id: query.reservationId },
      include: { balance: true },
    });
    if (!hold || hold.remainingQty <= 0) return [];
    const rows = await this.db.salesOrderItem.findMany({
      where: {
        catalogItemId: hold.balance.catalogItemId,
        quantity: { gt: this.db.salesOrderItem.fields.deliveredQty },
        salesOrder: {
          ...this.salesScope(actor),
          clientId: hold.clientId,
          status: { in: ['OPEN', 'PARTIALLY_DELIVERED'] },
          ...(q ? { code: contains } : {}),
        },
      },
      select: {
        id: true,
        description: true,
        quantity: true,
        deliveredQty: true,
        allocations: { select: { reservedQty: true } },
        salesOrder: { select: { code: true } },
      },
      take: size,
      orderBy: { id: 'asc' },
    });
    return rows
      .map((x) => ({
        id: x.id,
        label: x.salesOrder.code + ' · ' + x.description,
        remainingQty:
          x.quantity -
          x.deliveredQty -
          x.allocations.reduce((n, a) => n + a.reservedQty, 0),
      }))
      .filter((x) => x.remainingQty > 0);
  }
  async demands(
    id: string,
    query: LocationDemandDto,
    actor: StockLocationActor,
  ) {
    this.check(actor);
    const loc = await this.location(this.db, id),
      p = { skip: (query.page - 1) * size, take: size };
    const catalogWhere: Prisma.CatalogItemWhereInput = {
      inventoryBalances: { some: { locationId: id } },
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (query.source === 'SALES') {
      if (!this.allowed(actor, 'salesOrders', 'inventory'))
        return { items: [], total: 0, restricted: true };
      const where: Prisma.SalesOrderItemWhereInput = {
        catalogItem: catalogWhere,
        quantity: { gt: this.db.salesOrderItem.fields.deliveredQty },
        salesOrder: {
          ...this.salesScope(actor),
          status: { in: ['OPEN', 'PARTIALLY_DELIVERED'] },
        },
      };
      const [rows, total] = await Promise.all([
        this.db.salesOrderItem.findMany({
          where,
          ...p,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            description: true,
            quantity: true,
            deliveredQty: true,
            allocations: {
              select: { warehouseId: true, reservedQty: true, pickedQty: true },
            },
            salesOrder: {
              select: {
                id: true,
                code: true,
                status: true,
                client: { select: clientSelect },
              },
            },
          },
        }),
        this.db.salesOrderItem.count({ where }),
      ]);
      return {
        items: rows.map((x) => ({
          id: x.id,
          code: x.salesOrder.code,
          description: x.description,
          client:
            x.salesOrder.client.tradeName || x.salesOrder.client.companyName,
          quantity: x.quantity - x.deliveredQty,
          reserved: x.allocations
            .filter((a) => a.warehouseId === loc.warehouseId)
            .reduce((n, a) => n + a.reservedQty, 0),
          href: '/dashboard/sales-orders?orderId=' + x.salesOrder.id,
          status: x.salesOrder.status,
        })),
        total,
        page: query.page,
        pageSize: size,
      };
    }
    if (query.source === 'WORK') {
      if (!this.allowed(actor, 'orders', 'orders'))
        return { items: [], total: 0, restricted: true };
      const where: Prisma.MaintenanceOrderMaterialWhereInput = {
        catalogItem: catalogWhere,
        appliedAt: null,
        OR: [{ warehouseId: loc.warehouseId }, { warehouseId: null }],
        order: {
          status: { notIn: ['COMPLETED', 'CANCELED'] },
          ...(actor.role === 'TECHNICIAN'
            ? { technician: { userId: actor.sub } }
            : {}),
        },
      };
      const [rows, total] = await Promise.all([
        this.db.maintenanceOrderMaterial.findMany({
          where,
          ...p,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            quantity: true,
            reservedAt: true,
            separatedAt: true,
            catalogItem: { select: { name: true } },
            order: {
              select: {
                id: true,
                title: true,
                status: true,
                generator: { select: { client: { select: clientSelect } } },
              },
            },
          },
        }),
        this.db.maintenanceOrderMaterial.count({ where }),
      ]);
      return {
        items: rows.map((x) => ({
          id: x.id,
          code: 'O.S. · ' + x.order.title,
          description: x.catalogItem.name,
          client:
            x.order.generator.client.tradeName ||
            x.order.generator.client.companyName,
          quantity: x.quantity,
          reserved: x.reservedAt ? x.quantity : 0,
          href: '/dashboard/orders/' + x.order.id,
          status: x.separatedAt ? 'Separado' : x.order.status,
        })),
        total,
        page: query.page,
        pageSize: size,
      };
    }
    if (!this.allowed(actor, 'purchaseRequests', 'purchaseOrders'))
      return { items: [], total: 0, restricted: true };
    const staff =
      actor.isSystemMaster ||
      actor.role === 'ADMIN' ||
      this.allowed(actor, 'purchaseRequests', 'purchaseOrders', 'analyze') ||
      (actor.accessPolicy?.catalog?.viewCosts === true &&
        (this.allowed(actor, 'purchaseQuotations', 'purchaseOrders', 'quote') ||
          this.allowed(
            actor,
            'purchasingApprovals',
            'purchaseOrders',
            'approve',
          )));
    const where: Prisma.ProcurementRequestItemWhereInput = {
      catalogItem: catalogWhere,
      fulfilledQty: { lt: this.db.procurementRequestItem.fields.quantity },
      request: {
        status: {
          in: [
            'AWAITING_ANALYSIS',
            'ANALYZED',
            'IN_QUOTATION',
            'PARTIALLY_FULFILLED',
          ],
        },
        ...(!staff ? { requesterId: actor.sub } : {}),
      },
      OR: [
        { allocations: { none: {} } },
        {
          allocations: {
            some: {
              OR: [{ warehouseId: loc.warehouseId }, { warehouseId: null }],
            },
          },
        },
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.procurementRequestItem.findMany({
        where,
        ...p,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          description: true,
          quantity: true,
          fulfilledQty: true,
          request: {
            select: { id: true, code: true, status: true, department: true },
          },
          allocations: {
            take: 1,
            select: { client: { select: clientSelect } },
          },
        },
      }),
      this.db.procurementRequestItem.count({ where }),
    ]);
    return {
      items: rows.map((x) => ({
        id: x.id,
        code: x.request.code,
        description: x.description,
        client:
          x.allocations[0]?.client?.tradeName ||
          x.allocations[0]?.client?.companyName ||
          x.request.department,
        quantity: Number(x.quantity) - Number(x.fulfilledQty),
        reserved: null,
        href: '/dashboard/purchase-orders/requests/' + x.request.id,
        status: x.request.status,
      })),
      total,
      page: query.page,
      pageSize: size,
    };
  }
  async labels(dto: LocationLabelsDto, actor: StockLocationActor) {
    this.check(actor);
    const ids = [...new Set(dto.locationIds)],
      rows = await this.db.warehouseLocation.findMany({
        where: {
          id: { in: ids },
          isActive: true,
          warehouse: { isActive: true },
        },
        include: {
          warehouse: { select: { code: true, name: true, qrBaseUrl: true } },
        },
      });
    if (rows.length !== ids.length)
      throw new NotFoundException(
        'Uma das posições não existe ou está inativa.',
      );
    return Promise.all(
      ids.map(async (id) => {
        const loc = rows.find((x) => x.id === id)!;
        const configured = qrBaseUrl(
            loc.warehouse.qrBaseUrl ||
              process.env.APP_BASE_URL ||
              'http://localhost:3001',
          ),
          base = dto.baseUrl ? qrBaseUrl(dto.baseUrl) : configured;
        if (
          base !== configured &&
          !this.allowed(actor, 'stockLocations', 'inventory', 'update')
        )
          throw new ForbiddenException(
            'Somente quem edita posições pode mudar o endereço das etiquetas.',
          );
        const url = base + '/dashboard/inventory/locations/' + id;
        return {
          id,
          code: loc.code,
          name: loc.name,
          warehouse: loc.warehouse.name,
          path: [loc.aisle, loc.shelf, loc.level, loc.compartment]
            .filter(Boolean)
            .join(' / '),
          url,
          loopback: isLoopbackUrl(base),
          qrDataUrl: await QRCode.toDataURL(url, { margin: 4, width: 512 }),
        };
      }),
    );
  }
  async qrAccess(
    id: string,
    dto: WarehouseQrAccessDto,
    actor: StockLocationActor,
  ) {
    this.check(actor, 'update');
    const baseUrl = qrBaseUrl(dto.baseUrl);
    return this.operation(actor, 'QR_ACCESS', id, dto, async (tx) => {
      const loc = await this.location(tx, id, true);
      if ((loc.warehouse.qrBaseUrl ?? '') !== dto.expectedBaseUrl)
        throw new ConflictException(
          'O endereço das etiquetas foi alterado por outra pessoa. Atualize a posição.',
        );
      await tx.warehouse.update({
        where: { id: loc.warehouseId },
        data: { qrBaseUrl: baseUrl },
      });
      return {
        before: { baseUrl: loc.warehouse.qrBaseUrl },
        after: { baseUrl },
        result: { baseUrl },
      };
    });
  }
}
