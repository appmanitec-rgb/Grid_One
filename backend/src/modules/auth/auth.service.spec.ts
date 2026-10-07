import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

type RefreshSessionRunner = (
  userId: string,
  device?: {
    deviceId?: string;
    deviceName?: string;
  },
) => Promise<{ refreshToken: string; expiresAt: Date } | null>;

function getRefreshSessionRunner(service: AuthService): RefreshSessionRunner {
  const internalMethod = Reflect.get(
    service as object,
    'createOrRotateRefreshSession',
  ) as RefreshSessionRunner | undefined;

  if (!internalMethod) {
    throw new Error(
      'Metodo interno createOrRotateRefreshSession indisponivel.',
    );
  }

  return (userId, device) => internalMethod.call(service, userId, device);
}

describe('AuthService', () => {
  let service: AuthService;
  let database: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    clientPortalActivation: { findUnique: jest.Mock; updateMany: jest.Mock };
    systemAuditLog: { create: jest.Mock };
    $transaction: jest.Mock;
    authSession: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  function makeUniqueError(target: string[]) {
    const error = new Error(
      'Unique constraint failed',
    ) as Prisma.PrismaClientKnownRequestError;
    Object.setPrototypeOf(
      error,
      Prisma.PrismaClientKnownRequestError.prototype,
    );
    Object.assign(error, {
      code: 'P2002',
      clientVersion: '5.21.0',
      meta: { target },
    });
    return error;
  }

  beforeEach(async () => {
    database = {
      user: { findFirst: jest.fn(), update: jest.fn() },
      clientPortalActivation: { findUnique: jest.fn(), updateMany: jest.fn() },
      systemAuditLog: { create: jest.fn() },
      $transaction: jest.fn(),
      authSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: database },
        { provide: JwtService, useValue: {} },
        { provide: MfaService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('keeps client credentials out of the internal login', async () => {
    database.user.findFirst.mockResolvedValue({
      id: 'client-user',
      email: 'cliente@example.com',
      passwordHash: await bcrypt.hash('senha-de-teste', 4),
      role: UserRole.CLIENT,
      linkedClientId: 'client-1',
      isActive: true,
    });

    await expect(
      service.login('cliente@example.com', 'senha-de-teste'),
    ).rejects.toThrow();
  });

  it('keeps staff credentials out of the client login', async () => {
    database.user.findFirst.mockResolvedValue({
      id: 'staff-user',
      email: 'equipe@example.com',
      passwordHash: await bcrypt.hash('senha-de-teste', 4),
      role: UserRole.SALES,
      linkedClientId: null,
      isActive: true,
    });

    await expect(
      service.login(
        'equipe@example.com',
        'senha-de-teste',
        undefined,
        undefined,
        'CLIENT',
      ),
    ).rejects.toThrow();
  });

  it('activates a linked client only once and revokes existing sessions', async () => {
    const activation = {
      id: 'activation-1',
      userId: 'client-user',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { role: UserRole.CLIENT, linkedClientId: 'client-1' },
    };
    database.clientPortalActivation.findUnique.mockResolvedValue(activation);
    database.clientPortalActivation.updateMany.mockResolvedValue({ count: 1 });
    database.$transaction.mockImplementation(
      (callback: (tx: typeof database) => unknown) => callback(database),
    );

    await service.activateClientPortal('a'.repeat(64), 'senha-segura-com-12');

    expect(database.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-user' },
        data: expect.objectContaining({
          isActive: true,
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(database.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'client-user', revokedAt: null },
      }),
    );

    database.clientPortalActivation.findUnique.mockResolvedValue({
      ...activation,
      usedAt: new Date(),
    });
    await expect(
      service.activateClientPortal('a'.repeat(64), 'senha-segura-com-12'),
    ).rejects.toThrow();
  });

  it('returns null when deviceId is missing', async () => {
    const result = await getRefreshSessionRunner(service)('user-1');

    expect(result).toBeNull();
    expect(database.authSession.findUnique).not.toHaveBeenCalled();
    expect(database.authSession.create).not.toHaveBeenCalled();
    expect(database.authSession.update).not.toHaveBeenCalled();
  });

  it('creates a new auth session when none exists for the device', async () => {
    database.authSession.findUnique.mockResolvedValue(null);
    database.authSession.create.mockResolvedValue({ id: 'session-1' });

    const result = await getRefreshSessionRunner(service)('user-1', {
      deviceId: 'device-1',
      deviceName: 'Chrome',
    });

    expect(database.authSession.findUnique).toHaveBeenCalledWith({
      where: {
        userId_deviceId: {
          userId: 'user-1',
          deviceId: 'device-1',
        },
      },
      select: { id: true },
    });
    expect(database.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        deviceId: 'device-1',
        deviceName: 'Chrome',
        lastUsedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
    expect(database.authSession.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      refreshToken: expect.any(String),
      expiresAt: expect.any(Date),
    });
  });

  it('updates the existing auth session when the device is already known', async () => {
    database.authSession.findUnique.mockResolvedValue({ id: 'session-1' });
    database.authSession.update.mockResolvedValue({ id: 'session-1' });

    const result = await getRefreshSessionRunner(service)('user-1', {
      deviceId: 'device-1',
      deviceName: 'Firefox',
    });

    expect(database.authSession.create).not.toHaveBeenCalled();
    expect(database.authSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        deviceName: 'Firefox',
        lastUsedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        revokedAt: null,
      }),
    });
    expect(result).toEqual({
      refreshToken: expect.any(String),
      expiresAt: expect.any(Date),
    });
  });

  it('falls back to update when concurrent creation hits the user-device unique key', async () => {
    database.authSession.findUnique.mockResolvedValue(null);
    database.authSession.create.mockRejectedValue(
      makeUniqueError(['userId', 'deviceId']),
    );
    database.authSession.update.mockResolvedValue({ id: 'session-1' });

    await getRefreshSessionRunner(service)('user-1', {
      deviceId: 'device-1',
      deviceName: 'Edge',
    });

    expect(database.authSession.update).toHaveBeenCalledWith({
      where: {
        userId_deviceId: {
          userId: 'user-1',
          deviceId: 'device-1',
        },
      },
      data: expect.objectContaining({
        deviceName: 'Edge',
        lastUsedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        revokedAt: null,
      }),
    });
  });
});
