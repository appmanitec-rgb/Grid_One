import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  assertScreen,
  unrestricted,
  type RuleActor,
  readRules,
} from '../auth/rules/access-rules';
import { ACCESS_SCREENS } from '../auth/rules/access-screens';
import type { AccessPolicy } from '../users/access-policy';
import { ProductValidityDto } from './product-validity.dto';
type Actor = RuleActor & { accessPolicy?: AccessPolicy };
type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
type Item = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  status?: string;
  dueAt?: Date | null;
  tone?: Tone;
};
type Metric = {
  id: string;
  label: string;
  value: number;
  helper: string;
  href?: string;
  tone: Tone;
};
type Section = {
  id: string;
  title: string;
  description: string;
  total: number;
  items: Item[];
  href?: string;
  emptyMessage: string;
  notice?: string;
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function dashboardAudience(
  role: string,
  department: string,
  profileId?: string,
) {
  if (['ADMIN', 'MANAGER'].includes(role)) return 'EXECUTIVE';
  const area = normalize(department);
  if (
    /supriment|almox|estoque|compras/.test(area) ||
    role === 'SUPPLIES' ||
    ['SUPPLIES', 'PURCHASING'].includes(profileId || '')
  )
    return 'SUPPLIES';
  if (
    ['SALES', 'ENGINEER_APPLICATION'].includes(role) ||
    /comercial|vendas/.test(area)
  )
    return 'COMMERCIAL';
  return 'DEPARTMENT';
}
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditLogsService,
  ) {}
  private can(actor: Actor, screen: string, action = 'view') {
    if (unrestricted(actor)) return true;
    const config = ACCESS_SCREENS.find((s) => s.key === screen);
    if (!config) return false;
    try {
      assertScreen(actor, screen, action === 'view' ? undefined : action);
    } catch {
      return false;
    }
    const policy = actor.accessPolicy as unknown as
      | Record<string, Record<string, boolean>>
      | undefined;
    return (
      policy?.pages?.[config.parent] === true &&
      policy?.[config.section]?.[action] === true
    );
  }
  private require(actor: Actor, screen: string, action = 'view') {
    if (!this.can(actor, screen, action))
      throw new ForbiddenException(
        'Seu perfil n\u00e3o permite esta a\u00e7\u00e3o.',
      );
  }
  private days() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (k: string) => parts.find((p) => p.type === k)!.value;
    const today = new Date(
      get('year') + '-' + get('month') + '-' + get('day') + 'T00:00:00Z',
    );
    return { today, until: new Date(today.getTime() + 30 * 86400000) };
  }
  async overview(actor: Actor) {
    assertScreen(actor, 'dashboard');
    const user = await this.db.user.findUnique({
      where: { id: actor.sub },
      select: { department: true, role: true },
    });
    if (!user) throw new NotFoundException('Usu\u00e1rio n\u00e3o encontrado.');
    const audience = dashboardAudience(
      user.role,
      user.department || '',
      readRules(actor.accessRules).profileId,
    );
    const inventory = this.can(actor, 'inventory'),
      purchases = this.can(actor, 'purchases'),
      orders = this.can(actor, 'orders');
    const operational =
      (audience === 'SUPPLIES' || audience === 'EXECUTIVE') && inventory;
    const metrics: Metric[] = [],
      sections: Section[] = [],
      tasks: Array<Promise<void>> = [];
    const paths = {
      inventory: '/dashboard/inventory',
      purchases: '/dashboard/purchase-orders',
      requests: '/dashboard/purchase-orders/requests',
      quotes: '/dashboard/purchase-orders/quotations',
      orders: '/dashboard/orders',
      epis: '/dashboard/hr/epis-tools',
    };
    const add = (
      id: string,
      label: string,
      value: number,
      helper: string,
      href?: string,
      tone: Tone = 'slate',
    ) => metrics.push({ id, label, value, helper, href, tone });
    const { today, until } = this.days();
    if (purchases && (audience === 'SUPPLIES' || audience === 'EXECUTIVE'))
      tasks.push(
        (async () => {
          const where: Prisma.PurchaseOrderWhereInput = {
            status: { in: ['SENT', 'APPROVED', 'PARTIALLY_RECEIVED'] },
          };
          const [total, late, list] = await Promise.all([
            this.db.purchaseOrder.count({ where }),
            this.db.purchaseOrder.count({
              where: { ...where, expectedDate: { lt: today } },
            }),
            this.db.purchaseOrder.findMany({
              where,
              select: {
                id: true,
                code: true,
                status: true,
                expectedDate: true,
                supplier: { select: { companyName: true } },
              },
              orderBy: [
                { expectedDate: { sort: 'asc', nulls: 'last' } },
                { issueDate: 'asc' },
              ],
              take: 5,
            }),
          ]);
          add(
            'purchases',
            'Pedidos em acompanhamento',
            total,
            'Enviados, aprovados ou parcialmente recebidos',
            paths.purchases,
            'blue',
          );
          add(
            'late-purchases',
            'Entregas em atraso',
            late,
            'Pedidos abertos com previs\u00e3o vencida',
            paths.purchases,
            'rose',
          );
          sections.push({
            id: 'purchases',
            title: 'Pedidos de compra',
            description:
              'Recebimentos e entregas que precisam de acompanhamento.',
            total,
            href: paths.purchases,
            emptyMessage: 'Nenhum pedido aguardando entrega.',
            items: list.map((p) => ({
              id: p.id,
              title: p.code,
              subtitle: p.supplier.companyName,
              href: paths.purchases + '/' + p.id,
              status: p.status,
              dueAt: p.expectedDate,
              tone: p.expectedDate && p.expectedDate < today ? 'rose' : 'blue',
            })),
          });
        })(),
      );
    if (operational)
      tasks.push(
        (async () => {
          const material: Prisma.MaintenanceOrderMaterialWhereInput = {
            appliedAt: null,
            separatedAt: null,
            catalogItem: { type: { not: 'SERVICE' } },
          };
          const where: Prisma.MaintenanceOrderWhereInput = {
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            materials: { some: material },
          };
          const [total, list] = await Promise.all([
            this.db.maintenanceOrder.count({ where }),
            this.db.maintenanceOrder.findMany({
              where,
              select: {
                id: true,
                title: true,
                scheduledTo: true,
                generator: {
                  select: {
                    name: true,
                    client: { select: { companyName: true } },
                  },
                },
                materials: {
                  where: material,
                  take: 5,
                  select: {
                    id: true,
                    quantity: true,
                    reservedAt: true,
                    catalogItem: { select: { name: true, unit: true } },
                  },
                },
              },
              orderBy: [
                { scheduledTo: { sort: 'asc', nulls: 'last' } },
                { openedAt: 'asc' },
              ],
              take: 5,
            }),
          ]);
          add(
            'separation',
            'O.S. aguardando separa\u00e7\u00e3o',
            total,
            'Ordens abertas com materiais ainda n\u00e3o separados',
            orders ? paths.orders : undefined,
            'amber',
          );
          sections.push({
            id: 'separation',
            title: 'Servi\u00e7os aguardando separa\u00e7\u00e3o',
            description:
              'Materiais reservados podem ser conferidos e marcados como separados.',
            total,
            href: orders ? paths.orders : undefined,
            emptyMessage:
              'Nenhuma O.S. com materiais aguardando separa\u00e7\u00e3o.',
            items: list.flatMap((o) =>
              o.materials.slice(0, 5).map((m) => ({
                id: m.id,
                title: m.catalogItem.name,
                subtitle:
                  o.title +
                  ' \u00b7 ' +
                  o.generator.client.companyName +
                  ' \u00b7 ' +
                  m.quantity +
                  ' ' +
                  (m.catalogItem.unit || 'UN'),
                href: orders ? paths.orders + '/' + o.id : undefined,
                status: m.reservedAt ? 'RESERVED' : 'AWAITING_RESERVATION',
                dueAt: o.scheduledTo,
                tone: 'amber' as Tone,
              })),
            ),
          });
        })(),
      );
    if (operational)
      tasks.push(
        (async () => {
          const [balances, withoutBalances] = await Promise.all([
            this.db.inventoryBalance.findMany({
              where: {
                catalogItem: { isActive: true, type: { not: 'SERVICE' } },
              },
              select: {
                id: true,
                physicalQty: true,
                reservedQty: true,
                minQty: true,
                catalogItem: { select: { id: true, name: true, unit: true } },
                warehouse: { select: { name: true } },
              },
            }),
            this.db.catalogItem.findMany({
              where: {
                isActive: true,
                type: { not: 'SERVICE' },
                stockMin: { gt: 0 },
                inventoryBalances: { none: {} },
              },
              select: {
                id: true,
                name: true,
                unit: true,
                stockCurrent: true,
                stockMin: true,
              },
            }),
          ]);
          const low = [
            ...balances
              .filter((b) => b.physicalQty - b.reservedQty < b.minQty)
              .map((b) => ({
                id: b.id,
                title: b.catalogItem.name,
                subtitle:
                  b.warehouse.name +
                  ' \u00b7 Dispon\u00edvel: ' +
                  (b.physicalQty - b.reservedQty) +
                  ' \u00b7 M\u00ednimo: ' +
                  b.minQty,
              })),
            ...withoutBalances
              .filter((c) => (c.stockCurrent || 0) < (c.stockMin || 0))
              .map((c) => ({
                id: c.id,
                title: c.name,
                subtitle:
                  'Sem almoxarifado definido \u00b7 Saldo: ' +
                  (c.stockCurrent || 0) +
                  ' \u00b7 M\u00ednimo: ' +
                  c.stockMin,
              })),
          ];
          add(
            'low-stock',
            'Reposi\u00e7\u00f5es necess\u00e1rias',
            low.length,
            'Saldo dispon\u00edvel abaixo do m\u00ednimo',
            paths.inventory,
            'amber',
          );
          sections.push({
            id: 'stock',
            title: 'Estoque e almoxarifado',
            description:
              'A disponibilidade desconta os materiais j\u00e1 reservados.',
            total: low.length,
            href: paths.inventory,
            emptyMessage:
              'Nenhuma posi\u00e7\u00e3o de estoque abaixo do m\u00ednimo cadastrado.',
            items: low.slice(0, 5).map((b) => ({
              ...b,
              href: paths.inventory,
              tone: 'amber' as Tone,
            })),
          });
        })(),
      );
    if (operational)
      tasks.push(
        (async () => {
          const where: Prisma.CatalogItemIdentifierWhereInput = {
            source: 'PRODUCT_EXPIRY',
            isActive: true,
            catalogItem: { isActive: true },
            validUntil: { not: null },
          };
          const [tracked, expired, soon, list] = await Promise.all([
            this.db.catalogItemIdentifier.count({ where }),
            this.db.catalogItemIdentifier.count({
              where: { ...where, validUntil: { lt: today } },
            }),
            this.db.catalogItemIdentifier.count({
              where: { ...where, validUntil: { gte: today, lte: until } },
            }),
            this.db.catalogItemIdentifier.findMany({
              where: { ...where, validUntil: { lte: until } },
              select: {
                id: true,
                code: true,
                validUntil: true,
                catalogItem: { select: { id: true, name: true } },
              },
              orderBy: { validUntil: 'asc' },
              take: 5,
            }),
          ]);
          add(
            'products-expiry',
            'Produtos vencidos / a vencer',
            expired + soon,
            expired +
              ' vencido(s) \u00b7 ' +
              soon +
              ' nos pr\u00f3ximos 30 dias',
            undefined,
            expired ? 'rose' : 'amber',
          );
          sections.push({
            id: 'product-validity',
            title: 'Validade de produtos',
            description:
              'Lotes acompanhados com validade cadastrada. O registro n\u00e3o altera o saldo de estoque.',
            total: expired + soon,
            emptyMessage: tracked
              ? 'Nenhum lote acompanhado vence nos pr\u00f3ximos 30 dias.'
              : 'Nenhuma validade de produto cadastrada para acompanhamento.',
            notice: tracked
              ? 'Acompanhe o consumo e encerre o controle dos lotes que sa\u00edram do estoque.'
              : 'Cadastre o produto, lote e validade para habilitar os alertas deste painel.',
            items: list.map((v) => ({
              id: v.id,
              title: v.catalogItem.name,
              subtitle: 'Lote ' + v.code,
              href: this.can(actor, 'catalog')
                ? '/dashboard/catalog/' + v.catalogItem.id
                : undefined,
              dueAt: v.validUntil,
              status: v.validUntil! < today ? 'EXPIRED' : 'EXPIRING',
              tone: v.validUntil! < today ? 'rose' : 'amber',
            })),
          });
        })(),
      );
    if (operational || this.can(actor, 'hrTools'))
      tasks.push(
        (async () => {
          const where: Prisma.HrAssetAssignmentWhereInput = {
            assetType: 'EPI',
            status: { in: ['ACTIVE', 'EXPIRED'] },
            returnedAt: null,
          };
          const [active, expired, soon, undated, list] = await Promise.all([
            this.db.hrAssetAssignment.count({ where }),
            this.db.hrAssetAssignment.count({
              where: {
                ...where,
                OR: [{ status: 'EXPIRED' }, { expiresAt: { lt: today } }],
              },
            }),
            this.db.hrAssetAssignment.count({
              where: {
                ...where,
                status: 'ACTIVE',
                expiresAt: { gte: today, lte: until },
              },
            }),
            this.db.hrAssetAssignment.count({
              where: { ...where, expiresAt: null },
            }),
            this.db.hrAssetAssignment.findMany({
              where: {
                ...where,
                OR: [{ status: 'EXPIRED' }, { expiresAt: { lte: until } }],
              },
              select: { id: true, title: true, expiresAt: true, status: true },
              orderBy: { expiresAt: { sort: 'asc', nulls: 'last' } },
              take: 5,
            }),
          ]);
          const href = this.can(actor, 'hrTools') ? paths.epis : undefined;
          add(
            'epis',
            'EPIs vencidos / a vencer',
            expired + soon,
            active + ' em acompanhamento \u00b7 ' + expired + ' vencido(s)',
            href,
            expired ? 'rose' : 'blue',
          );
          sections.push({
            id: 'epis',
            title: 'EPIs e reposi\u00e7\u00f5es',
            description:
              'Vencimentos dos equipamentos de prote\u00e7\u00e3o entregues, sem exibir dados pessoais dos colaboradores.',
            total: expired + soon,
            href,
            emptyMessage:
              'Nenhum EPI vencido ou a vencer nos pr\u00f3ximos 30 dias.',
            notice: undated
              ? undated +
                ' EPI(s) acompanhado(s) sem data de validade cadastrada.'
              : undefined,
            items: list.map((e) => ({
              id: e.id,
              title: e.title,
              dueAt: e.expiresAt,
              status:
                e.status === 'EXPIRED' || (e.expiresAt && e.expiresAt < today)
                  ? 'EXPIRED'
                  : 'EXPIRING',
              href,
              tone: 'amber' as Tone,
            })),
          });
        })(),
      );
    if (this.can(actor, 'purchaseRequests'))
      tasks.push(
        (async () => {
          const staff =
            this.can(actor, 'purchaseRequests', 'analyze') ||
            this.can(actor, 'purchaseQuotations', 'quote') ||
            unrestricted(actor);
          const where: Prisma.ProcurementRequestWhereInput = {
            ...(!staff ? { requesterId: actor.sub } : {}),
            status: { notIn: ['FULFILLED', 'CANCELED'] },
          };
          const [total, list] = await Promise.all([
            this.db.procurementRequest.count({ where }),
            this.db.procurementRequest.findMany({
              where,
              select: {
                id: true,
                code: true,
                status: true,
                justification: true,
                neededAt: true,
              },
              orderBy: { createdAt: 'asc' },
              take: 5,
            }),
          ]);
          add(
            'requests',
            staff
              ? 'Solicita\u00e7\u00f5es em aberto'
              : 'Minhas solicita\u00e7\u00f5es',
            total,
            staff
              ? 'Necessidades a analisar ou acompanhar'
              : 'Compras solicitadas por voc\u00ea',
            paths.requests,
            'blue',
          );
          sections.push({
            id: 'requests',
            title: staff
              ? 'Necessidades de compra'
              : 'Minhas solicita\u00e7\u00f5es de compra',
            description:
              'Acompanhe a an\u00e1lise, a cota\u00e7\u00e3o e o atendimento.',
            total,
            href: paths.requests,
            emptyMessage: 'Nenhuma solicita\u00e7\u00e3o em aberto.',
            items: list.map((r) => ({
              id: r.id,
              title: r.code,
              subtitle: r.justification,
              status: r.status,
              dueAt: r.neededAt,
              href: paths.requests + '/' + r.id,
            })),
          });
        })(),
      );
    if (this.can(actor, 'purchaseQuotations'))
      tasks.push(
        (async () => {
          const total = await this.db.procurementQuote.count({
            where: { status: { notIn: ['ORDERED', 'CANCELED'] } },
          });
          add(
            'quotes',
            'Cota\u00e7\u00f5es em andamento',
            total,
            'Negocia\u00e7\u00f5es e aprova\u00e7\u00f5es pendentes',
            paths.quotes,
            'blue',
          );
        })(),
      );
    if (!operational && orders && audience === 'DEPARTMENT')
      tasks.push(
        (async () => {
          const where: Prisma.MaintenanceOrderWhereInput = {
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            ...(user.role === 'TECHNICIAN'
              ? { technician: { userId: actor.sub } }
              : {}),
          };
          const [total, list] = await Promise.all([
            this.db.maintenanceOrder.count({ where }),
            this.db.maintenanceOrder.findMany({
              where,
              select: {
                id: true,
                title: true,
                status: true,
                scheduledTo: true,
              },
              orderBy: { scheduledTo: { sort: 'asc', nulls: 'last' } },
              take: 5,
            }),
          ]);
          add(
            'orders',
            user.role === 'TECHNICIAN'
              ? 'Minhas O.S. em andamento'
              : 'O.S. em andamento',
            total,
            'Atendimentos abertos e em execu\u00e7\u00e3o',
            paths.orders,
            'blue',
          );
          sections.push({
            id: 'orders',
            title: 'Atendimentos e programa\u00e7\u00e3o',
            description:
              user.role === 'TECHNICIAN'
                ? 'Somente ordens atribu\u00eddas a voc\u00ea.'
                : 'Acompanhe as ordens da opera\u00e7\u00e3o.',
            total,
            href: paths.orders,
            emptyMessage: 'Nenhuma O.S. em andamento nesta vis\u00e3o.',
            items: list.map((o) => ({
              id: o.id,
              title: o.title,
              status: o.status,
              dueAt: o.scheduledTo,
              href: paths.orders + '/' + o.id,
            })),
          });
        })(),
      );
    for (const [screen, model, label] of [
      ['payables', 'accountsPayable', 'Contas a pagar'],
      ['receivables', 'accountsReceivable', 'Contas a receber'],
    ] as const) {
      if (
        this.can(actor, screen) &&
        (audience === 'DEPARTMENT' || audience === 'EXECUTIVE')
      )
        tasks.push(
          (async () => {
            const count =
              model === 'accountsPayable'
                ? await this.db.accountsPayable.count({
                    where: { status: { notIn: ['PAID', 'CANCELED'] } },
                  })
                : await this.db.accountsReceivable.count({
                    where: { status: { notIn: ['PAID', 'CANCELED'] } },
                  });
            add(
              screen,
              label,
              count,
              'T\u00edtulos ainda em aberto',
              '/dashboard/finance/' +
                (screen === 'payables'
                  ? 'accounts-payable'
                  : 'accounts-receivable'),
              'blue',
            );
          })(),
        );
    }
    if (
      this.can(actor, 'hrCollaborators') &&
      ['HR', 'NORMAL'].includes(user.role)
    )
      tasks.push(
        (async () => {
          const total = await this.db.user.count({
            where: { isActive: true, role: { notIn: ['CLIENT', 'AUDITOR'] } },
          });
          add(
            'collaborators',
            'Colaboradores ativos',
            total,
            'Cadastros internos ativos',
            '/dashboard/hr/collaborators',
            'blue',
          );
        })(),
      );
    await Promise.all(tasks);
    const order = [
      'purchases',
      'separation',
      'late-purchases',
      'low-stock',
      'products-expiry',
      'epis',
      'requests',
      'quotes',
    ];
    metrics.sort(
      (a, b) =>
        (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id)) -
        (order.indexOf(b.id) < 0 ? 99 : order.indexOf(b.id)),
    );
    sections.sort(
      (a, b) =>
        [
          'separation',
          'purchases',
          'stock',
          'product-validity',
          'epis',
          'requests',
          'orders',
        ].indexOf(a.id) -
        [
          'separation',
          'purchases',
          'stock',
          'product-validity',
          'epis',
          'requests',
          'orders',
        ].indexOf(b.id),
    );
    const shortcuts = [
      ['purchaseRequests', 'Solicita\u00e7\u00f5es de compra', paths.requests],
      ['purchases', 'Pedidos de compra', paths.purchases],
      ['inventory', 'Estoque e almoxarifado', paths.inventory],
      ['catalog', 'Pe\u00e7as e servi\u00e7os', '/dashboard/catalog'],
      ['purchaseQuotations', 'Cota\u00e7\u00f5es e comparativo', paths.quotes],
      ['hrTools', 'EPIs e ferramentas', paths.epis],
      ['orders', 'Ordens de servi\u00e7o', paths.orders],
      ['payables', 'Contas a pagar', '/dashboard/finance/accounts-payable'],
      [
        'receivables',
        'Contas a receber',
        '/dashboard/finance/accounts-receivable',
      ],
      ['hrCollaborators', 'Colaboradores', '/dashboard/hr/collaborators'],
      ['technicianPortal', 'Portal t\u00e9cnico', '/dashboard/tecnico'],
    ]
      .filter(([s]) => this.can(actor, s))
      .map(([id, label, href]) => ({ id, label, href }));
    return {
      audience,
      department: user.department || '',
      title:
        audience === 'SUPPLIES'
          ? 'Suprimentos, compras e almoxarifado'
          : audience === 'EXECUTIVE'
            ? 'Vis\u00e3o geral'
            : 'Meu painel \u00b7 ' + (user.department || 'Atividades'),
      description:
        audience === 'SUPPLIES'
          ? 'Pedidos, materiais das O.S., estoque e vencimentos que precisam da sua aten\u00e7\u00e3o.'
          : 'Indicadores e atalhos das \u00e1reas liberadas para o seu usu\u00e1rio.',
      metrics,
      sections,
      shortcuts,
      canViewCommercial: this.can(actor, 'proposals'),
      canSeparate: operational && this.can(actor, 'inventory', 'reserve'),
      canManageValidity:
        operational &&
        this.can(actor, 'catalog') &&
        this.can(actor, 'catalog', 'update'),
      generatedAt: new Date().toISOString(),
    };
  }
  async productOptions(query: string, actor: Actor) {
    this.require(actor, 'inventory');
    this.require(actor, 'catalog');
    const q = query.trim().slice(0, 120);
    return this.db.catalogItem.findMany({
      where: {
        isActive: true,
        type: { not: 'SERVICE' },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, sku: true, type: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }
  async separate(id: string, actor: Actor) {
    this.require(actor, 'inventory', 'reserve');
    const user = await this.db.user.findUnique({
      where: { id: actor.sub },
      select: { role: true, department: true },
    });
    if (
      !user ||
      !['SUPPLIES', 'EXECUTIVE'].includes(
        dashboardAudience(
          user.role,
          user.department || '',
          readRules(actor.accessRules).profileId,
        ),
      )
    )
      throw new ForbiddenException(
        'A separa\u00e7\u00e3o pertence ao almoxarifado.',
      );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'material-separation:' + id}))`,
      );
      const row = await tx.maintenanceOrderMaterial.findUnique({
        where: { id },
        include: {
          order: { select: { status: true } },
          catalogItem: { select: { type: true } },
        },
      });
      if (!row) throw new NotFoundException('Material n\u00e3o encontrado.');
      if (row.separatedAt) return { separatedAt: row.separatedAt };
      if (
        row.appliedAt ||
        !['OPEN', 'IN_PROGRESS'].includes(row.order.status) ||
        row.catalogItem.type === 'SERVICE'
      )
        throw new BadRequestException(
          'Este material n\u00e3o aguarda separa\u00e7\u00e3o.',
        );
      if (!row.reservedAt)
        throw new BadRequestException(
          'Reserve o material no estoque antes de confirmar a separa\u00e7\u00e3o.',
        );
      const updated = await tx.maintenanceOrderMaterial.update({
        where: { id },
        data: { separatedAt: new Date() },
      });
      await this.audit.record(
        {
          domain: 'INVENTORY',
          entityType: 'ORDER_MATERIAL',
          entityId: id,
          action: 'MATERIAL_SEPARATED',
          actorUserId: actor.sub,
          afterPayload: {
            orderId: row.orderId,
            catalogItemId: row.catalogItemId,
            separatedAt: updated.separatedAt!.toISOString(),
          },
        },
        tx,
      );
      return { separatedAt: updated.separatedAt };
    });
  }
  async saveValidity(dto: ProductValidityDto, actor: Actor) {
    this.require(actor, 'inventory');
    this.require(actor, 'catalog');
    this.require(actor, 'catalog', 'update');
    const item = await this.db.catalogItem.findUnique({
      where: { id: dto.catalogItemId },
      select: { isActive: true, type: true },
    });
    if (!item?.isActive || item.type === 'SERVICE')
      throw new BadRequestException('Selecione um produto f\u00edsico ativo.');
    const code = dto.lotCode.trim();
    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalizedCode)
      throw new BadRequestException('Informe um lote v\u00e1lido.');
    if (!code) throw new BadRequestException('Informe o lote.');
    const expires = new Date(dto.expiresAt.slice(0, 10) + 'T00:00:00Z');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'product-expiry:' + dto.catalogItemId + ':' + normalizedCode}))`,
      );
      const before = await tx.catalogItemIdentifier.findFirst({
        where: {
          catalogItemId: dto.catalogItemId,
          source: 'PRODUCT_EXPIRY',
          normalizedCode,
          isActive: true,
        },
      });
      const data = { validUntil: expires, notes: dto.notes?.trim() || null };
      const saved = before
        ? await tx.catalogItemIdentifier.update({
            where: { id: before.id },
            data,
          })
        : await tx.catalogItemIdentifier.create({
            data: {
              ...data,
              catalogItemId: dto.catalogItemId,
              type: 'OTHER',
              code,
              normalizedCode: normalizedCode,
              source: 'PRODUCT_EXPIRY',
              description: 'Controle de validade do lote',
            },
          });
      await this.audit.record(
        {
          domain: 'INVENTORY',
          entityType: 'PRODUCT_VALIDITY',
          entityId: saved.id,
          action: before ? 'VALIDITY_UPDATED' : 'VALIDITY_REGISTERED',
          actorUserId: actor.sub,
          afterPayload: {
            catalogItemId: dto.catalogItemId,
            lotCode: code,
            expiresAt: expires.toISOString(),
          },
        },
        tx,
      );
      return { id: saved.id };
    });
  }
  async closeValidity(id: string, actor: Actor) {
    this.require(actor, 'inventory');
    this.require(actor, 'catalog', 'update');
    return this.db.$transaction(async (tx) => {
      const record = await tx.catalogItemIdentifier.findFirst({
        where: { id, source: 'PRODUCT_EXPIRY' },
      });
      if (!record)
        throw new NotFoundException(
          'Controle de validade n\u00e3o encontrado.',
        );
      if (!record.isActive) return { ok: true };
      await tx.catalogItemIdentifier.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit.record(
        {
          domain: 'INVENTORY',
          entityType: 'PRODUCT_VALIDITY',
          entityId: id,
          action: 'VALIDITY_CLOSED',
          actorUserId: actor.sub,
        },
        tx,
      );
      return { ok: true };
    });
  }
}
