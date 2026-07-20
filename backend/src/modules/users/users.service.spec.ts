import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditLogsService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    auditLogsService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: prisma },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a safe self-profile without administrative fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Usuario',
      email: 'usuario@manitec.test',
      role: 'ADMIN',
      department: 'Operacao',
      branch: 'Matriz',
      profilePhotoUrl: null,
      isActive: true,
      mfaEnabled: true,
      availabilityStatus: 'AVAILABLE',
      availabilityUpdatedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const profile = await service.getMyProfile('user-1');
    const call = prisma.user.findUnique.mock.calls[0][0];

    expect(call.select).not.toHaveProperty('hourCost');
    expect(call.select).not.toHaveProperty('approvalDiscountLimit');
    expect(call.select).not.toHaveProperty('accessPolicy');
    expect(profile).not.toHaveProperty('hourCost');
    expect(profile).not.toHaveProperty('approvalDiscountLimit');
  });

  it('ignores administrative fields when updating the own profile', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'old@manitec.test',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      name: 'Novo Nome',
      email: 'novo@manitec.test',
      role: 'ADMIN',
      department: 'Operacao',
      branch: 'Matriz',
      profilePhotoUrl: null,
      isActive: true,
      mfaEnabled: true,
      availabilityStatus: 'AVAILABLE',
      availabilityUpdatedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    const payload = {
      name: 'Novo Nome',
      email: 'novo@manitec.test',
      hourCost: 500,
      approvalDiscountLimit: 90,
      role: 'FINANCE',
      accessPolicy: { finance: { view: true } },
    } as unknown as Parameters<UsersService['updateMyProfile']>[1];

    const updated = await service.updateMyProfile('user-1', payload);
    const updateCall = prisma.user.update.mock.calls[0][0];

    expect(updateCall.data).toEqual(
      expect.objectContaining({
        name: 'Novo Nome',
        email: 'novo@manitec.test',
      }),
    );
    expect(updateCall.data).not.toHaveProperty('hourCost');
    expect(updateCall.data).not.toHaveProperty('approvalDiscountLimit');
    expect(updateCall.data).not.toHaveProperty('role');
    expect(updateCall.data).not.toHaveProperty('accessPolicy');
    expect(updated).not.toHaveProperty('hourCost');
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'USER',
        entityId: 'user-1',
        action: 'UPDATE_SELF',
      }),
    );
  });
});
