import { UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { HrAdminService } from './hr-admin.service';

describe('HrAdminService', () => {
  let service: HrAdminService;
  let prisma: {
    user: { findMany: jest.Mock };
    client: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
      client: { findMany: jest.fn() },
    };
    service = new HrAdminService(
      prisma as unknown as DatabaseService,
      { record: jest.fn() } as unknown as AuditLogsService,
    );
  });

  it('does not mix client portal users into collaborator listing', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.listCollaborators();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { not: UserRole.CLIENT } },
        select: expect.not.objectContaining({ hourCost: true }),
      }),
    );
  });

  it('separates internal users, portal users, clients and auditors', async () => {
    const internalUsers = [{ id: 'u-1', role: UserRole.TECHNICIAN }];
    const portalUsers = [{ id: 'u-2', role: UserRole.CLIENT }];
    const clients = [{ id: 'c-1', companyName: 'Cliente A' }];
    const auditors = [{ id: 'u-3', role: UserRole.AUDITOR }];
    prisma.user.findMany
      .mockResolvedValueOnce(internalUsers)
      .mockResolvedValueOnce(portalUsers)
      .mockResolvedValueOnce(auditors);
    prisma.client.findMany.mockResolvedValueOnce(clients);

    const overview = await service.listAgentsOverview({
      role: UserRole.HR,
      accessPolicy: {
        people: { view: true },
      },
    });

    expect(overview.internalUsers).toEqual(internalUsers);
    expect(overview.portalUsers).toEqual(portalUsers);
    expect(overview.clients).toEqual(clients);
    expect(overview.auditors).toEqual(auditors);
    expect(overview.access).toEqual({ canViewSensitivePeople: false });
    expect(overview.summary).toEqual({
      internalUsers: 1,
      systemUsers: 3,
      portalUsers: 1,
      clients: 1,
      auditors: 1,
    });
  });

  it('does not select hourCost for agents without sensitive permission', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u-1', role: UserRole.TECHNICIAN }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.client.findMany.mockResolvedValueOnce([]);

    await service.listAgentsOverview({
      role: UserRole.HR,
      accessPolicy: {
        people: { view: true, viewSensitive: false },
      },
    });

    expect(prisma.user.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'hourCost',
    );
  });

  it('selects hourCost for agents with sensitive permission', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([
        { id: 'u-1', role: UserRole.TECHNICIAN, hourCost: 120 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.client.findMany.mockResolvedValueOnce([]);

    const overview = await service.listAgentsOverview({
      role: UserRole.HR,
      accessPolicy: {
        people: { view: true, viewSensitive: true },
      },
    });

    expect(prisma.user.findMany.mock.calls[0][0].select).toHaveProperty(
      'hourCost',
      true,
    );
    expect(overview.internalUsers[0]).toHaveProperty('hourCost', 120);
    expect(overview.access).toEqual({ canViewSensitivePeople: true });
  });
});
