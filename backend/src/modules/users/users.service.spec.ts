import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    technician: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditLogsService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      technician: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
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

  it('creates the user and operational technician profile atomically', async () => {
    const createdUser = {
      id: 'technician-user',
      name: 'Tecnico Integrado',
      email: 'tecnico@manitec.test',
      role: UserRole.TECHNICIAN,
      managerId: null,
    };
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.technician.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(createdUser);
    prisma.technician.create.mockResolvedValue({ id: 'technician-profile' });

    const result = await service.create({
      name: 'Tecnico Integrado',
      email: 'TECNICO@MANITEC.TEST',
      password: 'senha123',
      role: UserRole.TECHNICIAN,
      technicianProfile: {
        cpf: '123.456.789-01',
        phone: ' (11) 99999-9999 ',
        skills: ['Geradores', ' Geradores ', 'Eletrica'],
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'tecnico@manitec.test',
          role: UserRole.TECHNICIAN,
        }),
      }),
    );
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty(
      'technicianProfile',
    );
    expect(prisma.technician.create).toHaveBeenCalledWith({
      data: {
        userId: 'technician-user',
        cpf: '12345678901',
        phone: '(11) 99999-9999',
        skills: ['Geradores', 'Eletrica'],
      },
    });
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'technician-user',
        action: 'CREATE',
      }),
      prisma,
    );
    expect(result).toEqual(expect.objectContaining(createdUser));
  });

  it('does not create an incomplete technician user', async () => {
    await expect(
      service.create({
        name: 'Tecnico Incompleto',
        email: 'incompleto@manitec.test',
        password: 'senha123',
        role: UserRole.TECHNICIAN,
      }),
    ).rejects.toThrow('Informe CPF e telefone');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('blocks sensitive people fields when actor lacks people.manageSensitive', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'target-user',
        role: UserRole.TECHNICIAN,
        accessPolicy: null,
        isSystemMaster: false,
        linkedClientId: null,
      })
      .mockResolvedValueOnce({
        role: UserRole.AUDITOR,
        isSystemMaster: false,
        accessPolicy: {
          people: { view: true, viewSensitive: false, manageSensitive: false },
        },
      });

    await expect(
      service.update(
        'target-user',
        { hourCost: 180 } as Parameters<UsersService['update']>[1],
        'auditor-user',
      ),
    ).rejects.toThrow('dados sensiveis');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows sensitive people fields when actor has people.manageSensitive', async () => {
    const beforeUser = {
      id: 'target-user',
      name: 'Tecnico',
      email: 'tecnico@manitec.test',
      role: UserRole.TECHNICIAN,
      isActive: true,
      isSystemMaster: false,
      accessPolicy: null,
      department: 'Operacao',
      branch: 'Matriz',
      approvalDiscountLimit: null,
      hourCost: 120,
      functionalId: null,
      documentId: null,
      profilePhotoUrl: null,
      managerId: null,
      linkedClientId: null,
      availabilityStatus: 'AVAILABLE',
      availabilityUpdatedAt: null,
      skillLevel: null,
      regionTags: [],
      digitalSignatureUrl: null,
      salesTargetMonthly: null,
      kpiTargetJson: null,
      mfaEnabled: false,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      linkedClient: null,
    };
    const updatedUser = {
      ...beforeUser,
      hourCost: 180,
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    };

    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'target-user',
        role: UserRole.TECHNICIAN,
        accessPolicy: null,
        isSystemMaster: false,
        linkedClientId: null,
      })
      .mockResolvedValueOnce({
        role: UserRole.HR,
        isSystemMaster: false,
        accessPolicy: {
          people: { view: true, viewSensitive: true, manageSensitive: true },
        },
      })
      .mockResolvedValueOnce(beforeUser);
    prisma.user.update.mockResolvedValue(updatedUser);

    const updated = await service.update(
      'target-user',
      { hourCost: 180 } as Parameters<UsersService['update']>[1],
      'hr-user',
    );

    expect(prisma.user.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ hourCost: 180 }),
    );
    expect(updated).toEqual(expect.objectContaining({ hourCost: 180 }));
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'USER',
        entityId: 'target-user',
        action: 'UPDATE',
      }),
    );
  });
});
