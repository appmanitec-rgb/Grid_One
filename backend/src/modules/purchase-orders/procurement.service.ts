import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, AuditDomain, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import {
  assertScreen,
  unrestricted,
  type RuleActor,
} from '../auth/rules/access-rules';
import {
  effectiveAccessPolicy,
  type AccessPolicy,
} from '../users/access-policy';
import {
  decimal as d,
  money,
  freightShares,
  offerNet,
} from './procurement-calculations';
import {
  AllocationDto,
  ApprovalRuleDto,
  InvitationDto,
  ProcurementActionDto,
  ProcurementInvoiceDto,
  ProcurementOfferDto,
  ProcurementQuoteDto,
  ProcurementReceiptDto,
  ProcurementRequestDto,
  SelectionDto,
} from './dto/procurement.dto';

export type PurchasingActor = RuleActor & {
  accessPolicy?: AccessPolicy;
  name?: string;
};
type SourceState = {
  quoteItem: {
    quote: { status: string };
    selection?: {
      orderItem?: { purchaseOrder: { status: string } } | null;
    } | null;
  };
};
const committedSource = (source: SourceState) =>
  source.quoteItem.quote.status !== 'CANCELED' &&
  source.quoteItem.selection?.orderItem?.purchaseOrder.status !== 'CANCELED';
type Tx = Prisma.TransactionClient;
const requestInclude = {
  requester: { select: { id: true, name: true } },
  items: {
    include: {
      catalogItem: { select: { id: true, name: true, sku: true, type: true } },
      allocations: true,
      quoteSources: {
        include: {
          quoteItem: {
            select: {
              id: true,
              quoteId: true,
              quote: { select: { id: true, code: true, status: true } },
            },
          },
        },
      },
    },
  },
} as const;
const quoteInclude = {
  items: {
    include: {
      sources: {
        include: {
          requestItem: {
            include: {
              request: true,
              allocations: true,
              catalogItem: {
                select: { id: true, name: true, sku: true, type: true },
              },
            },
          },
        },
      },
      selection: {
        include: {
          offerItem: { include: { offer: { include: { supplier: true } } } },
        },
      },
    },
  },
  invitations: { include: { supplier: true } },
  offers: {
    include: { supplier: true, items: true },
    orderBy: { createdAt: 'desc' },
  },
  orders: {
    select: {
      id: true,
      code: true,
      status: true,
      totalAmount: true,
      workflowVersion: true,
    },
  },
} as const;

@Injectable()
export class ProcurementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditLogsService,
    private readonly files: FileStorageService,
  ) {}

  async status() {
    try {
      return {
        enabled:
          (
            await this.db.procurementSettings.findUnique({
              where: { id: 'purchasing' },
            })
          )?.enabled ?? false,
        configured: true,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      )
        return { enabled: false, configured: false };
      throw error;
    }
  }
  async configure(enabled: boolean, actor: PurchasingActor) {
    this.allow(actor, 'purchasingSettings', 'configure');
    const before = await this.status();
    const result = await this.db.procurementSettings.upsert({
      where: { id: 'purchasing' },
      create: { id: 'purchasing', enabled, updatedById: actor.sub },
      update: { enabled, updatedById: actor.sub },
    });
    await this.event(
      this.db,
      'SETTINGS',
      'purchasing',
      'ACTIVATION_CHANGED',
      actor,
      before,
      result,
    );
    return result;
  }
  private async enabled() {
    if (!(await this.status()).enabled)
      throw new BadRequestException(
        'A nova experiência de compras ainda não foi ativada.',
      );
  }
  private allow(
    actor: PurchasingActor,
    screen: string,
    action?: keyof AccessPolicy['purchaseOrders'],
  ) {
    assertScreen(actor, screen, action);
    if (unrestricted(actor)) return;
    if (
      ['purchaseQuotations', 'purchasingApprovals', 'purchases'].includes(
        screen,
      ) &&
      !actor.accessPolicy?.catalog.viewCosts
    )
      throw new ForbiddenException(
        'Esta área exige permissão para consultar custos.',
      );

    if (!actor.accessPolicy?.purchaseOrders?.[action ?? 'view'])
      throw new ForbiddenException(
        'Seu perfil não permite esta operação de compras.',
      );
  }
  private async lock(tx: Tx, key: string) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'purchasing:' + key}))`,
    );
  }
  private event(
    tx: Tx,
    type: string,
    id: string,
    action: string,
    actor: PurchasingActor,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    const json = (value: unknown) =>
      value === undefined || value === null
        ? undefined
        : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
    return this.audit.record(
      {
        domain: AuditDomain.PURCHASE_ORDERS,
        entityType: 'PROCUREMENT_' + type,
        entityId: id,
        action,
        actorUserId: actor.sub,
        beforePayload: json(before),
        afterPayload: json(after),
        reason,
      },
      tx,
    );
  }
  private async code(tx: Tx, prefix: string) {
    await this.lock(tx, 'codes:' + prefix);
    const row =
      prefix === 'SC'
        ? await tx.procurementRequest.findFirst({
            orderBy: { code: 'desc' },
            select: { code: true },
          })
        : await tx.procurementQuote.findFirst({
            orderBy: { code: 'desc' },
            select: { code: true },
          });
    const next = Number(row?.code.split('-')[1] ?? 0) + 1;
    return prefix + '-' + String(next).padStart(9, '0');
  }
  private staff(actor: PurchasingActor) {
    if (unrestricted(actor)) return true;
    const grants: Array<[string, keyof AccessPolicy['purchaseOrders']]> = [
      ['purchaseRequests', 'analyze'],
      ['purchaseQuotations', 'quote'],
      ['purchasingApprovals', 'approve'],
    ];
    return grants.some(([screen, action]) => {
      try {
        this.allow(actor, screen, action);
        return true;
      } catch {
        return false;
      }
    });
  }
  private async requestAccess(
    id: string,
    actor: PurchasingActor,
    tx: Tx = this.db,
  ) {
    const request = await tx.procurementRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');
    if (!this.staff(actor) && request.requesterId !== actor.sub)
      throw new ForbiddenException(
        'Você só pode consultar suas próprias solicitações.',
      );
    return request;
  }
  private page(query: Record<string, string | undefined>) {
    const page = Number(query.page || 1),
      size = Number(query.pageSize || 20);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      ![20, 50, 100].includes(size)
    )
      throw new BadRequestException('Paginação inválida.');
    return { skip: (page - 1) * size, take: size, page, pageSize: size };
  }
  async requests(
    query: Record<string, string | undefined>,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchaseRequests');
    const p = this.page(query),
      q = (query.q || '').trim();
    const where: Prisma.ProcurementRequestWhereInput = {
      ...(!this.staff(actor) ? { requesterId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { justification: { contains: q, mode: 'insensitive' } },
              {
                items: {
                  some: { description: { contains: q, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.procurementRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true } },
          items: { select: { id: true, description: true }, take: 3 },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.db.procurementRequest.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
  async request(id: string, actor: PurchasingActor) {
    this.allow(actor, 'purchaseRequests');
    const result = await this.requestAccess(id, actor);
    const analysis = await Promise.all(
      result.items.map(async (item) => ({
        itemId: item.id,
        ...(await this.availability(
          item.catalogItemId,
          item.allocations.find((a) => a.warehouseId)?.warehouseId ?? undefined,
          item.id,
          actor,
        )),
      })),
    );
    return {
      ...result,
      analysis,
      history: await this.history('REQUEST', id),
      attachments: await this.attachments('REQUEST', id),
    };
  }
  private async validateAllocations(
    tx: Tx,
    allocations: AllocationDto[],
    actor: PurchasingActor,
  ) {
    const policy = actor.accessPolicy;
    for (const a of allocations) {
      if (a.origin === 'STOCK' && !a.warehouseId)
        throw new BadRequestException(
          'Reposição de estoque exige almoxarifado de destino.',
        );
      if (a.origin === 'ORDER' && (!a.orderId || !a.clientId || !a.generatorId))
        throw new BadRequestException(
          'Compra para O.S. exige cliente, ordem e equipamento.',
        );
      if (a.origin === 'CONTRACT' && !a.contractId)
        throw new BadRequestException('Informe o contrato da necessidade.');
      if (
        ['PARTS_SALE', 'GENERATOR_SALE'].includes(a.origin) &&
        !a.salesOrderId
      )
        throw new BadRequestException('Informe o pedido de venda.');
      if (a.origin === 'WARRANTY' && !a.warrantyId)
        throw new BadRequestException('Informe o processo de garantia.');
      if (!unrestricted(actor)) {
        if ((a.orderId || a.warrantyId) && !policy?.orders.view)
          throw new ForbiddenException(
            'Seu perfil não pode vincular ordens ou garantias.',
          );
        if (a.contractId && !policy?.contracts.view)
          throw new ForbiddenException(
            'Seu perfil não pode vincular contratos.',
          );
        if (a.clientId && !policy?.clients.view)
          throw new ForbiddenException(
            'Seu perfil não pode vincular clientes.',
          );
        if (a.generatorId && !policy?.equipments.view)
          throw new ForbiddenException(
            'Seu perfil não pode vincular equipamentos.',
          );
      }
      if (a.orderId) {
        const order = await tx.maintenanceOrder.findUnique({
          where: { id: a.orderId },
          include: {
            technician: { select: { userId: true } },
            generator: { select: { clientId: true } },
          },
        });
        if (
          !order ||
          order.generator.clientId !== a.clientId ||
          order.generatorId !== a.generatorId
        )
          throw new BadRequestException(
            'Cliente ou equipamento não corresponde à O.S.',
          );
        if (
          actor.role === 'TECHNICIAN' &&
          order.technician?.userId !== actor.sub
        )
          throw new ForbiddenException(
            'A O.S. não está atribuída a este técnico.',
          );
      }
      if (a.generatorId) {
        const generator = await tx.generator.findUnique({
          where: { id: a.generatorId },
          select: { clientId: true, serialNumber: true },
        });
        if (!generator || (a.clientId && generator.clientId !== a.clientId))
          throw new BadRequestException(
            'Equipamento incompatível com o cliente.',
          );
      }
      if (a.contractId) {
        const contract = await tx.serviceContract.findUnique({
          where: { id: a.contractId },
          select: { clientId: true },
        });
        if (!contract || (a.clientId && contract.clientId !== a.clientId))
          throw new BadRequestException('Contrato incompatível com o cliente.');
      }
      if (a.salesOrderId) {
        const sale = await tx.salesOrder.findUnique({
          where: { id: a.salesOrderId },
          select: { clientId: true },
        });
        if (!sale || (a.clientId && sale.clientId !== a.clientId))
          throw new BadRequestException(
            'Pedido de venda incompatível com o cliente.',
          );
      }
      if (a.warrantyId) {
        const warranty = await tx.warrantyCase.findUnique({
          where: { id: a.warrantyId },
          select: { clientId: true, generatorId: true },
        });
        if (
          !warranty ||
          (a.clientId && warranty.clientId !== a.clientId) ||
          (a.generatorId && warranty.generatorId !== a.generatorId)
        )
          throw new BadRequestException(
            'Garantia incompatível com a destinação informada.',
          );
      }
    }
  }
  async createRequest(
    dto: ProcurementRequestDto,
    actor: PurchasingActor,
    id?: string,
  ) {
    this.allow(actor, 'purchaseRequests', id ? 'update' : 'request');
    await this.enabled();
    if (!dto.justification.trim() || !dto.department.trim())
      throw new BadRequestException('Informe departamento e justificativa.');
    if (
      dto.priority === 'EMERGENCY' &&
      !unrestricted(actor) &&
      !actor.accessPolicy?.purchaseOrders.exception
    )
      throw new ForbiddenException(
        'Compras emergenciais exigem permissão específica.',
      );
    if (!this.staff(actor)) {
      const requester = await this.db.user.findUniqueOrThrow({
        where: { id: actor.sub },
        select: { department: true },
      });
      if (!requester.department || requester.department !== dto.department)
        throw new ForbiddenException(
          'Utilize o departamento cadastrado no seu perfil.',
        );
    }
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id ?? dto.requestKey);
        const prior = id
          ? await this.requestAccess(id, actor, tx)
          : await tx.procurementRequest.findUnique({
              where: { requestKey: dto.requestKey },
              include: requestInclude,
            });
        if (!id && prior) {
          if (prior.requesterId !== actor.sub)
            throw new ConflictException('Chave já utilizada.');
          return prior;
        }
        if (prior && !['DRAFT', 'REVISION'].includes(prior.status))
          throw new BadRequestException(
            'Revise a solicitação antes de editar.',
          );
        for (const item of dto.items) {
          if (!item.description.trim() || !item.unit.trim())
            throw new BadRequestException(
              'Informe descrição e unidade dos itens.',
            );
          if (
            !d(item.quantity).eq(
              item.allocations.reduce((s, a) => s.plus(a.quantity), d(0)),
            )
          )
            throw new BadRequestException(
              'A soma das destinações deve corresponder à quantidade do item.',
            );
          await this.validateAllocations(tx, item.allocations, actor);
        }
        if (prior) {
          if (
            await tx.procurementQuoteSource.count({
              where: { requestItem: { requestId: prior.id } },
            })
          )
            throw new BadRequestException(
              'Uma solicitação já cotada não pode ter seus itens substituídos. Crie uma necessidade complementar.',
            );
          await tx.procurementAllocation.deleteMany({
            where: { requestItem: { requestId: prior.id } },
          });
          await tx.procurementRequestItem.deleteMany({
            where: { requestId: prior.id },
          });
        }
        const data = {
          department: dto.department,
          origin: dto.origin,
          priority: dto.priority,
          justification: dto.justification,
          neededAt: dto.neededAt ? new Date(dto.neededAt) : null,
          notes: dto.notes,
          items: {
            create: dto.items.map((i) => ({
              ...i,
              neededAt:
                i.neededAt || dto.neededAt
                  ? new Date(i.neededAt || dto.neededAt!)
                  : null,
              allocations: {
                create: i.allocations.map((allocation, sortOrder) => ({
                  ...allocation,
                  sortOrder,
                })),
              },
            })),
          },
        };
        const result = prior
          ? await tx.procurementRequest.update({
              where: { id: prior.id },
              data: { ...data, revision: { increment: 1 } },
              include: requestInclude,
            })
          : await tx.procurementRequest.create({
              data: {
                ...data,
                code: await this.code(tx, 'SC'),
                requestKey: dto.requestKey,
                requesterId: actor.sub,
              },
              include: requestInclude,
            });
        await this.event(
          tx,
          'REQUEST',
          result.id,
          prior ? 'UPDATED' : 'CREATED',
          actor,
          prior,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  async requestAction(
    id: string,
    dto: ProcurementActionDto,
    actor: PurchasingActor,
  ) {
    this.allow(
      actor,
      'purchaseRequests',
      dto.action === 'ANALYZE'
        ? 'analyze'
        : dto.action === 'CANCEL'
          ? 'cancel'
          : 'request',
    );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      const req = await this.requestAccess(id, actor, tx);
      const transitions: Record<string, [string[], string]> = {
        SUBMIT: [['DRAFT', 'REVISION'], 'AWAITING_ANALYSIS'],
        ANALYZE: [['AWAITING_ANALYSIS'], 'ANALYZED'],
        REVISE: [['AWAITING_ANALYSIS', 'ANALYZED'], 'REVISION'],
        CANCEL: [
          ['DRAFT', 'REVISION', 'AWAITING_ANALYSIS', 'ANALYZED'],
          'CANCELED',
        ],
      };
      const t = transitions[dto.action];
      if (!t || !t[0].includes(req.status))
        throw new BadRequestException('Transição inválida para a solicitação.');
      if (['REVISE', 'CANCEL'].includes(dto.action) && !dto.reason?.trim())
        throw new BadRequestException('Informe o motivo.');
      const result = await tx.procurementRequest.update({
        where: { id },
        data: { status: t[1] },
      });
      await this.event(
        tx,
        'REQUEST',
        id,
        dto.action,
        actor,
        req,
        result,
        dto.reason,
      );
      return result;
    });
  }
  async availability(
    catalogItemId: string | null,
    warehouseId?: string,
    excludeItemId?: string,
    actor?: PurchasingActor,
  ) {
    if (!catalogItemId)
      return {
        physicalQty: 0,
        reservedQty: 0,
        availableQty: 0,
        inboundQty: 0,
        duplicates: [],
        descriptive: true,
      };
    const [balances, pending, duplicates] = await Promise.all([
      this.db.inventoryBalance.findMany({
        where: { catalogItemId, ...(warehouseId ? { warehouseId } : {}) },
      }),
      this.db.purchaseOrderItem.findMany({
        where: {
          catalogItemId,
          fulfillmentMode: 'WAREHOUSE',
          purchaseOrder: {
            status: { in: ['APPROVED', 'PARTIALLY_RECEIVED', 'SENT'] },
          },
        },
        include: {
          procurementSelection: {
            include: {
              quoteItem: {
                include: {
                  sources: {
                    include: {
                      requestItem: { include: { allocations: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.procurementRequestItem.findMany({
        where: {
          catalogItemId,
          ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
          request: {
            status: { notIn: ['DRAFT', 'CANCELED', 'FULFILLED'] },
            ...(actor && !this.staff(actor) ? { requesterId: actor.sub } : {}),
          },
        },
        include: {
          request: { select: { id: true, code: true, status: true } },
          allocations: true,
        },
        take: 10,
      }),
    ]);
    const physicalQty = balances.reduce((s, b) => s + Number(b.physicalQty), 0),
      reservedQty = balances.reduce((s, b) => s + Number(b.reservedQty), 0);
    let unassignedInboundQty = 0;
    const inboundQty = pending.reduce((sum, item) => {
      const qty = Math.max(0, item.quantity - item.receivedQty);
      if (!warehouseId) return sum + qty;
      const sources = item.procurementSelection?.quoteItem.sources ?? [];
      if (!sources.length) {
        unassignedInboundQty += qty;
        return sum;
      }
      const localPending = sources.reduce((subtotal, source) => {
        const outstanding = source.requestItem.allocations.map((a) => ({
          ...a,
          pending: Math.max(0, Number(a.quantity) - Number(a.fulfilledQty)),
        }));
        const all = outstanding.reduce((n, a) => n + a.pending, 0);
        const local = outstanding
          .filter((a) => a.warehouseId === warehouseId)
          .reduce((n, a) => n + a.pending, 0);
        const remainingSource = Math.max(
          0,
          Number(source.quantity) - Number(source.fulfilledQty),
        );
        return (
          subtotal + (all ? (Math.min(remainingSource, all) * local) / all : 0)
        );
      }, 0);
      return sum + Math.min(qty, localPending);
    }, 0);
    return {
      physicalQty,
      reservedQty,
      availableQty: physicalQty - reservedQty,
      minQty: balances.reduce((s, b) => s + Number(b.minQty), 0),
      inboundQty,
      unassignedInboundQty,
      projectedQty: physicalQty - reservedQty + inboundQty,
      duplicates,
    };
  }
  async quotes(
    query: Record<string, string | undefined>,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchaseQuotations');
    const p = this.page(query),
      q = (query.q || '').trim();
    const where: Prisma.ProcurementQuoteWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.procurementQuote.findMany({
        where,
        include: {
          _count: { select: { items: true, invitations: true } },
          orders: { select: { id: true, code: true } },
        },
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.procurementQuote.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
  async quote(id: string, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations');
    const quote = await this.db.procurementQuote.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!quote) throw new NotFoundException('Cotação não encontrada.');
    const approvals = await this.db.approvalRequest.findMany({
      where: { type: 'PURCHASE_QUOTATION', entityId: id },
      include: { approverUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const offerAttachments = await this.db.procurementAttachment.findMany({
      where: {
        entityType: 'OFFER',
        entityId: { in: quote.offers.map((o) => o.id) },
      },
      select: {
        id: true,
        entityId: true,
        fileName: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
      },
    });
    return {
      ...quote,
      offers: quote.offers.map((offer) => ({
        ...offer,
        attachments: offerAttachments.filter((a) => a.entityId === offer.id),
      })),
      approvals,
      selectedPricing: this.prices(quote),
      history: await this.history('QUOTE', id),
      attachments: await this.attachments('QUOTE', id),
    };
  }
  async createQuote(dto: ProcurementQuoteDto, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations', 'quote');
    await this.enabled();
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, dto.requestKey);
        const existing = await tx.procurementQuote.findUnique({
          where: { requestKey: dto.requestKey },
          include: quoteInclude,
        });
        if (existing) {
          if (existing.createdById !== actor.sub)
            throw new ConflictException('Chave já utilizada.');
          return existing;
        }
        const ids = dto.groups.flatMap((g) =>
          g.sources.map((s) => s.requestItemId),
        );
        if (new Set(ids).size !== ids.length)
          throw new BadRequestException(
            'Um item da solicitação foi repetido na cotação.',
          );
        for (const itemId of [...ids].sort())
          await this.lock(tx, 'request-item:' + itemId);
        const items = await tx.procurementRequestItem.findMany({
          where: { id: { in: ids } },
          include: {
            request: true,
            quoteSources: {
              include: {
                quoteItem: {
                  include: {
                    quote: true,
                    selection: {
                      include: {
                        orderItem: {
                          include: {
                            purchaseOrder: { select: { status: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (items.length !== ids.length)
          throw new BadRequestException('Item de solicitação não encontrado.');
        for (const group of dto.groups) {
          const sourceItems = group.sources.map(
            (s) => items.find((i) => i.id === s.requestItemId)!,
          );
          const first = sourceItems[0];
          for (const [index, item] of sourceItems.entries()) {
            if (
              !['ANALYZED', 'IN_QUOTATION', 'PARTIALLY_FULFILLED'].includes(
                item.request.status,
              )
            )
              throw new BadRequestException(
                'Suprimentos precisa analisar a solicitação antes da cotação.',
              );
            if (
              item.catalogItemId !== first.catalogItemId ||
              item.description !== first.description ||
              item.specification !== first.specification ||
              item.unit !== first.unit ||
              String(item.neededAt) !== String(first.neededAt)
            )
              throw new BadRequestException(
                'Agrupe somente itens com especificações, unidades e prazos compatíveis.',
              );
            const committed = item.quoteSources
              .filter(committedSource)
              .reduce((sum, s) => sum.plus(s.quantity), d(0));
            if (
              d(group.sources[index].quantity).gt(
                d(item.quantity).minus(committed),
              )
            )
              throw new BadRequestException(
                'Quantidade já incluída em outra cotação ativa.',
              );
          }
        }
        const result = await tx.procurementQuote.create({
          data: {
            code: await this.code(tx, 'CQ'),
            requestKey: dto.requestKey,
            title: dto.title,
            notes: dto.notes,
            createdById: actor.sub,
            items: {
              create: dto.groups.map((group) => {
                const first = items.find(
                  (i) => i.id === group.sources[0].requestItemId,
                )!;
                return {
                  description: first.description,
                  specification: first.specification,
                  unit: first.unit,
                  neededAt: first.neededAt,
                  quantity: group.sources.reduce(
                    (sum, s) => sum.plus(s.quantity),
                    d(0),
                  ),
                  sources: { create: group.sources },
                };
              }),
            },
            invitations: {
              create: [...new Set(dto.supplierIds)].map((supplierId) => ({
                supplierId,
              })),
            },
          },
          include: quoteInclude,
        });
        await tx.procurementRequest.updateMany({
          where: { id: { in: items.map((i) => i.requestId) } },
          data: { status: 'IN_QUOTATION' },
        });
        await this.event(
          tx,
          'QUOTE',
          result.id,
          'CREATED',
          actor,
          null,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }

  private async mutableQuote(tx: Tx, id: string) {
    const quote = await tx.procurementQuote.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!quote) throw new NotFoundException('Cotação não encontrada.');
    if (
      !['PREPARATION', 'CONSULTING', 'OFFERS_RECEIVED', 'REVISION'].includes(
        quote.status,
      )
    )
      throw new BadRequestException(
        'Abra uma revisão antes de alterar propostas ou condições aprovadas.',
      );
    return quote;
  }
  async invitation(id: string, dto: InvitationDto, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations', 'quote');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      const quote = await this.mutableQuote(tx, id);
      const result = await tx.procurementInvitation.upsert({
        where: {
          quoteId_supplierId_round: {
            quoteId: id,
            supplierId: dto.supplierId,
            round: quote.round,
          },
        },
        create: {
          quoteId: id,
          supplierId: dto.supplierId,
          round: quote.round,
          status: dto.status,
          notes: dto.notes,
        },
        update: { status: dto.status, notes: dto.notes },
      });
      await tx.procurementSelection.deleteMany({
        where: {
          quoteItem: { quoteId: id },
          offerItem: {
            offer: {
              quoteId: id,
              supplierId: dto.supplierId,
              round: quote.round,
            },
          },
        },
      });
      await this.event(
        tx,
        'QUOTE',
        id,
        'INVITATION_CHANGED',
        actor,
        null,
        result,
      );
      return result;
    });
  }
  async offer(id: string, dto: ProcurementOfferDto, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations', 'quote');
    if (new Date(dto.validUntil).getTime() <= Date.now())
      throw new BadRequestException('Informe uma validade futura.');
    if (!dto.paymentTerm.trim())
      throw new BadRequestException('Informe a condição de pagamento.');
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const quote = await this.mutableQuote(tx, id);
        const invitation = quote.invitations.find(
          (i) => i.supplierId === dto.supplierId && i.round === quote.round,
        );
        if (!invitation || invitation.status === 'REMOVED')
          throw new BadRequestException(
            'Inclua este fornecedor na rodada de cotação.',
          );
        if (
          new Set(dto.items.map((i) => i.quoteItemId)).size !== dto.items.length
        )
          throw new BadRequestException('Itens repetidos na proposta.');
        for (const item of dto.items) {
          const requested = quote.items.find((i) => i.id === item.quoteItemId);
          if (!requested || requested.unit !== item.unit)
            throw new BadRequestException(
              'Item ou unidade incompatível com a cotação.',
            );
          if (item.compatibility !== 'PENDING' && !item.technicalReason?.trim())
            throw new BadRequestException(
              'Registre a justificativa da análise técnica.',
            );
        }
        const net = dto.items.map((i) =>
          offerNet(i.quantity, i.unitPrice, i.discountPercent),
        );
        const shares = freightShares(
          dto.freightAmount,
          dto.freightAllocation === 'QUANTITY'
            ? dto.items.map((i) => d(i.quantity))
            : net,
        );
        const version =
          Math.max(
            0,
            ...quote.offers
              .filter(
                (o) =>
                  o.supplierId === dto.supplierId && o.round === quote.round,
              )
              .map((o) => o.version),
          ) + 1;
        const { items, ...header } = dto;
        const result = await tx.procurementOffer.create({
          data: {
            ...header,
            expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
            quoteId: id,
            round: quote.round,
            version,
            validUntil: new Date(dto.validUntil),
            createdById: actor.sub,
            items: {
              create: items.map((i, index) => ({
                ...i,
                freightShare: shares[index],
                totalAmount: money(
                  net[index]
                    .plus(i.taxAmount)
                    .plus(i.otherExpenses)
                    .plus(shares[index]),
                ),
              })),
            },
          },
          include: { items: true, supplier: true },
        });
        const old = quote.offers
          .filter((o) => o.supplierId === dto.supplierId)
          .flatMap((o) => o.items.map((i) => i.id));
        if (old.length)
          await tx.procurementSelection.deleteMany({
            where: { offerItemId: { in: old } },
          });
        await tx.procurementInvitation.update({
          where: { id: invitation.id },
          data: { status: 'RESPONDED' },
        });
        await tx.procurementQuote.update({
          where: { id },
          data: { status: 'OFFERS_RECEIVED', revision: { increment: 1 } },
        });
        await this.event(
          tx,
          'QUOTE',
          id,
          'OFFER_VERSION_RECORDED',
          actor,
          null,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  async select(id: string, dto: SelectionDto, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations', 'selectOffer');
    if (!dto.justification.trim())
      throw new BadRequestException('Justifique a escolha comercial.');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      const quote = await this.mutableQuote(tx, id);
      const item = quote.items.find((i) => i.id === dto.quoteItemId);
      const offer = quote.offers.find((o) =>
        o.items.some((i) => i.id === dto.offerItemId),
      );
      const line = offer?.items.find((i) => i.id === dto.offerItemId);
      if (!item || !offer || !line || line.quoteItemId !== item.id)
        throw new BadRequestException('Proposta não pertence a este item.');
      this.validateOffer(quote, offer, line, item.quantity);
      if (line.compatibility !== 'APPROVED') {
        this.allow(actor, 'purchaseQuotations', 'exception');
        if (!dto.exceptionReason?.trim())
          throw new BadRequestException(
            'A exceção técnica exige justificativa explícita.',
          );
      }
      const catalogId =
        line.catalogItemId ?? item.sources[0]?.requestItem.catalogItemId;
      if (!catalogId)
        throw new BadRequestException(
          'Cadastre o item no catálogo e vincule-o à proposta antes de selecionar.',
        );
      const catalog = await tx.catalogItem.findUniqueOrThrow({
        where: { id: catalogId },
        select: { type: true },
      });
      if (catalog.type === 'SERVICE' && dto.fulfillmentMode !== 'SERVICE')
        throw new BadRequestException(
          'Serviços devem utilizar aceite de serviço, sem movimentação física.',
        );
      if (catalog.type !== 'SERVICE' && dto.fulfillmentMode === 'SERVICE')
        throw new BadRequestException(
          'Material físico não pode ser recebido como serviço.',
        );
      if (
        dto.fulfillmentMode === 'DIRECT' &&
        item.sources.some((s) =>
          s.requestItem.allocations.some((a) => !a.clientId),
        )
      )
        throw new BadRequestException(
          'Entrega direta exige cliente na destinação de todos os itens.',
        );
      const before = await tx.procurementSelection.findUnique({
        where: { quoteItemId: item.id },
      });
      const result = await tx.procurementSelection.upsert({
        where: { quoteItemId: item.id },
        create: { ...dto, selectedById: actor.sub },
        update: { ...dto, selectedById: actor.sub, selectedAt: new Date() },
      });
      await this.event(
        tx,
        'QUOTE',
        id,
        'PROPOSAL_SELECTED',
        actor,
        before,
        result,
        dto.justification,
      );
      return result;
    });
  }
  private validateOffer(
    quote: {
      round: number;
      invitations: Array<{ supplierId: string; round: number; status: string }>;
      offers: Array<{
        id: string;
        supplierId: string;
        round: number;
        version: number;
      }>;
    },
    offer: {
      id: string;
      supplierId: string;
      round: number;
      version: number;
      validUntil: Date;
    },
    line: { quantity: Prisma.Decimal; available: boolean },
    quantity: Prisma.Decimal,
  ) {
    if (
      !quote.invitations.some(
        (invite) =>
          invite.supplierId === offer.supplierId &&
          invite.round === quote.round &&
          invite.status === 'RESPONDED',
      )
    )
      throw new BadRequestException(
        'O fornecedor não possui proposta ativa nesta rodada.',
      );
    const last = Math.max(
      ...quote.offers
        .filter(
          (o) => o.supplierId === offer.supplierId && o.round === quote.round,
        )
        .map((o) => o.version),
    );
    if (offer.round !== quote.round || offer.version !== last)
      throw new BadRequestException(
        'Utilize a versão mais recente da rodada atual.',
      );
    if (offer.validUntil.getTime() <= Date.now())
      throw new BadRequestException(
        'Proposta vencida. Solicite uma nova versão.',
      );
    if (!line.available || !line.quantity.eq(quantity))
      throw new BadRequestException(
        'A proposta deve atender à quantidade completa do item selecionado.',
      );
  }
  private prices(
    quote: Awaited<ReturnType<ProcurementService['mutableQuote']>>,
  ) {
    const selected = quote.items
      .map((item) => ({ item, selection: item.selection }))
      .filter((row) => row.selection !== null);
    const groups = new Map<string, typeof selected>();
    for (const row of selected) {
      const offerId = row.selection!.offerItem.offerId;
      groups.set(offerId, [...(groups.get(offerId) ?? []), row]);
    }
    const result: Array<{
      quoteItemId: string;
      offerItemId: string;
      net: string;
      freight: string;
      tax: string;
      other: string;
      total: string;
    }> = [];
    for (const rows of groups.values()) {
      const offer = rows[0].selection!.offerItem.offer;
      const nets = rows.map((r) =>
        offerNet(
          r.item.quantity,
          r.selection!.offerItem.unitPrice,
          r.selection!.offerItem.discountPercent,
        ),
      );
      const freight = freightShares(
        offer.freightAmount,
        offer.freightAllocation === 'QUANTITY'
          ? rows.map((r) => r.item.quantity)
          : nets,
      );
      rows.forEach((r, index) => {
        const line = r.selection!.offerItem;
        result.push({
          quoteItemId: r.item.id,
          offerItemId: line.id,
          net: nets[index].toFixed(2),
          freight: freight[index].toFixed(2),
          tax: money(line.taxAmount).toFixed(2),
          other: money(line.otherExpenses).toFixed(2),
          total: money(
            nets[index]
              .plus(freight[index])
              .plus(line.taxAmount)
              .plus(line.otherExpenses),
          ).toFixed(2),
        });
      });
    }
    return result;
  }
  async rules(actor: PurchasingActor) {
    this.allow(actor, 'purchasingSettings');
    return this.db.procurementApprovalRule.findMany({
      orderBy: { minAmount: 'asc' },
    });
  }
  async saveRule(dto: ApprovalRuleDto, actor: PurchasingActor, id?: string) {
    this.allow(actor, 'purchasingSettings', 'configure');
    if (dto.maxAmount !== undefined && dto.maxAmount < dto.minAmount)
      throw new BadRequestException('Limite máximo inferior ao mínimo.');
    const user = await this.db.user.findUnique({
      where: { id: dto.approverUserId },
    });
    if (!user || !user.isActive)
      throw new BadRequestException('Aprovador inválido.');
    const candidate: PurchasingActor = {
      sub: user.id,
      role: user.role,
      isSystemMaster: user.isSystemMaster,
      accessPolicy: effectiveAccessPolicy(user.role, user.accessPolicy),
      accessRules: user.accessRules,
    };
    this.allow(candidate, 'purchasingApprovals', 'approve');
    return this.db.$transaction(async (tx) => {
      const before = id
        ? await tx.procurementApprovalRule.findUnique({ where: { id } })
        : null;
      const result = id
        ? await tx.procurementApprovalRule.update({ where: { id }, data: dto })
        : await tx.procurementApprovalRule.create({ data: dto });
      await this.event(
        tx,
        'RULE',
        result.id,
        'RULE_SAVED',
        actor,
        before,
        result,
      );
      return result;
    });
  }
  async quoteAction(
    id: string,
    dto: ProcurementActionDto,
    actor: PurchasingActor,
  ) {
    const action =
      dto.action === 'GENERATE'
        ? 'generate'
        : dto.action === 'CANCEL'
          ? 'cancel'
          : 'quote';
    this.allow(actor, 'purchaseQuotations', action);
    if (dto.action === 'GENERATE') return this.generateOrders(id, actor);
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const quote = await tx.procurementQuote.findUnique({
          where: { id },
          include: quoteInclude,
        });
        if (!quote) throw new NotFoundException('Cotação não encontrada.');
        let status = quote.status;
        if (dto.action === 'OPEN') {
          if (!['PREPARATION', 'REVISION'].includes(status))
            throw new BadRequestException('A cotação já foi aberta.');
          status = 'CONSULTING';
        } else if (['REVISE', 'NEW_ROUND', 'CANCEL'].includes(dto.action)) {
          if (quote.orders.length || status === 'CANCELED')
            throw new BadRequestException(
              'Cotação com pedidos gerados não pode ser alterada ou cancelada.',
            );
          if (!dto.reason?.trim())
            throw new BadRequestException('Informe a justificativa.');
          status = dto.action === 'CANCEL' ? 'CANCELED' : 'REVISION';
          await tx.approvalRequest.updateMany({
            where: {
              type: 'PURCHASE_QUOTATION',
              entityId: id,
              status: 'PENDING',
            },
            data: {
              status: 'ADJUSTMENTS_REQUESTED',
              decidedAt: new Date(),
              decisionNote: dto.reason,
            },
          });
          await tx.procurementSelection.deleteMany({
            where: { quoteItem: { quoteId: id } },
          });
          if (dto.action === 'NEW_ROUND')
            await tx.procurementQuote.update({
              where: { id },
              data: { round: { increment: 1 } },
            });
        } else if (dto.action === 'SUBMIT') {
          await this.mutableQuote(tx, id);
          if (quote.items.some((i) => !i.selection))
            throw new BadRequestException(
              'Selecione uma proposta para cada item.',
            );
          for (const item of quote.items) {
            const line = item.selection!.offerItem;
            this.validateOffer(quote, line.offer, line, item.quantity);
            if (
              line.compatibility !== 'APPROVED' &&
              !item.selection!.exceptionReason
            )
              throw new BadRequestException(
                'Proposta incompatível sem exceção documentada.',
              );
          }
          const prices = this.prices(quote),
            total = prices.reduce((sum, p) => sum.plus(p.total), d(0));

          const selectedCatalogIds = [
            ...new Set(
              quote.items
                .map((i) => i.selection!.offerItem.catalogItemId)
                .filter((id): id is string => Boolean(id)),
            ),
          ];
          const boughtTypes = new Map(
            (
              await tx.catalogItem.findMany({
                where: { id: { in: selectedCatalogIds } },
                select: { id: true, type: true },
              })
            ).map((i) => [i.id, i.type]),
          );
          const contexts = quote.items.flatMap((item) =>
            item.sources.flatMap((source) =>
              source.requestItem.allocations.map((allocation) => ({
                department: source.requestItem.request.department,
                priority: source.requestItem.request.priority,
                origin: allocation.origin,
                costCenterId: allocation.costCenterId,
                itemType:
                  boughtTypes.get(
                    item.selection!.offerItem.catalogItemId ?? '',
                  ) ?? source.requestItem.catalogItem?.type,
              })),
            ),
          );
          const configured = await tx.procurementApprovalRule.findMany({
            where: { active: true },
          });

          const covers = (
            rule: (typeof configured)[number],
            context: (typeof contexts)[number],
          ) =>
            total.gte(rule.minAmount) &&
            (!rule.maxAmount || total.lte(rule.maxAmount)) &&
            (!rule.department || context.department === rule.department) &&
            (!rule.priority || context.priority === rule.priority) &&
            (!rule.origin || context.origin === rule.origin) &&
            (!rule.costCenterId ||
              context.costCenterId === rule.costCenterId) &&
            (!rule.itemType || context.itemType === rule.itemType);
          const matched = configured.filter((rule) =>
            contexts.some((context) => covers(rule, context)),
          );
          const needsAdministrator = contexts.some(
            (context) => !matched.some((rule) => covers(rule, context)),
          );
          const minimum = Math.max(1, ...matched.map((r) => r.minimumOffers));
          for (const item of quote.items) {
            const latest = quote.offers.filter(
              (o) =>
                o.round === quote.round &&
                quote.invitations.some(
                  (i) =>
                    i.supplierId === o.supplierId &&
                    i.round === quote.round &&
                    i.status === 'RESPONDED',
                ) &&
                !quote.offers.some(
                  (other) =>
                    other.supplierId === o.supplierId &&
                    other.round === o.round &&
                    other.version > o.version,
                ),
            );
            const eligible = latest.filter(
              (o) =>
                o.validUntil.getTime() > Date.now() &&
                o.items.some(
                  (l) =>
                    l.quoteItemId === item.id &&
                    l.available &&
                    l.compatibility === 'APPROVED' &&
                    l.quantity.eq(item.quantity),
                ),
            );
            if (eligible.length < minimum) {
              this.allow(actor, 'purchaseQuotations', 'exception');
              if (!dto.reason?.trim())
                throw new BadRequestException(
                  'Justifique fornecedor exclusivo, emergência ou propostas insuficientes.',
                );
            }
          }
          const fallback = await tx.user.findFirst({
            where: { role: 'ADMIN', isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          const approvers = [
            ...new Set([
              ...matched.map((rule) => rule.approverUserId),
              ...(needsAdministrator || !matched.length
                ? [fallback?.id].filter((id): id is string => Boolean(id))
                : []),
            ]),
          ];
          if (!approvers.length)
            throw new BadRequestException(
              'Cadastre um aprovador ativo para esta compra.',
            );
          const snapshot = JSON.parse(
            JSON.stringify({
              quoteCode: quote.code,
              title: quote.title,
              revision: quote.revision,
              round: quote.round,
              total: total.toFixed(2),
              prices,
              selections: quote.items.map((i) => i.selection),
              rules: matched,
              exceptionReason: dto.reason ?? null,
            }),
          ) as Prisma.InputJsonValue;
          for (const userId of approvers) {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user?.isActive)
              throw new BadRequestException(
                'Aprovador indisponível. Revise as regras.',
              );
            this.allow(
              {
                sub: user.id,
                role: user.role,
                isSystemMaster: user.isSystemMaster,
                accessPolicy: effectiveAccessPolicy(
                  user.role,
                  user.accessPolicy,
                ),
                accessRules: user.accessRules,
              },
              'purchasingApprovals',
              'approve',
            );
            await tx.approvalRequest.create({
              data: {
                type: 'PURCHASE_QUOTATION',
                entityType: 'PROCUREMENT_QUOTE',
                entityId: id,
                requesterUserId: actor.sub,
                approverUserId: userId,
                requestNote: dto.reason,
                requestPayload: snapshot,
              },
            });
          }
          await tx.procurementQuote.update({
            where: { id },
            data: { approvalSnapshot: snapshot, exceptionReason: dto.reason },
          });
          status = 'AWAITING_APPROVAL';
        } else throw new BadRequestException('Ação inválida para a cotação.');
        const result = await tx.procurementQuote.update({
          where: { id },
          data: {
            status,
            ...(['REVISION', 'CANCELED'].includes(status)
              ? {
                  approvedAt: null,
                  approvalSnapshot: Prisma.DbNull,
                  revision: { increment: 1 },
                }
              : {}),
          },
        });
        await this.event(
          tx,
          'QUOTE',
          id,
          dto.action,
          actor,
          quote,
          result,
          dto.reason,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  async approvals(actor: PurchasingActor) {
    this.allow(actor, 'purchasingApprovals');
    return this.db.approvalRequest.findMany({
      where: {
        type: 'PURCHASE_QUOTATION',
        ...(unrestricted(actor) ? {} : { approverUserId: actor.sub }),
      },
      include: {
        requesterUser: { select: { name: true } },
        approverUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async decide(
    approvalId: string,
    actor: PurchasingActor,
    status: ApprovalStatus,
    reason?: string,
  ) {
    this.allow(actor, 'purchasingApprovals', 'approve');
    if (status !== 'APPROVED' && !reason?.trim())
      throw new BadRequestException('Informe a justificativa da decisão.');
    const current = await this.db.approvalRequest.findUnique({
      where: { id: approvalId },
    });
    if (!current || current.type !== 'PURCHASE_QUOTATION')
      throw new NotFoundException('Aprovação de compra não encontrada.');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, current.entityId);
      const approval = await tx.approvalRequest.findUniqueOrThrow({
        where: { id: approvalId },
      });
      if (approval.status !== 'PENDING')
        throw new BadRequestException('Esta aprovação já foi decidida.');
      if (!unrestricted(actor) && approval.approverUserId !== actor.sub)
        throw new ForbiddenException(
          'Apenas o aprovador designado pode decidir.',
        );
      const quote = await tx.procurementQuote.findUniqueOrThrow({
        where: { id: approval.entityId },
      });
      if (quote.status !== 'AWAITING_APPROVAL')
        throw new BadRequestException('Cotação não está aguardando aprovação.');
      const result = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status, decisionNote: reason, decidedAt: new Date() },
      });
      const others = await tx.approvalRequest.findMany({
        where: {
          entityId: quote.id,
          type: 'PURCHASE_QUOTATION',
          status: 'PENDING',
        },
      });
      let next = 'AWAITING_APPROVAL';
      if (status === 'REJECTED' || status === 'ADJUSTMENTS_REQUESTED') {
        next = status === 'REJECTED' ? 'REJECTED' : 'REVISION';
        await tx.approvalRequest.updateMany({
          where: {
            entityId: quote.id,
            type: 'PURCHASE_QUOTATION',
            status: 'PENDING',
          },
          data: {
            status: 'ADJUSTMENTS_REQUESTED',
            decidedAt: new Date(),
            decisionNote: 'Cotação devolvida para revisão.',
          },
        });
      } else if (!others.length) next = 'APPROVED';
      await tx.procurementQuote.update({
        where: { id: quote.id },
        data: {
          status: next,
          ...(next === 'APPROVED' ? { approvedAt: new Date() } : {}),
        },
      });
      await this.event(
        tx,
        'QUOTE',
        quote.id,
        'APPROVAL_' + status,
        actor,
        approval,
        result,
        reason,
      );
      return result;
    });
  }
  async generateOrders(id: string, actor: PurchasingActor) {
    this.allow(actor, 'purchaseQuotations', 'generate');
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const quote = await tx.procurementQuote.findUnique({
          where: { id },
          include: quoteInclude,
        });
        if (!quote) throw new NotFoundException('Cotação não encontrada.');
        if (quote.status === 'ORDERED') return quote.orders;
        if (quote.status !== 'APPROVED' || !quote.approvalSnapshot)
          throw new BadRequestException('A cotação precisa estar aprovada.');
        const snapshot = quote.approvalSnapshot as {
          revision: number;
          prices: ReturnType<ProcurementService['prices']>;
        };
        if (snapshot.revision !== quote.revision)
          throw new BadRequestException(
            'As condições foram alteradas. Solicite nova aprovação.',
          );
        const groups = new Map<string, typeof quote.items>();
        for (const item of quote.items) {
          if (!item.selection)
            throw new BadRequestException('Seleção aprovada ausente.');
          const offer = item.selection.offerItem.offer;
          this.validateOffer(
            quote,
            offer,
            item.selection.offerItem,
            item.quantity,
          );
          const key = JSON.stringify([
            offer.supplierId,
            offer.paymentTerm,
            offer.expectedAt,
            offer.deliveryDays,
            offer.warranty,
          ]);
          groups.set(key, [...(groups.get(key) ?? []), item]);
        }
        const generated: Prisma.PurchaseOrderGetPayload<{
          include: { items: true; commitment: true };
        }>[] = [];
        await this.lock(tx, 'po-code');
        let number = 0;
        for (const [key, items] of [...groups.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const offer = items[0].selection!.offerItem.offer;
          const prices = items.map(
            (i) => snapshot.prices.find((p) => p.quoteItemId === i.id)!,
          );
          if (prices.some((p) => !p))
            throw new BadRequestException('Valores aprovados incompletos.');
          const sum = (field: 'net' | 'tax' | 'freight' | 'other' | 'total') =>
            money(prices.reduce((s, p) => s.plus(p[field]), d(0))).toNumber();
          const order = await tx.purchaseOrder.create({
            data: {
              code:
                'PO-' +
                quote.code.replace('CQ-', '') +
                '-' +
                String(++number).padStart(2, '0'),
              workflowVersion: 2,
              status: 'APPROVED',
              procurementQuoteId: id,
              generationKey: createHash('sha256')
                .update(id + '|' + quote.revision + '|' + key)
                .digest('hex'),
              supplierId: offer.supplierId,
              paymentTerm: offer.paymentTerm,
              expectedDate:
                offer.expectedAt ??
                new Date(Date.now() + offer.deliveryDays * 86400000),
              approvedAt: quote.approvedAt,
              totalProductsAmount: sum('net'),
              taxAmount: sum('tax'),
              freightAmount: sum('freight'),
              otherExpenses: sum('other'),
              totalAmount: sum('total'),
              notes: 'Gerado da cotação ' + quote.code,
              items: {
                create: items.map((item, index) => {
                  const line = item.selection!.offerItem;
                  return {
                    catalogItemId:
                      line.catalogItemId ??
                      item.sources[0].requestItem.catalogItemId!,
                    quantity: item.quantity.toNumber(),
                    unitPrice: d(prices[index].net)
                      .div(item.quantity)
                      .toNumber(),
                    taxAmount: d(prices[index].tax).toNumber(),
                    totalPrice: d(prices[index].net).toNumber(),
                    landedUnitCost: d(prices[index].total).div(item.quantity),
                    procurementSelectionId: item.selection!.id,
                    fulfillmentMode: item.selection!.fulfillmentMode,
                  };
                }),
              },
              commitment: { create: { amount: sum('total') } },
            },
            include: { items: true, commitment: true },
          });
          await this.event(
            tx,
            'ORDER',
            order.id,
            'GENERATED_FROM_APPROVED_QUOTE',
            actor,
            null,
            order,
          );
          generated.push(order);
        }
        await tx.procurementQuote.update({
          where: { id },
          data: { status: 'ORDERED' },
        });
        await this.event(
          tx,
          'QUOTE',
          id,
          'ORDERS_GENERATED',
          actor,
          null,
          generated.map((o) => ({ id: o.id, code: o.code })),
        );
        return generated;
      },
      { timeout: 30000 },
    );
  }

  async order(id: string, actor: PurchasingActor) {
    this.allow(actor, 'purchases');
    const result = await this.db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            catalogItem: true,
            procurementSelection: {
              include: {
                offerItem: { include: { offer: true } },
                quoteItem: {
                  include: {
                    sources: {
                      include: {
                        requestItem: {
                          include: { request: true, allocations: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        receipts: {
          include: { warehouse: true },
          orderBy: { receivedAt: 'desc' },
        },
        procurementReceipts: {
          include: { items: true, warehouse: true },
          orderBy: { receivedAt: 'desc' },
        },
        procurementQuote: { select: { id: true, code: true, status: true } },
        commitment: true,
        procurementInvoices: {
          include: {
            installments: {
              include: {
                payable: {
                  select: {
                    id: true,
                    amount: true,
                    paidAmount: true,
                    status: true,
                    dueDate: true,
                  },
                },
              },
            },
          },
        },
        payableEntries: {
          select: {
            id: true,
            amount: true,
            paidAmount: true,
            status: true,
            dueDate: true,
          },
        },
      },
    });
    if (!result) throw new NotFoundException('Pedido não encontrado.');
    return {
      ...result,
      history: await this.history('ORDER', id),
      attachments: await this.attachments('ORDER', id),
    };
  }
  async orderAction(
    id: string,
    dto: ProcurementActionDto,
    actor: PurchasingActor,
  ) {
    this.allow(
      actor,
      'purchases',
      dto.action === 'CANCEL'
        ? 'cancel'
        : dto.action === 'CLOSE'
          ? 'update'
          : 'send',
    );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true, procurementInvoices: true },
      });
      if (!order || order.workflowVersion !== 2)
        throw new BadRequestException(
          'Use o acompanhamento legado para este pedido.',
        );
      if (order.status === 'CANCELED')
        throw new BadRequestException('Pedido cancelado.');
      const data: Prisma.PurchaseOrderUpdateInput = {};
      if (dto.action === 'SEND') {
        if (order.dispatchEvidence)
          throw new BadRequestException('Envio já registrado.');
        if (!dto.method?.trim() || !dto.evidence?.trim())
          throw new BadRequestException(
            'Informe o meio utilizado e a referência ou evidência do envio.',
          );
        data.dispatchEvidence = {
          method: dto.method,
          evidence: dto.evidence,
          userId: actor.sub,
          at: new Date().toISOString(),
        };
      } else if (dto.action === 'CONFIRM') {
        if (!order.dispatchEvidence)
          throw new BadRequestException(
            'Registre o envio antes da confirmação.',
          );
        if (order.confirmedAt)
          throw new BadRequestException('Confirmação já registrada.');
        if (!dto.evidence?.trim())
          throw new BadRequestException(
            'Registre a confirmação efetivamente recebida do fornecedor.',
          );
        data.confirmedAt = new Date();
        data.confirmationEvidence = {
          evidence: dto.evidence,
          userId: actor.sub,
          at: new Date().toISOString(),
        };
      } else if (dto.action === 'CANCEL') {
        if (!dto.reason?.trim())
          throw new BadRequestException('Justifique o cancelamento.');
        if (
          order.items.some((i) => i.receivedQty > 0) ||
          order.procurementInvoices.some((i) => i.status === 'VALIDATED')
        )
          throw new BadRequestException(
            'Pedido com recebimento ou obrigação financeira exige tratamento de devolução e estorno pelos responsáveis.',
          );
        data.status = 'CANCELED';
        await tx.procurementCommitment.update({
          where: { orderId: id },
          data: { status: 'CANCELED' },
        });
      } else if (dto.action === 'CLOSE') {
        if (order.status !== 'RECEIVED')
          throw new BadRequestException(
            'Conclua os recebimentos antes de encerrar.',
          );
        data.closedAt = new Date();
      } else throw new BadRequestException('Ação de acompanhamento inválida.');
      const result = await tx.purchaseOrder.update({ where: { id }, data });
      await this.event(
        tx,
        'ORDER',
        id,
        dto.action,
        actor,
        order,
        result,
        dto.reason,
      );
      return result;
    });
  }
  async receive(
    id: string,
    dto: ProcurementReceiptDto,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchases', 'receive');
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const prior = await tx.procurementReceipt.findUnique({
          where: { requestKey: dto.requestKey },
          include: { items: true },
        });
        if (prior) {
          if (prior.orderId !== id)
            throw new ConflictException('Chave de recebimento já utilizada.');
          return prior;
        }
        const order = await tx.purchaseOrder.findUnique({
          where: { id },
          include: {
            items: {
              include: {
                catalogItem: true,
                procurementSelection: {
                  include: {
                    quoteItem: {
                      include: {
                        sources: {
                          include: {
                            requestItem: {
                              select: {
                                neededAt: true,
                                request: { select: { createdAt: true } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!order || order.workflowVersion !== 2)
          throw new BadRequestException(
            'Este endpoint atende somente pedidos do novo fluxo. O recebimento legado foi preservado.',
          );
        if (
          !['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) ||
          order.closedAt
        )
          throw new BadRequestException(
            'Pedido não está disponível para recebimento.',
          );
        if (
          new Set(dto.items.map((i) => i.orderItemId)).size !== dto.items.length
        )
          throw new BadRequestException('Item repetido no recebimento.');
        const requestedIds = new Set<string>();
        for (const input of dto.items) {
          const item = order.items.find((i) => i.id === input.orderItemId);
          if (!item)
            throw new BadRequestException('Item não pertence ao pedido.');
          if (input.acceptedQty + input.rejectedQty <= 0)
            throw new BadRequestException('Informe quantidade conferida.');
          if (
            !d(input.acceptedQty)
              .plus(input.rejectedQty)
              .lte(
                d(item.quantity).minus(d(item.receivedQty).toDecimalPlaces(6)),
              )
          )
            throw new BadRequestException(
              'Quantidade conferida superior ao saldo pendente.',
            );
          if (input.rejectedQty > 0 && !input.divergence?.trim())
            throw new BadRequestException(
              'Descreva avaria ou divergência da quantidade recusada.',
            );
          if (
            input.serialNumbers.length &&
            (new Set(input.serialNumbers).size !== input.serialNumbers.length ||
              input.serialNumbers.length !== input.acceptedQty)
          )
            throw new BadRequestException(
              'Informe um número de série distinto para cada unidade aceita.',
            );
          if (
            item.catalogItem.type === 'SERVICE' &&
            item.fulfillmentMode !== 'SERVICE'
          )
            throw new BadRequestException(
              'Serviço deve ser tratado por aceite, sem entrada física.',
            );
          if (
            item.fulfillmentMode === 'WAREHOUSE' &&
            input.acceptedQty > 0 &&
            !dto.warehouseId
          )
            throw new BadRequestException(
              'Selecione o almoxarifado para os materiais físicos.',
            );
          for (const source of item.procurementSelection?.quoteItem.sources ??
            [])
            requestedIds.add(source.requestItemId);
        }
        for (const key of [...requestedIds].sort())
          await this.lock(tx, 'request-item:' + key);
        for (const key of [
          ...new Set(order.items.map((i) => i.catalogItemId)),
        ].sort())
          await this.lock(tx, 'catalog:' + key);
        if (
          dto.warehouseId &&
          !(await tx.warehouse.findUnique({ where: { id: dto.warehouseId } }))
        )
          throw new BadRequestException('Almoxarifado inválido.');
        const oldSerials = (
          await tx.procurementReceiptItem.findMany({
            where: { orderItemId: { in: dto.items.map((i) => i.orderItemId) } },
            select: { serialNumbers: true },
          })
        ).flatMap((i) => i.serialNumbers);
        if (
          dto.items.some((i) =>
            i.serialNumbers.some((serial) => oldSerials.includes(serial)),
          )
        )
          throw new BadRequestException(
            'Número de série já recebido neste pedido.',
          );
        const receipt = await tx.procurementReceipt.create({
          data: {
            orderId: id,
            requestKey: dto.requestKey,
            warehouseId: dto.warehouseId,
            receivedById: actor.sub,
            fiscalReference: dto.fiscalReference,
            notes: dto.notes,
            items: { create: dto.items },
          },
          include: { items: true },
        });
        for (const input of dto.items) {
          if (!input.acceptedQty) continue;
          const item = order.items.find((i) => i.id === input.orderItemId)!;
          if (item.fulfillmentMode === 'WAREHOUSE') {
            const current = await tx.catalogItem.findUniqueOrThrow({
              where: { id: item.catalogItemId },
              select: { stockCurrent: true, averageCost: true },
            });
            const unitCost = item.landedUnitCost ?? d(item.unitPrice);
            const nextQty = d(Math.max(0, current.stockCurrent ?? 0)).plus(
              input.acceptedQty,
            );
            const average = nextQty.gt(0)
              ? d(Math.max(0, current.stockCurrent ?? 0))
                  .mul(current.averageCost ?? 0)
                  .plus(unitCost.mul(input.acceptedQty))
                  .div(nextQty)
                  .toDecimalPlaces(6)
              : unitCost;
            const receivedBalance = await tx.inventoryBalance.upsert({
              where: {
                warehouseId_catalogItemId: {
                  warehouseId: dto.warehouseId!,
                  catalogItemId: item.catalogItemId,
                },
              },
              create: {
                warehouseId: dto.warehouseId!,
                catalogItemId: item.catalogItemId,
                physicalQty: input.acceptedQty,
                reservedQty: 0,
                minQty: 0,
                maxQty: 0,
              },
              update: { physicalQty: { increment: input.acceptedQty } },
            });
            await tx.inventoryBalance.update({
              where: { id: receivedBalance.id },
              data: {
                physicalQty: d(receivedBalance.physicalQty)
                  .toDecimalPlaces(6)
                  .toNumber(),
              },
            });
            await tx.inventoryMovement.create({
              data: {
                movementType: 'PURCHASE_RECEIPT',
                warehouseId: dto.warehouseId!,
                catalogItemId: item.catalogItemId,
                quantity: input.acceptedQty,
                unitCost: unitCost.toNumber(),
                referenceType: 'PURCHASE_ORDER',
                referenceId: id,
                note: 'Recebimento ' + receipt.id,
              },
            });
            const receivedCatalog = await tx.catalogItem.update({
              where: { id: item.catalogItemId },
              data: {
                stockCurrent: { increment: input.acceptedQty },
                averageCost: average.toNumber(),
                lastCost: unitCost.toNumber(),
              },
            });
            await tx.catalogItem.update({
              where: { id: item.catalogItemId },
              data: {
                stockCurrent: d(receivedCatalog.stockCurrent ?? 0)
                  .toDecimalPlaces(6)
                  .toNumber(),
              },
            });
          }
          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: {
              receivedQty: d(item.receivedQty)
                .plus(input.acceptedQty)
                .toDecimalPlaces(6)
                .toNumber(),
            },
          });
          let remaining = d(input.acceptedQty);
          const distribution: Array<{
            allocationId: string;
            requestItemId: string;
            quoteSourceId: string;
            quantity: string;
          }> = [];
          const sources = [
            ...(item.procurementSelection?.quoteItem.sources ?? []),
          ].sort(
            (a, b) =>
              (a.requestItem.neededAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
                (b.requestItem.neededAt?.getTime() ??
                  Number.MAX_SAFE_INTEGER) ||
              a.requestItem.request.createdAt.getTime() -
                b.requestItem.request.createdAt.getTime() ||
              a.id.localeCompare(b.id),
          );
          for (const source of sources) {
            if (remaining.lte(0)) break;
            const availableSource = d(source.quantity).minus(
              source.fulfilledQty,
            );
            if (availableSource.lte(0)) continue;
            const allocations = await tx.procurementAllocation.findMany({
              where: { requestItemId: source.requestItemId },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            });
            let sourceAccepted = d(0);
            for (const allocation of allocations) {
              if (remaining.lte(0) || sourceAccepted.gte(availableSource))
                break;
              if (
                item.fulfillmentMode === 'WAREHOUSE' &&
                allocation.origin === 'STOCK' &&
                allocation.warehouseId !== dto.warehouseId
              )
                continue;
              const available = d(allocation.quantity).minus(
                allocation.fulfilledQty,
              );
              if (available.lte(0)) continue;
              const quantity = Prisma.Decimal.min(
                remaining,
                available,
                availableSource.minus(sourceAccepted),
              );
              await tx.procurementAllocation.update({
                where: { id: allocation.id },
                data: { fulfilledQty: { increment: quantity } },
              });
              sourceAccepted = sourceAccepted.plus(quantity);
              remaining = remaining.minus(quantity);
              distribution.push({
                allocationId: allocation.id,
                requestItemId: source.requestItemId,
                quoteSourceId: source.id,
                quantity: quantity.toString(),
              });
            }
            if (sourceAccepted.gt(0)) {
              const reqItem = await tx.procurementRequestItem.findUniqueOrThrow(
                { where: { id: source.requestItemId } },
              );
              if (
                reqItem.fulfilledQty.plus(sourceAccepted).gt(reqItem.quantity)
              )
                throw new BadRequestException(
                  'Quantidade atendida excede a solicitação.',
                );
              await tx.procurementRequestItem.update({
                where: { id: reqItem.id },
                data: { fulfilledQty: { increment: sourceAccepted } },
              });
              await tx.procurementQuoteSource.update({
                where: { id: source.id },
                data: { fulfilledQty: { increment: sourceAccepted } },
              });
            }
          }
          if (remaining.gt(0))
            throw new BadRequestException(
              'A quantidade não corresponde às destinações pendentes deste almoxarifado. Confira o local de recebimento.',
            );
          await tx.procurementReceiptItem.update({
            where: {
              id: receipt.items.find((i) => i.orderItemId === item.id)!.id,
            },
            data: { allocations: distribution },
          });
        }
        const updatedItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: id },
        });
        const status = updatedItems.every((i) => i.receivedQty >= i.quantity)
          ? 'RECEIVED'
          : updatedItems.some((i) => i.receivedQty > 0)
            ? 'PARTIALLY_RECEIVED'
            : 'APPROVED';
        await tx.purchaseOrder.update({ where: { id }, data: { status } });
        const requestIds = await tx.procurementRequestItem.findMany({
          where: { id: { in: [...requestedIds] } },
          select: { requestId: true },
        });
        for (const requestId of [
          ...new Set(requestIds.map((i) => i.requestId)),
        ]) {
          const all = await tx.procurementRequestItem.findMany({
            where: { requestId },
          });
          await tx.procurementRequest.update({
            where: { id: requestId },
            data: {
              status: all.every((i) => i.fulfilledQty.gte(i.quantity))
                ? 'FULFILLED'
                : all.some((i) => i.fulfilledQty.gt(0))
                  ? 'PARTIALLY_FULFILLED'
                  : 'IN_QUOTATION',
            },
          });
        }
        const completed = await tx.procurementReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
          include: { items: true },
        });
        await this.event(
          tx,
          'ORDER',
          id,
          'RECEIPT_ACCEPTED',
          actor,
          null,
          completed,
        );
        return completed;
      },
      { timeout: 30000 },
    );
  }
  async createInvoice(
    orderId: string,
    dto: ProcurementInvoiceDto,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchases', 'validateInvoice');
    if (!unrestricted(actor) && !actor.accessPolicy?.finance.create)
      throw new ForbiddenException(
        'A geração de títulos exige permissão financeira.',
      );
    if (!dto.evidence.trim())
      throw new BadRequestException(
        'Informe o documento que fundamenta a obrigação.',
      );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, orderId);
      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
      });
      if (!order || order.workflowVersion !== 2 || order.status === 'CANCELED')
        throw new BadRequestException(
          'Pedido indisponível para conferência documental.',
        );
      if (dto.kind === 'ADVANCE') {
        this.allow(actor, 'purchases', 'exception');
        if (!dto.justification?.trim())
          throw new BadRequestException(
            'Adiantamento exige justificativa contratual.',
          );
      }
      const existing = await tx.procurementInvoice.findUnique({
        where: {
          supplierId_number_series: {
            supplierId: order.supplierId,
            number: dto.number,
            series: dto.series,
          },
        },
      });
      if (existing) {
        if (existing.orderId !== orderId)
          throw new ConflictException('Documento já vinculado a outro pedido.');
        return existing;
      }
      const result = await tx.procurementInvoice.create({
        data: {
          ...dto,
          lines: JSON.parse(JSON.stringify(dto.lines)) as Prisma.InputJsonValue,
          schedule: JSON.parse(
            JSON.stringify(dto.schedule),
          ) as Prisma.InputJsonValue,
          accessKey: dto.accessKey || null,
          issueDate: new Date(dto.issueDate),
          orderId,
          supplierId: order.supplierId,
        },
      });
      await this.event(
        tx,
        'ORDER',
        orderId,
        'DOCUMENT_REGISTERED',
        actor,
        null,
        result,
      );
      return result;
    });
  }
  async updateInvoice(
    orderId: string,
    invoiceId: string,
    dto: ProcurementInvoiceDto,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchases', 'validateInvoice');
    if (!unrestricted(actor) && !actor.accessPolicy?.finance.create)
      throw new ForbiddenException('A conferência exige permissão financeira.');
    if (!dto.evidence.trim())
      throw new BadRequestException('Informe a evidência documental.');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, orderId);
      const current = await tx.procurementInvoice.findUnique({
        where: { id: invoiceId },
      });
      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
      });
      if (
        !current ||
        current.orderId !== orderId ||
        current.status !== 'DRAFT' ||
        !order ||
        order.status === 'CANCELED'
      )
        throw new BadRequestException(
          'Somente documentos em rascunho de pedidos ativos podem ser corrigidos.',
        );
      if (dto.kind === 'ADVANCE') {
        this.allow(actor, 'purchases', 'exception');
        if (!dto.justification?.trim())
          throw new BadRequestException(
            'Adiantamento exige justificativa contratual.',
          );
      }
      const duplicate = await tx.procurementInvoice.findUnique({
        where: {
          supplierId_number_series: {
            supplierId: order.supplierId,
            number: dto.number,
            series: dto.series,
          },
        },
      });
      if (duplicate && duplicate.id !== invoiceId)
        throw new ConflictException('Número e série já utilizados.');
      const result = await tx.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          ...dto,
          accessKey: dto.accessKey || null,
          issueDate: new Date(dto.issueDate),
          lines: JSON.parse(JSON.stringify(dto.lines)) as Prisma.InputJsonValue,
          schedule: JSON.parse(
            JSON.stringify(dto.schedule),
          ) as Prisma.InputJsonValue,
        },
      });
      await this.event(
        tx,
        'ORDER',
        orderId,
        'DOCUMENT_DRAFT_CORRECTED',
        actor,
        current,
        result,
      );
      return result;
    });
  }
  async validateInvoice(
    orderId: string,
    invoiceId: string,
    actor: PurchasingActor,
  ) {
    this.allow(actor, 'purchases', 'validateInvoice');
    if (!unrestricted(actor) && !actor.accessPolicy?.finance.create)
      throw new ForbiddenException(
        'A geração de títulos exige permissão financeira.',
      );
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, orderId);
        const invoice = await tx.procurementInvoice.findUnique({
          where: { id: invoiceId },
          include: { installments: true },
        });
        if (!invoice || invoice.orderId !== orderId)
          throw new NotFoundException('Documento não encontrado neste pedido.');
        if (invoice.status === 'VALIDATED') return invoice;
        const order = await tx.purchaseOrder.findUniqueOrThrow({
          where: { id: orderId },
          include: { items: true },
        });
        if (order.workflowVersion !== 2 || order.status === 'CANCELED')
          throw new BadRequestException('Pedido indisponível.');
        const previous = await tx.procurementInvoice.findMany({
          where: { orderId, status: 'VALIDATED' },
        });
        const standard = previous.filter((i) => i.kind === 'STANDARD'),
          advances = previous.filter((i) => i.kind === 'ADVANCE');
        let advanceApplied = d(0);
        if (invoice.kind === 'ADVANCE') {
          this.allow(actor, 'purchases', 'exception');
          if (
            standard.length ||
            advances
              .reduce((s, i) => s.plus(i.amount), d(0))
              .plus(invoice.amount)
              .gt(money(order.totalAmount))
          )
            throw new BadRequestException(
              'Adiantamento excede o pedido ou já existe obrigação definitiva.',
            );
        } else {
          const lines = invoice.lines as Array<{
            orderItemId: string;
            quantity: number;
            amount: number;
          }>;
          if (
            !lines.length ||
            new Set(lines.map((l) => l.orderItemId)).size !== lines.length
          )
            throw new BadRequestException('Confira os itens do documento.');
          if (
            !money(lines.reduce((s, l) => s.plus(l.amount), d(0))).eq(
              invoice.amount,
            )
          )
            throw new BadRequestException(
              'Total dos itens diverge do documento.',
            );
          for (const line of lines) {
            const item = order.items.find((i) => i.id === line.orderItemId);
            if (!item)
              throw new BadRequestException(
                'Item fiscal não pertence ao pedido.',
              );
            const old = standard
              .flatMap((i) => i.lines as typeof lines)
              .filter((l) => l.orderItemId === item.id);
            if (
              old
                .reduce((s, l) => s.plus(l.quantity), d(0))
                .plus(line.quantity)
                .gt(d(item.receivedQty))
            )
              throw new BadRequestException(
                'Quantidade fiscal excede o material recebido ou serviço aceito.',
              );
            const max = money(
              (item.landedUnitCost ?? d(item.unitPrice)).mul(line.quantity),
            );
            if (money(line.amount).gt(max.plus('0.01')))
              throw new BadRequestException(
                'Valor fiscal excede o valor aprovado para o item.',
              );
          }
          if (
            standard
              .reduce((s, i) => s.plus(i.amount), d(0))
              .plus(invoice.amount)
              .gt(money(order.totalAmount))
          )
            throw new BadRequestException(
              'Documentos excedem o compromisso aprovado.',
            );
          const pendingAdvance = advances
            .reduce((s, i) => s.plus(i.amount), d(0))
            .minus(standard.reduce((s, i) => s.plus(i.advanceApplied), d(0)));
          advanceApplied = Prisma.Decimal.min(pendingAdvance, invoice.amount);
        }
        const balance = money(invoice.amount.minus(advanceApplied));
        const schedule = invoice.schedule as Array<{
          amount: number;
          dueDate: string;
        }>;
        if (
          !money(schedule.reduce((s, p) => s.plus(p.amount), d(0))).eq(
            balance,
          ) ||
          schedule.some((p) => p.amount <= 0)
        )
          throw new BadRequestException(
            'Parcelas devem somar o saldo do documento após compensar adiantamentos: R$ ' +
              balance.toFixed(2) +
              '.',
          );
        for (const [index, part] of schedule.entries()) {
          const payable = await tx.accountsPayable.create({
            data: {
              purchaseOrderId: orderId,
              supplierId: order.supplierId,
              description:
                (invoice.kind === 'ADVANCE' ? 'Adiantamento' : 'Documento') +
                ' ' +
                invoice.number +
                '/' +
                invoice.series +
                ' — ' +
                order.code +
                ' — parcela ' +
                (index + 1),
              amount: part.amount,
              dueDate: new Date(part.dueDate),
              issueDate: invoice.issueDate,
              status: 'OPEN',
              category: 'SUPPLIERS',
              duplicateHash:
                order.supplierId +
                '|' +
                new Date(part.dueDate).toISOString().slice(0, 10) +
                '|' +
                money(part.amount).toFixed(2),
            },
          });
          await tx.procurementInstallment.create({
            data: {
              invoiceId,
              number: index + 1,
              dueDate: new Date(part.dueDate),
              amount: part.amount,
              payableId: payable.id,
            },
          });
        }
        const result = await tx.procurementInvoice.update({
          where: { id: invoiceId },
          data: {
            status: 'VALIDATED',
            validatedById: actor.sub,
            validatedAt: new Date(),
            advanceApplied,
          },
          include: { installments: true },
        });
        if (invoice.kind === 'STANDARD') {
          const recognized = money(
            standard
              .reduce((s, i) => s.plus(i.amount), d(0))
              .plus(invoice.amount),
          );
          await tx.procurementCommitment.update({
            where: { orderId },
            data: {
              recognizedAmount: recognized,
              status: recognized.eq(money(order.totalAmount))
                ? 'RECOGNIZED'
                : 'PARTIALLY_RECOGNIZED',
            },
          });
        }
        await this.event(
          tx,
          'ORDER',
          orderId,
          'DOCUMENT_VALIDATED_TITLES_CREATED',
          actor,
          invoice,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  private history(type: string, id: string) {
    return this.db.systemAuditLog.findMany({
      where: {
        domain: 'PURCHASE_ORDERS',
        entityType: 'PROCUREMENT_' + type,
        entityId: id,
      },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  private attachments(type: string, id: string) {
    return this.db.procurementAttachment.findMany({
      where: { entityType: type, entityId: id },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  }
  private async attachmentAccess(
    type: string,
    id: string,
    actor: PurchasingActor,
    write = false,
  ) {
    if (type === 'REQUEST') {
      this.allow(actor, 'purchaseRequests', write ? 'request' : undefined);
      await this.requestAccess(id, actor);
    } else if (type === 'QUOTE') {
      this.allow(actor, 'purchaseQuotations', write ? 'quote' : undefined);
      if (!(await this.db.procurementQuote.findUnique({ where: { id } })))
        throw new NotFoundException('Cotação não encontrada.');
    } else if (type === 'OFFER') {
      this.allow(actor, 'purchaseQuotations', write ? 'quote' : undefined);
      if (!(await this.db.procurementOffer.findUnique({ where: { id } })))
        throw new NotFoundException('Versão da proposta não encontrada.');
    } else if (type === 'ORDER') {
      this.allow(actor, 'purchases');
      if (
        write &&
        !unrestricted(actor) &&
        !['send', 'receive', 'validateInvoice'].some(
          (k) =>
            actor.accessPolicy?.purchaseOrders[
              k as keyof AccessPolicy['purchaseOrders']
            ],
        )
      )
        throw new ForbiddenException(
          'Seu perfil não pode anexar documentos ao pedido.',
        );
      if (!(await this.db.purchaseOrder.findUnique({ where: { id } })))
        throw new NotFoundException('Pedido não encontrado.');
    } else throw new BadRequestException('Tipo de documento inválido.');
  }
  async attach(
    type: string,
    id: string,
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    actor: PurchasingActor,
  ) {
    await this.attachmentAccess(type, id, actor, true);
    // Uses the existing private storage validation, signature checks and size limits.
    const stored = await this.files.saveServiceReportFile(file);
    const result = await this.db.procurementAttachment.create({
      data: {
        ...stored,
        entityType: type,
        entityId: id,
        uploadedById: actor.sub,
      },
    });
    await this.event(this.db, type, id, 'ATTACHMENT_ADDED', actor, null, {
      id: result.id,
      fileName: result.fileName,
    });
    return { id: result.id, fileName: result.fileName };
  }
  async download(fileId: string, actor: PurchasingActor) {
    const entry = await this.db.procurementAttachment.findUnique({
      where: { id: fileId },
    });
    if (!entry) throw new NotFoundException('Anexo não encontrado.');
    await this.attachmentAccess(entry.entityType, entry.entityId, actor);
    return this.files.load(entry.storageKey, entry);
  }
  async options(kind: string, q: string, actor: PurchasingActor) {
    this.allow(actor, 'purchaseRequests');
    if (kind === 'requestItems') {
      this.allow(actor, 'purchaseQuotations', 'quote');
      const items = await this.db.procurementRequestItem.findMany({
        where: {
          request: {
            status: { in: ['ANALYZED', 'IN_QUOTATION', 'PARTIALLY_FULFILLED'] },
          },
          ...(q.trim()
            ? {
                OR: [
                  { description: { contains: q.trim(), mode: 'insensitive' } },
                  {
                    request: {
                      code: { contains: q.trim(), mode: 'insensitive' },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          request: true,

          quoteSources: {
            include: {
              quoteItem: {
                select: {
                  quote: { select: { status: true } },
                  selection: {
                    select: {
                      orderItem: {
                        select: { purchaseOrder: { select: { status: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { request: { createdAt: 'desc' } },
        take: 100,
      });
      return items
        .map((item) => ({
          id: item.id,
          label: item.request.code + ' · ' + item.description,
          name: item.description,
          unit: item.unit,
          type: item.catalogItemId,
          specification: item.specification,
          neededAt: item.neededAt,
          quantity: item.quantity
            .minus(
              item.quoteSources
                .filter(committedSource)
                .reduce((sum, s) => sum.plus(s.quantity), d(0)),
            )
            .toNumber(),
        }))
        .filter((item) => item.quantity > 0)
        .slice(0, 10);
    }
    if (kind === 'users') this.allow(actor, 'purchasingSettings', 'configure');
    if (kind === 'suppliers') assertScreen(actor, 'suppliers');
    const mapping: Record<
      string,
      { model: string; fields: string[]; permission?: keyof AccessPolicy }
    > = {
      catalog: {
        model: 'catalogItem',
        fields: ['name', 'sku'],
        permission: 'catalog',
      },
      clients: {
        model: 'client',
        fields: ['companyName', 'tradeName'],
        permission: 'clients',
      },
      equipments: {
        model: 'generator',
        fields: ['name', 'code', 'serialNumber'],
        permission: 'equipments',
      },
      orders: {
        model: 'maintenanceOrder',
        fields: ['code'],
        permission: 'orders',
      },
      contracts: {
        model: 'serviceContract',
        fields: ['code'],
        permission: 'contracts',
      },
      sales: { model: 'salesOrder', fields: ['code'], permission: 'inventory' },
      warranties: {
        model: 'warrantyCase',
        fields: ['code'],
        permission: 'orders',
      },
      costCenters: { model: 'costCenter', fields: ['name', 'code'] },
      warehouses: { model: 'warehouse', fields: ['name', 'code'] },
      suppliers: { model: 'supplier', fields: ['companyName'] },
      users: { model: 'user', fields: ['name', 'email'] },
    };
    const entry = mapping[kind];
    if (!entry) throw new BadRequestException('Lista desconhecida.');
    if (
      entry.permission &&
      !unrestricted(actor) &&
      !actor.accessPolicy?.[entry.permission]?.['view' as never]
    )
      throw new ForbiddenException(
        'Seu perfil não permite consultar esta lista.',
      );
    if (
      kind === 'users' &&
      !unrestricted(actor) &&
      !actor.accessPolicy?.purchaseOrders.configure
    )
      throw new ForbiddenException(
        'Lista restrita à configuração de aprovações.',
      );
    const delegate = (
      this.db as unknown as Record<
        string,
        { findMany(args: unknown): Promise<Array<Record<string, unknown>>> }
      >
    )[entry.model];
    const filter = {
      ...(q.trim()
        ? {
            OR: [
              ...(/^[a-f0-9-]{36}$/i.test(q.trim()) ? [{ id: q.trim() }] : []),
              ...entry.fields.map((field) => ({
                [field]: { contains: q.trim(), mode: 'insensitive' },
              })),
            ],
          }
        : {}),
      ...(kind === 'orders' && actor.role === 'TECHNICIAN'
        ? { technician: { userId: actor.sub } }
        : {}),
      ...(kind === 'users' ? { isActive: true } : {}),
    };
    const items = await delegate.findMany({
      where: filter,
      take: 10,
      orderBy: { [entry.fields[0]]: 'asc' },
      select: {
        id: true,
        ...Object.fromEntries(entry.fields.map((field) => [field, true])),
        ...(kind === 'catalog' ? { unit: true, type: true } : {}),
        ...(kind === 'orders'
          ? { generatorId: true, generator: { select: { clientId: true } } }
          : {}),
        ...(kind === 'equipments'
          ? { clientId: true, serialNumber: true }
          : {}),
      },
    });
    return items.map((row) => ({
      id: row.id,
      label: entry.fields
        .map((field) => row[field])
        .filter(Boolean)
        .join(' · '),
      ...(kind === 'catalog'
        ? { name: row.name, sku: row.sku, unit: row.unit, type: row.type }
        : {}),
      ...(kind === 'orders'
        ? {
            clientId: (row.generator as { clientId?: string } | undefined)
              ?.clientId,
            generatorId: row.generatorId,
          }
        : {}),
      ...(kind === 'equipments'
        ? { clientId: row.clientId, serialNumber: row.serialNumber }
        : {}),
    }));
  }
}
