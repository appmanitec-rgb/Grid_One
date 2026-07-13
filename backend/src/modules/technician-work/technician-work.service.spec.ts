/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  TechnicianWorkSessionStatus,
  TimeEntrySource,
  TimeEntryStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TicketsService } from '../tickets/tickets.service';
import { TechnicianWorkService } from './technician-work.service';

describe('TechnicianWorkService', () => {
  let service: TechnicianWorkService;
  let db: any;
  let auditLogsService: { record: jest.Mock };
  let ticketsService: {
    listTechnicianTickets: jest.Mock;
    addTechnicianComment: jest.Mock;
  };

  beforeEach(() => {
    db = createDbMock();
    db.$transaction.mockImplementation((cb: (tx: any) => unknown) => cb(db));
    db.user.findUnique.mockResolvedValue(makeTechnicianUser());
    auditLogsService = { record: jest.fn() };
    ticketsService = {
      listTechnicianTickets: jest.fn(),
      addTechnicianComment: jest.fn(),
    };
    service = new TechnicianWorkService(
      db as DatabaseService,
      auditLogsService as unknown as AuditLogsService,
      ticketsService as unknown as TicketsService,
    );
  });

  it('lista apenas OS do tecnico autenticado', async () => {
    db.maintenanceOrder.findMany.mockResolvedValue([]);

    await service.listOrders('tech-user-1', { page: 2, pageSize: 10 });

    expect(db.maintenanceOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ technicianId: 'tech-1' }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it('bloqueia area tecnica para usuario nao tecnico', async () => {
    db.user.findUnique.mockResolvedValue({
      ...makeTechnicianUser(),
      role: UserRole.MANAGER,
    });

    await expect(service.listOrders('manager-1', {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('tecnico faz check-in em OS propria', async () => {
    db.maintenanceOrder.findFirst.mockResolvedValue({
      id: 'os-1',
      status: OrderStatus.OPEN,
      startedAt: null,
    });
    db.technicianWorkSession.findFirst.mockResolvedValue(null);
    db.technicianWorkSession.create.mockResolvedValue(makeSession());

    const result = await service.checkIn(
      'tech-user-1',
      'os-1',
      { note: 'No cliente' },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.id).toBe('session-1');
    expect(db.technicianWorkSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maintenanceOrderId: 'os-1',
          technicianId: 'tech-1',
          userId: 'tech-user-1',
          status: TechnicianWorkSessionStatus.OPEN,
          startNote: 'No cliente',
        }),
      }),
    );
    expect(db.maintenanceOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'os-1' },
        data: expect.objectContaining({ status: OrderStatus.IN_PROGRESS }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TECHNICIAN_CHECK_IN' }),
      db,
    );
  });

  it('bloqueia check-in em OS de outro tecnico', async () => {
    db.maintenanceOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.checkIn('tech-user-1', 'os-other', {}, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('bloqueia check-in duplicado na mesma OS', async () => {
    db.maintenanceOrder.findFirst.mockResolvedValue({
      id: 'os-1',
      status: OrderStatus.IN_PROGRESS,
      startedAt: new Date(),
    });
    db.technicianWorkSession.findFirst.mockResolvedValue({ id: 'open-1' });

    await expect(
      service.checkIn('tech-user-1', 'os-1', {}, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('check-out gera TimeEntry rastreavel', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T13:00:00.000Z'));
    db.technicianWorkSession.findFirst.mockResolvedValue(
      makeOpenSessionWithOrder(),
    );
    db.technicianWorkSession.updateMany.mockResolvedValue({ count: 1 });
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.timeEntry.create.mockResolvedValue({ id: 'time-1' });
    db.technicianWorkSession.update.mockResolvedValue(
      makeSession({
        status: TechnicianWorkSessionStatus.CLOSED,
        timeEntryId: 'time-1',
        finishedAt: new Date('2026-07-13T13:00:00.000Z'),
      }),
    );

    const result = await service.checkOut(
      'tech-user-1',
      'os-1',
      { note: 'Finalizado' },
      { ip: '127.0.0.1' },
    );

    expect(result.timeEntryId).toBe('time-1');
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'tech-user-1',
          maintenanceOrderId: 'os-1',
          status: TimeEntryStatus.WORK,
          source: TimeEntrySource.CHECK_IN_OUT,
          workMinutes: 60,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_FROM_WORK_SESSION' }),
      db,
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TECHNICIAN_CHECK_OUT' }),
      db,
    );
    jest.useRealTimers();
  });

  it('bloqueia check-out sem check-in aberto', async () => {
    db.technicianWorkSession.findFirst.mockResolvedValue(null);

    await expect(
      service.checkOut('tech-user-1', 'os-1', {}, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('reprocessamento de sessao nao duplica TimeEntry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T13:00:00.000Z'));
    db.technicianWorkSession.findFirst.mockResolvedValue(
      makeOpenSessionWithOrder(),
    );
    db.technicianWorkSession.updateMany.mockResolvedValue({ count: 1 });
    db.timeEntry.findFirst.mockResolvedValue({ id: 'time-existing' });
    db.technicianWorkSession.update.mockResolvedValue(
      makeSession({
        status: TechnicianWorkSessionStatus.CLOSED,
        timeEntryId: 'time-existing',
      }),
    );

    await service.checkOut('tech-user-1', 'os-1', {}, {});

    expect(db.timeEntry.create).not.toHaveBeenCalled();
    expect(db.technicianWorkSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { timeEntryId: 'time-existing' },
      }),
    );
    jest.useRealTimers();
  });

  it('delega meus chamados ao service seguro de tickets', async () => {
    ticketsService.listTechnicianTickets.mockResolvedValue([]);

    await service.listTickets('tech-user-1', { pageSize: 5 });

    expect(ticketsService.listTechnicianTickets).toHaveBeenCalledWith(
      'tech-user-1',
      { pageSize: 5 },
    );
  });
});

function createDbMock() {
  return {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
    },
    maintenanceOrder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    technicianWorkSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    timeEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    costCenterEntry: {
      create: jest.fn(),
    },
  };
}

function makeTechnicianUser() {
  return {
    id: 'tech-user-1',
    role: UserRole.TECHNICIAN,
    isActive: true,
    technicianProfile: { id: 'tech-1' },
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    maintenanceOrderId: 'os-1',
    technicianId: 'tech-1',
    userId: 'tech-user-1',
    status: TechnicianWorkSessionStatus.OPEN,
    startedAt: new Date('2026-07-13T12:00:00.000Z'),
    finishedAt: null,
    timeEntryId: null,
    createdAt: new Date('2026-07-13T12:00:00.000Z'),
    updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    ...overrides,
  };
}

function makeOpenSessionWithOrder() {
  return {
    ...makeSession(),
    maintenanceOrder: {
      id: 'os-1',
      status: OrderStatus.IN_PROGRESS,
      costCenterId: 'cc-1',
    },
    user: {
      hourCost: 120,
    },
  };
}
