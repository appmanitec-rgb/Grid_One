/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  TicketCategory,
  TicketCommentAuthorType,
  TicketOrigin,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MaintenanceOrdersService } from '../maintenance-orders/maintenance-orders.service';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  let service: TicketsService;
  let db: any;
  let auditLogsService: { record: jest.Mock };
  let maintenanceOrdersService: { createInTransaction: jest.Mock };

  const clientUser = {
    id: 'user-client-a',
    name: 'Cliente A',
    email: 'cliente-a@example.com',
    role: UserRole.CLIENT,
    isActive: true,
    linkedClientId: 'client-a',
    linkedClient: {
      id: 'client-a',
      companyName: 'Cliente A Ltda',
      tradeName: 'Cliente A',
      email: 'contato@clientea.com',
      phone: '11999990000',
      contactName: 'Ana Cliente',
    },
  };

  beforeEach(() => {
    db = createDbMock();
    db.$transaction.mockImplementation((cb: (tx: any) => unknown) => cb(db));
    db.user.findUnique.mockResolvedValue(clientUser);
    db.serviceTicket.findFirst.mockResolvedValue(null);
    db.serviceContract.findFirst.mockResolvedValue(null);
    auditLogsService = { record: jest.fn() };
    maintenanceOrdersService = { createInTransaction: jest.fn() };
    service = new TicketsService(
      db,
      auditLogsService as unknown as AuditLogsService,
      maintenanceOrdersService as unknown as MaintenanceOrdersService,
    );
  });

  it('cliente cria chamado proprio usando linkedClientId', async () => {
    db.generator.findFirst.mockResolvedValue({
      id: 'gen-a',
      name: 'Gerador A',
      currentSiteId: 'site-a',
    });
    db.serviceTicket.create.mockResolvedValue(
      makeTicket({
        id: 'ticket-a',
        clientId: 'client-a',
        generatorId: 'gen-a',
      }),
    );

    const result = await service.createCustomerTicket(
      'user-client-a',
      {
        generatorId: 'gen-a',
        title: 'Falha na partida',
        description: 'Grupo nao parte automaticamente.',
        category: TicketCategory.CORRECTIVE_MAINTENANCE,
        priority: TicketPriority.HIGH,
      },
      { ip: '127.0.0.1' },
    );

    expect(result.id).toBe('ticket-a');
    expect(db.serviceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-a',
          openedByUserId: 'user-client-a',
          origin: TicketOrigin.CUSTOMER_PORTAL,
          generatorId: 'gen-a',
        }),
      }),
    );
  });

  it('cliente nao cria chamado para equipamento de outro cliente', async () => {
    db.generator.findFirst.mockResolvedValue(null);

    await expect(
      service.createCustomerTicket(
        'user-client-a',
        {
          generatorId: 'gen-b',
          title: 'Falha',
          description: 'Outro cliente.',
          category: TicketCategory.CORRECTIVE_MAINTENANCE,
        },
        {},
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('cliente lista apenas chamados do proprio cliente', async () => {
    db.serviceTicket.findMany.mockResolvedValue([
      makeTicket({ id: 'ticket-a' }),
    ]);

    await service.listCustomerTickets('user-client-a');

    expect(db.serviceTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'client-a' }),
      }),
    );
  });

  it('cliente nao acessa chamado de outro cliente', async () => {
    db.serviceTicket.findFirst.mockResolvedValue(null);

    await expect(
      service.getCustomerTicket('user-client-a', 'ticket-b'),
    ).rejects.toThrow(NotFoundException);
  });

  it('cliente nao ve comentario interno nem notas internas', async () => {
    db.serviceTicket.findFirst.mockResolvedValue(
      makeTicket({
        internalNotes: 'Margem e escala interna',
        comments: [
          makeComment({ id: 'c1', customerVisible: false }),
          makeComment({ id: 'c2', customerVisible: true }),
        ],
      }),
    );

    const result = await service.getCustomerTicket('user-client-a', 'ticket-a');

    expect(result.internalNotes).toBeUndefined();
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].id).toBe('c2');
  });

  it('cliente comenta no proprio chamado', async () => {
    db.serviceTicket.findFirst.mockResolvedValue(makeTicket());
    db.serviceTicket.update.mockResolvedValue(
      makeTicket({
        comments: [
          makeComment({ authorType: TicketCommentAuthorType.CUSTOMER }),
        ],
      }),
    );

    await service.addCustomerComment(
      'user-client-a',
      'ticket-a',
      { message: 'Enviei foto pelo e-mail.' },
      { userAgent: 'jest' },
    );

    expect(db.serviceTicketComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorType: TicketCommentAuthorType.CUSTOMER,
          customerVisible: true,
        }),
      }),
    );
  });

  it('comentario do cliente gera auditoria', async () => {
    db.serviceTicket.findFirst.mockResolvedValue(makeTicket());
    db.serviceTicket.update.mockResolvedValue(makeTicket());

    await service.addCustomerComment(
      'user-client-a',
      'ticket-a',
      { message: 'Complemento.' },
      {},
    );

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CUSTOMER_COMMENT' }),
      db,
    );
  });

  it('bloqueia usuario CLIENT sem linkedClientId', async () => {
    db.user.findUnique.mockResolvedValue({
      ...clientUser,
      linkedClientId: null,
      linkedClient: null,
    });

    await expect(service.listCustomerTickets('user-client-a')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('chamado critico calcula SLA padrao de 1h resposta e 8h solucao', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-05T10:00:00.000Z'));
    db.serviceTicket.create.mockImplementation(({ data }: any) => {
      const ticketData = { ...data };
      delete ticketData.comments;
      return Promise.resolve(
        makeTicket({ ...ticketData, id: 'ticket-critical' }),
      );
    });

    await service.createCustomerTicket(
      'user-client-a',
      {
        title: 'Emergencia',
        description: 'Parada total.',
        category: TicketCategory.EMERGENCY,
        priority: TicketPriority.CRITICAL,
      },
      {},
    );

    const data = db.serviceTicket.create.mock.calls[0][0].data;
    expect(data.slaResponseDueAt.toISOString()).toBe(
      '2026-04-05T11:00:00.000Z',
    );
    expect(data.slaResolutionDueAt.toISOString()).toBe(
      '2026-04-05T18:00:00.000Z',
    );
    jest.useRealTimers();
  });

  it('chamado pode ser convertido em OS', async () => {
    db.serviceTicket.findUnique.mockResolvedValue(
      makeTicket({ generatorId: 'gen-a' }),
    );
    db.generator.findFirst.mockResolvedValue({
      id: 'gen-a',
      name: 'Gerador A',
      currentSiteId: 'site-a',
    });
    db.serviceTicket.updateMany.mockResolvedValue({ count: 1 });
    maintenanceOrdersService.createInTransaction.mockResolvedValue({
      id: 'os-1',
    });
    db.serviceTicket.update.mockResolvedValue(
      makeTicket({
        generatorId: 'gen-a',
        maintenanceOrderId: 'os-1',
        status: TicketStatus.CONVERTED_TO_ORDER,
      }),
    );

    const result = await service.convertToOrder(
      'ticket-a',
      {},
      'internal-user',
      {},
    );

    expect(result.maintenanceOrderId).toBe('os-1');
    expect(maintenanceOrdersService.createInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        generatorId: 'gen-a',
      }),
      'internal-user',
    );
  });

  it('chamado cancelado nao pode ser convertido em OS', async () => {
    db.serviceTicket.findUnique.mockResolvedValue(
      makeTicket({ status: TicketStatus.CANCELED }),
    );

    await expect(
      service.convertToOrder('ticket-a', {}, 'internal-user', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('chamado ja convertido nao converte novamente', async () => {
    db.serviceTicket.findUnique.mockResolvedValue(
      makeTicket({
        status: TicketStatus.CONVERTED_TO_ORDER,
        maintenanceOrderId: 'os-1',
      }),
    );

    await expect(
      service.convertToOrder('ticket-a', {}, 'internal-user', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('conversao para OS gera AuditLog', async () => {
    db.serviceTicket.findUnique.mockResolvedValue(
      makeTicket({ generatorId: 'gen-a' }),
    );
    db.generator.findFirst.mockResolvedValue({
      id: 'gen-a',
      name: 'Gerador A',
      currentSiteId: null,
    });
    db.serviceTicket.updateMany.mockResolvedValue({ count: 1 });
    maintenanceOrdersService.createInTransaction.mockResolvedValue({
      id: 'os-1',
    });
    db.serviceTicket.update.mockResolvedValue(
      makeTicket({ maintenanceOrderId: 'os-1' }),
    );

    await service.convertToOrder('ticket-a', {}, 'internal-user', {});

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONVERT_TO_ORDER' }),
      db,
    );
  });

  it('segunda conversao sequencial nao cria outra OS', async () => {
    db.serviceTicket.findUnique
      .mockResolvedValueOnce(makeTicket({ generatorId: 'gen-a' }))
      .mockResolvedValueOnce(
        makeTicket({
          status: TicketStatus.CONVERTED_TO_ORDER,
          maintenanceOrderId: 'os-1',
        }),
      );
    db.generator.findFirst.mockResolvedValue({
      id: 'gen-a',
      name: 'Gerador A',
      currentSiteId: null,
    });
    db.serviceTicket.updateMany.mockResolvedValueOnce({ count: 1 });
    maintenanceOrdersService.createInTransaction.mockResolvedValueOnce({
      id: 'os-1',
    });
    db.serviceTicket.update.mockResolvedValue(
      makeTicket({
        generatorId: 'gen-a',
        maintenanceOrderId: 'os-1',
        status: TicketStatus.CONVERTED_TO_ORDER,
      }),
    );

    await service.convertToOrder('ticket-a', {}, 'internal-user', {});
    await expect(
      service.convertToOrder('ticket-a', {}, 'internal-user', {}),
    ).rejects.toThrow(BadRequestException);

    expect(maintenanceOrdersService.createInTransaction).toHaveBeenCalledTimes(
      1,
    );
  });

  it('falha na criacao da OS nao marca chamado como convertido', async () => {
    db.serviceTicket.findUnique.mockResolvedValue(
      makeTicket({ generatorId: 'gen-a' }),
    );
    db.generator.findFirst.mockResolvedValue({
      id: 'gen-a',
      name: 'Gerador A',
      currentSiteId: null,
    });
    db.serviceTicket.updateMany.mockResolvedValue({ count: 1 });
    maintenanceOrdersService.createInTransaction.mockRejectedValue(
      new Error('falha OS'),
    );

    await expect(
      service.convertToOrder('ticket-a', {}, 'internal-user', {}),
    ).rejects.toThrow('falha OS');

    expect(db.serviceTicket.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.CONVERTED_TO_ORDER,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONVERT_TO_ORDER_FAILED' }),
    );
  });

  it('tecnico lista apenas chamados atribuidos a ele', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'tech-user-1',
      name: 'Tecnico',
      email: 'tech@example.com',
      role: UserRole.TECHNICIAN,
      isActive: true,
      technicianProfile: { id: 'tech-1' },
    });
    db.serviceTicket.findMany.mockResolvedValue([
      makeTicket({ id: 'ticket-own', assignedToUserId: 'tech-user-1' }),
    ]);

    const result = await service.listTechnicianTickets('tech-user-1', {});

    expect(result).toHaveLength(1);
    expect(db.serviceTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { assignedToUserId: 'tech-user-1' },
                { technicianId: 'tech-1' },
                { maintenanceOrder: { technicianId: 'tech-1' } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('tecnico nao comenta chamado de outro tecnico', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'tech-user-1',
      name: 'Tecnico',
      email: 'tech@example.com',
      role: UserRole.TECHNICIAN,
      isActive: true,
      technicianProfile: { id: 'tech-1' },
    });
    db.serviceTicket.findFirst.mockResolvedValue(null);

    await expect(
      service.addTechnicianComment(
        'tech-user-1',
        'ticket-other',
        { message: 'Cheguei ao local.' },
        {},
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('identifica SLA vencido na lista interna', async () => {
    const overdue = makeTicket({
      firstResponseAt: null,
      slaResponseDueAt: new Date('2020-01-01T00:00:00.000Z'),
      slaResolutionDueAt: new Date('2020-01-02T00:00:00.000Z'),
    });
    db.serviceTicket.findMany.mockResolvedValue([overdue]);

    const result = await service.findAll({});

    expect(result[0].slaStatus).toBe('OVERDUE');
    expect(result[0].isResponseOverdue).toBe(true);
  });

  it('pagina chamados internos com busca', async () => {
    db.serviceTicket.findMany.mockResolvedValue([]);

    await service.findAll({ page: 2, pageSize: 25, search: 'motor' });

    expect(db.serviceTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });
});

function createDbMock() {
  return {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
    generator: {
      findFirst: jest.fn(),
    },
    site: {
      findFirst: jest.fn(),
    },
    serviceContract: {
      findFirst: jest.fn(),
    },
    maintenanceOrder: {
      findFirst: jest.fn(),
    },
    technician: {
      findUnique: jest.fn(),
    },
    serviceTicket: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    serviceTicketComment: {
      create: jest.fn(),
    },
  };
}

function makeTicket(overrides: Record<string, any> = {}) {
  return {
    id: 'ticket-a',
    code: 'TCK-000001',
    clientId: 'client-a',
    openedByUserId: 'user-client-a',
    assignedToUserId: null,
    technicianId: null,
    generatorId: null,
    siteId: null,
    contractId: null,
    maintenanceOrderId: null,
    title: 'Falha na partida',
    description: 'Grupo nao parte automaticamente.',
    category: TicketCategory.CORRECTIVE_MAINTENANCE,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    origin: TicketOrigin.CUSTOMER_PORTAL,
    slaResponseDueAt: new Date('2099-01-01T08:00:00.000Z'),
    slaResolutionDueAt: new Date('2099-01-03T08:00:00.000Z'),
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    canceledAt: null,
    customerVisible: true,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    internalNotes: null,
    createdAt: new Date('2026-04-05T10:00:00.000Z'),
    updatedAt: new Date('2026-04-05T10:00:00.000Z'),
    client: {
      id: 'client-a',
      companyName: 'Cliente A Ltda',
      tradeName: 'Cliente A',
      phone: '11999990000',
    },
    generator: null,
    site: null,
    contract: null,
    maintenanceOrder: null,
    openedByUser: {
      id: 'user-client-a',
      name: 'Cliente A',
      email: 'cliente-a@example.com',
      role: UserRole.CLIENT,
    },
    assignedToUser: null,
    technician: null,
    comments: [],
    ...overrides,
  };
}

function makeComment(overrides: Record<string, any> = {}) {
  return {
    id: 'comment-a',
    ticketId: 'ticket-a',
    authorUserId: 'internal-user',
    authorType: TicketCommentAuthorType.INTERNAL,
    message: 'Nota interna.',
    customerVisible: false,
    createdAt: new Date('2026-04-05T11:00:00.000Z'),
    authorUser: {
      id: 'internal-user',
      name: 'Operacao',
      role: UserRole.MANAGER,
    },
    ...overrides,
  };
}
