import type { Prisma } from '@prisma/client';
import type { DatabaseService } from '../../database/database.service';
import type { Actor, Item, Metric, Section, Tone } from './dashboard.types';

/** Read-only queues. Each query is gated by its source screen permission. */
export async function departmentInsights(
  db: DatabaseService,
  actor: Actor,
  can: (screen: string, action?: string) => boolean,
  context: { today: Date; until: Date; executive: boolean; fieldWork: boolean },
) {
  const { today, until, executive, fieldWork } = context;
  const metrics: Metric[] = [],
    sections: Section[] = [],
    tasks: Promise<void>[] = [];
  const now = new Date();
  const dayStart = new Date(today.getTime() + 3 * 3600000);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const week = new Date(today.getTime() + 8 * 86400000);
  const metric = (
    id: string,
    label: string,
    value: number,
    helper: string,
    href: string,
    tone: Tone = 'blue',
  ) => {
    metrics.push({ id, label, value, helper, href, tone });
  };
  const section = (
    id: string,
    title: string,
    description: string,
    total: number,
    href: string,
    items: Item[],
    emptyMessage: string,
  ) => {
    sections.push({ id, title, description, total, href, items, emptyMessage });
  };
  if (can('hrCollaborators'))
    tasks.push(
      (async () => {
        const total = await db.user.count({
          where: { isActive: true, role: { notIn: ['CLIENT', 'AUDITOR'] } },
        });
        metric(
          'collaborators',
          'Colaboradores ativos',
          total,
          'Cadastros internos ativos',
          '/dashboard/hr/collaborators',
        );
      })(),
    );
  if (can('hrDocumentation') && can('hrDocumentation', 'manageCertifications'))
    tasks.push(
      (async () => {
        const href = '/dashboard/hr/documentation';
        const where: Prisma.UserCertificationWhereInput = {
          user: { isActive: true, role: { notIn: ['CLIENT', 'AUDITOR'] } },
        };
        const [expired, soon, list, missing] = await Promise.all([
          db.userCertification.count({
            where: { ...where, validUntil: { lt: today } },
          }),
          db.userCertification.count({
            where: { ...where, validUntil: { gte: today, lte: until } },
          }),
          db.userCertification.findMany({
            where: { ...where, validUntil: { lte: until } },
            select: {
              id: true,
              code: true,
              validUntil: true,
              user: { select: { name: true } },
            },
            orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
          db.user.count({
            where: {
              isActive: true,
              role: { notIn: ['CLIENT', 'AUDITOR'] },
              certifications: { none: {} },
            },
          }),
        ]);
        metric(
          'documents-expired',
          'Documentos vencidos',
          expired,
          'Documentos e certifica\u00e7\u00f5es de colaboradores ativos',
          href,
          expired ? 'rose' : 'emerald',
        );
        metric(
          'documents-expiring',
          'Documentos a vencer',
          soon,
          'Vencimentos de hoje at\u00e9 os pr\u00f3ximos 30 dias',
          href,
          soon ? 'amber' : 'emerald',
        );
        metric(
          'documents-missing',
          'Sem documentos cadastrados',
          missing,
          'Sem nenhum registro; n\u00e3o significa falta de documento obrigat\u00f3rio',
          href,
          'slate',
        );
        section(
          'documents',
          'Documentos e certifica\u00e7\u00f5es',
          'Vencidos primeiro, seguidos dos vencimentos nos pr\u00f3ximos 30 dias. Somente colaboradores ativos.',
          expired + soon,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.code,
            subtitle: r.user.name,
            dueAt: r.validUntil,
            status: r.validUntil < today ? 'EXPIRED' : 'EXPIRING',
            tone: r.validUntil < today ? 'rose' : 'amber',
            href,
          })),
          'Nenhum documento vencido ou a vencer nos pr\u00f3ximos 30 dias.',
        );
      })(),
    );
  if (can('hrTime'))
    tasks.push(
      (async () => {
        const href = '/dashboard/hr/time-tracking';
        const where: Prisma.TimeEntryWhereInput = {
          endedAt: null,
          startedAt: { lt: new Date(now.getTime() - 24 * 3600000) },
          user: { isActive: true },
        };
        const [total, list] = await Promise.all([
          db.timeEntry.count({ where }),
          db.timeEntry.findMany({
            where,
            select: {
              id: true,
              startedAt: true,
              status: true,
              user: { select: { name: true } },
            },
            orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        metric(
          'time-review',
          'Apontamentos para conferir',
          total,
          'Abertos h\u00e1 mais de 24h; confira o encerramento',
          href,
          total ? 'amber' : 'emerald',
        );
        section(
          'time',
          'Confer\u00eancia de apontamentos',
          'Registros sem encerramento h\u00e1 mais de 24 horas. A confer\u00eancia n\u00e3o altera o banco de horas automaticamente.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.user.name,
            subtitle: 'In\u00edcio do apontamento',
            dueAt: r.startedAt,
            status: r.status,
            href,
          })),
          'Nenhum apontamento antigo em aberto.',
        );
      })(),
    );
  if (can('hrFleet'))
    tasks.push(
      (async () => {
        const href = '/dashboard/hr/fleet';
        const where: Prisma.FleetVehicleWhereInput = {
          isActive: true,
          status: { in: ['MAINTENANCE', 'BLOCKED'] },
        };
        const [total, list] = await Promise.all([
          db.fleetVehicle.count({ where }),
          db.fleetVehicle.findMany({
            where,
            select: { id: true, plate: true, model: true, status: true },
            orderBy: { plate: 'asc' },
            take: 5,
          }),
        ]);
        metric(
          'fleet-unavailable',
          'Ve\u00edculos indispon\u00edveis',
          total,
          'Em manuten\u00e7\u00e3o ou bloqueados',
          href,
          total ? 'amber' : 'emerald',
        );
        section(
          'fleet',
          'Frota que precisa de aten\u00e7\u00e3o',
          'Ve\u00edculos ativos indispon\u00edveis para aloca\u00e7\u00e3o.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.plate,
            subtitle: r.model,
            status: r.status,
            href,
          })),
          'Nenhum ve\u00edculo em manuten\u00e7\u00e3o ou bloqueado.',
        );
      })(),
    );
  if (can('hrCommissions'))
    tasks.push(
      (async () => {
        const count = await db.commissionEntry.count({
          where: { status: { in: ['PENDING', 'RELEASED'] } },
        });
        metric(
          'commissions-pending',
          'Comiss\u00f5es pendentes',
          count,
          'Aguardando libera\u00e7\u00e3o ou pagamento',
          '/dashboard/hr/commissions',
          count ? 'amber' : 'emerald',
        );
      })(),
    );
  for (const screen of ['payables', 'receivables'] as const)
    if (can(screen))
      tasks.push(
        (async () => {
          const href =
            '/dashboard/finance/' +
            (screen === 'payables'
              ? 'accounts-payable'
              : 'accounts-receivable');
          const where = {
            status: {
              notIn: ['PAID', 'CANCELED'] as Array<'PAID' | 'CANCELED'>,
            },
          };
          const due = { ...where, dueDate: { lt: week } };
          const select = {
            id: true,
            description: true,
            dueDate: true,
            status: true,
          } as const;
          const queries =
            screen === 'payables'
              ? ([
                  db.accountsPayable.count({ where }),
                  db.accountsPayable.count({
                    where: { ...where, dueDate: { lt: today } },
                  }),
                  db.accountsPayable.count({
                    where: { ...where, dueDate: { gte: today, lt: week } },
                  }),
                  db.accountsPayable.findMany({
                    where: due,
                    select,
                    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                    take: 5,
                  }),
                ] as const)
              : ([
                  db.accountsReceivable.count({ where }),
                  db.accountsReceivable.count({
                    where: { ...where, dueDate: { lt: today } },
                  }),
                  db.accountsReceivable.count({
                    where: { ...where, dueDate: { gte: today, lt: week } },
                  }),
                  db.accountsReceivable.findMany({
                    where: due,
                    select,
                    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                    take: 5,
                  }),
                ] as const);
          const [total, late, soon, list] = await Promise.all(queries);
          metric(
            screen,
            screen === 'payables' ? 'Contas a pagar' : 'Contas a receber',
            total,
            'T\u00edtulos abertos, incluindo pagamentos parciais',
            href,
          );
          metric(
            screen + '-overdue',
            screen === 'payables'
              ? 'Pagamentos vencidos'
              : 'Recebimentos vencidos',
            late,
            'T\u00edtulos em aberto com vencimento anterior a hoje',
            href,
            late ? 'rose' : 'emerald',
          );
          metric(
            screen + '-week',
            screen === 'payables'
              ? 'Pagar nos pr\u00f3ximos 7 dias'
              : 'Receber nos pr\u00f3ximos 7 dias',
            soon,
            'Inclui os vencimentos de hoje',
            href,
            soon ? 'amber' : 'emerald',
          );
          section(
            screen,
            screen === 'payables'
              ? 'Agenda de pagamentos'
              : 'Agenda de recebimentos',
            'Vencidos primeiro, seguidos dos vencimentos de hoje e dos pr\u00f3ximos 7 dias.',
            late + soon,
            href,
            list.map((r) => ({
              id: r.id,
              title: r.description,
              dueAt: r.dueDate,
              status: r.dueDate < today ? 'OVERDUE' : r.status,
              tone: r.dueDate < today ? 'rose' : 'amber',
              href,
            })),
            'Nenhum t\u00edtulo vencido ou a vencer neste per\u00edodo.',
          );
        })(),
      );
  if (can('reconciliation') && can('bankMovements'))
    tasks.push(
      (async () => {
        const href = '/dashboard/finance/reconciliation',
          where: Prisma.BankMovementWhereInput = {
            status: 'POSTED',
            reconciledAt: null,
          };
        const [total, list] = await Promise.all([
          db.bankMovement.count({ where }),
          db.bankMovement.findMany({
            where,
            select: { id: true, description: true, movementDate: true },
            orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        metric(
          'unreconciled',
          'Movimenta\u00e7\u00f5es sem conciliar',
          total,
          'Lan\u00e7amentos efetivos ainda sem concilia\u00e7\u00e3o',
          href,
          total ? 'amber' : 'emerald',
        );
        section(
          'reconciliation',
          'Concilia\u00e7\u00e3o pendente',
          'Movimenta\u00e7\u00f5es efetivas, sem incluir estornos.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.description,
            dueAt: r.movementDate,
            status: 'UNRECONCILED',
            href,
          })),
          'Nenhuma movimenta\u00e7\u00e3o pendente de concilia\u00e7\u00e3o.',
        );
      })(),
    );
  if (can('purchases', 'validateInvoice'))
    tasks.push(
      (async () => {
        const where = { status: 'DRAFT' };
        const [total, list] = await Promise.all([
          db.procurementInvoice.count({ where }),
          db.procurementInvoice.findMany({
            where,
            select: { id: true, number: true, orderId: true, issueDate: true },
            orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        const href = '/dashboard/purchase-orders';
        metric(
          'invoices-review',
          'Notas para validar',
          total,
          'Documentos de compra ainda n\u00e3o validados',
          href,
          total ? 'amber' : 'emerald',
        );
        section(
          'invoices',
          'Valida\u00e7\u00e3o de notas de compra',
          'Confer\u00eancia antes da gera\u00e7\u00e3o dos t\u00edtulos financeiros.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: 'Nota ' + r.number,
            dueAt: r.issueDate,
            status: 'DRAFT',
            href: href + '/' + r.orderId,
          })),
          'Nenhuma nota aguardando valida\u00e7\u00e3o.',
        );
      })(),
    );
  if (can('purchaseQuotations'))
    tasks.push(
      (async () => {
        const href = '/dashboard/purchase-orders/quotations',
          where = { status: { notIn: ['ORDERED', 'CANCELED'] } };
        const [total, list] = await Promise.all([
          db.procurementQuote.count({ where }),
          db.procurementQuote.findMany({
            where,
            select: { id: true, code: true, title: true, status: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        metric(
          'quotes',
          'Cota\u00e7\u00f5es em andamento',
          total,
          'Negocia\u00e7\u00f5es e aprova\u00e7\u00f5es pendentes',
          href,
        );
        section(
          'quotes',
          'Cota\u00e7\u00f5es e aprova\u00e7\u00f5es',
          'Negocia\u00e7\u00f5es ainda n\u00e3o convertidas em pedidos.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.code,
            subtitle: r.title,
            status: r.status,
            href: href + '/' + r.id,
          })),
          'Nenhuma cota\u00e7\u00e3o em andamento.',
        );
        const approval = await db.procurementQuote.count({
          where: { status: 'AWAITING_APPROVAL' },
        });
        metric(
          'quotes-approval',
          'Cota\u00e7\u00f5es aguardando aprova\u00e7\u00e3o',
          approval,
          'Acompanhe as decis\u00f5es antes de emitir o pedido',
          href,
          approval ? 'amber' : 'emerald',
        );
      })(),
    );
  if (can('purchases', 'send'))
    tasks.push(
      (async () => {
        const total = await db.purchaseOrder.count({
          where: { status: 'DRAFT' },
        });
        metric(
          'purchase-drafts',
          'Pedidos em prepara\u00e7\u00e3o',
          total,
          'Rascunhos que ainda precisam de confer\u00eancia e envio',
          '/dashboard/purchase-orders',
          total ? 'amber' : 'emerald',
        );
      })(),
    );
  if ((fieldWork || executive) && can('orders'))
    tasks.push(
      (async () => {
        const own = actor.role === 'TECHNICIAN';
        const base: Prisma.MaintenanceOrderWhereInput = {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          ...(own ? { technician: { userId: actor.sub } } : {}),
        };
        const scheduled = {
          ...base,
          scheduledTo: { gte: dayStart, lt: dayEnd },
        };
        const past = { ...base, scheduledTo: { lt: dayStart } };
        const [todayCount, overdue, list] = await Promise.all([
          db.maintenanceOrder.count({ where: scheduled }),
          db.maintenanceOrder.count({ where: past }),
          db.maintenanceOrder.findMany({
            where: { ...base, scheduledTo: { lt: dayEnd } },
            select: { id: true, title: true, status: true, scheduledTo: true },
            orderBy: [{ scheduledTo: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        const href =
          own && can('technicianPortal')
            ? '/dashboard/tecnico'
            : '/dashboard/orders';
        metric(
          'orders-today',
          own ? 'Meus atendimentos de hoje' : 'Atendimentos de hoje',
          todayCount,
          'O.S. ativas programadas para hoje, no hor\u00e1rio de Bras\u00edlia',
          href,
        );
        metric(
          'orders-overdue',
          'Programa\u00e7\u00e3o passada',
          overdue,
          'O.S. ainda ativas com programa\u00e7\u00e3o anterior a hoje',
          href,
          overdue ? 'rose' : 'emerald',
        );
        section(
          'programming',
          own
            ? 'Minha agenda e pend\u00eancias'
            : 'Agenda e pend\u00eancias da opera\u00e7\u00e3o',
          'Programa\u00e7\u00e3o passada e atendimentos de hoje. Reprograme ou conclua conforme o andamento real.',
          todayCount + overdue,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.title,
            dueAt: r.scheduledTo,
            status: r.status,
            href:
              href + (href === '/dashboard/tecnico' ? '/ordens/' : '/') + r.id,
          })),
          'Nenhum atendimento de hoje ou programa\u00e7\u00e3o passada.',
        );
        if (!own && can('dispatch')) {
          const [unassigned, unscheduled] = await Promise.all([
            db.maintenanceOrder.count({
              where: { ...base, technicianId: null },
            }),
            db.maintenanceOrder.count({
              where: { ...base, scheduledTo: null },
            }),
          ]);
          metric(
            'orders-unassigned',
            'O.S. sem t\u00e9cnico',
            unassigned,
            'Ordens ativas aguardando distribui\u00e7\u00e3o',
            '/dashboard/dispatch',
            unassigned ? 'amber' : 'emerald',
          );
          metric(
            'orders-unscheduled',
            'O.S. sem programa\u00e7\u00e3o',
            unscheduled,
            'Ordens ativas sem data de atendimento',
            '/dashboard/dispatch',
            unscheduled ? 'amber' : 'emerald',
          );
        }
      })(),
    );
  if ((fieldWork || executive) && (can('tickets') || can('tickets', 'viewOwn')))
    tasks.push(
      (async () => {
        const own = actor.role === 'TECHNICIAN' || !can('tickets');
        const scope: Prisma.ServiceTicketWhereInput = own
          ? {
              OR: [
                { assignedToUserId: actor.sub },
                { technician: { userId: actor.sub } },
                { maintenanceOrder: { technician: { userId: actor.sub } } },
              ],
            }
          : {};
        const base: Prisma.ServiceTicketWhereInput = {
          AND: [
            scope,
            {
              status: {
                notIn: ['RESOLVED', 'CLOSED', 'CANCELED', 'CONVERTED_TO_ORDER'],
              },
            },
          ],
        };
        const late: Prisma.ServiceTicketWhereInput = {
          AND: [
            base,
            {
              OR: [
                { firstResponseAt: null, slaResponseDueAt: { lt: now } },
                { resolvedAt: null, slaResolutionDueAt: { lt: now } },
              ],
            },
          ],
        };
        const [total, overdue, list] = await Promise.all([
          db.serviceTicket.count({ where: base }),
          db.serviceTicket.count({ where: late }),
          db.serviceTicket.findMany({
            where: base,
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              slaResolutionDueAt: true,
            },
            orderBy: [
              { slaResolutionDueAt: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'asc' },
            ],
            take: 5,
          }),
        ]);
        const href = own
          ? can('technicianPortal')
            ? '/dashboard/tecnico'
            : ''
          : '/dashboard/atendimento';
        metric(
          'tickets-active',
          own ? 'Meus chamados abertos' : 'Chamados abertos',
          total,
          'Atendimentos que ainda precisam de acompanhamento',
          href,
        );
        metric(
          'tickets-overdue',
          'Chamados com prazo vencido',
          overdue,
          'SLA de primeira resposta ou solu\u00e7\u00e3o vencido',
          href,
          overdue ? 'rose' : 'emerald',
        );
        section(
          'tickets',
          own ? 'Meus chamados' : 'Fila de atendimento',
          'Chamados ativos no escopo permitido para seu usu\u00e1rio.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.code,
            subtitle: r.title,
            status: r.status,
            dueAt: r.slaResolutionDueAt,
            href: own ? href : href + '/' + r.id,
          })),
          'Nenhum chamado ativo nesta vis\u00e3o.',
        );
      })(),
    );
  if ((fieldWork || executive) && can('serviceReports'))
    tasks.push(
      (async () => {
        const where: Prisma.ServiceReportWhereInput = {
          status: { in: ['DRAFT', 'IN_REVIEW'] },
          ...(actor.role === 'TECHNICIAN'
            ? { technician: { userId: actor.sub } }
            : {}),
        };
        const [total, list] = await Promise.all([
          db.serviceReport.count({ where }),
          db.serviceReport.findMany({
            where,
            select: { id: true, code: true, title: true, status: true },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: 5,
          }),
        ]);
        const href = '/dashboard/relatorios-tecnicos';
        metric(
          'reports-pending',
          'Laudos pendentes',
          total,
          'Rascunhos e laudos em revis\u00e3o',
          href,
          total ? 'amber' : 'emerald',
        );
        section(
          'reports',
          'Laudos para concluir',
          'Documentos em elabora\u00e7\u00e3o ou revis\u00e3o, respeitando a atribui\u00e7\u00e3o do t\u00e9cnico.',
          total,
          href,
          list.map((r) => ({
            id: r.id,
            title: r.code,
            subtitle: r.title,
            status: r.status,
            href: href + '/' + r.id,
          })),
          'Nenhum laudo pendente nesta vis\u00e3o.',
        );
      })(),
    );
  await Promise.all(tasks);
  return { metrics, sections };
}
