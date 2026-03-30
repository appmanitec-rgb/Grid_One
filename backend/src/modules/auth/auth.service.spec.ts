import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

describe('AuthService', () => {
  let service: AuthService;
  let database: {
    authSession: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  function makeUniqueError(target: string[]) {
    const error = new Error(
      'Unique constraint failed',
    ) as Prisma.PrismaClientKnownRequestError;
    Object.setPrototypeOf(error, Prisma.PrismaClientKnownRequestError.prototype);
    Object.assign(error, {
      code: 'P2002',
      clientVersion: '5.21.0',
      meta: { target },
    });
    return error;
  }

  beforeEach(async () => {
    database = {
      authSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
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

  it('returns null when deviceId is missing', async () => {
    const result = await (service as any).createOrRotateRefreshSession('user-1');

    expect(result).toBeNull();
    expect(database.authSession.findUnique).not.toHaveBeenCalled();
    expect(database.authSession.create).not.toHaveBeenCalled();
    expect(database.authSession.update).not.toHaveBeenCalled();
  });

  it('creates a new auth session when none exists for the device', async () => {
    database.authSession.findUnique.mockResolvedValue(null);
    database.authSession.create.mockResolvedValue({ id: 'session-1' });

    const result = await (service as any).createOrRotateRefreshSession('user-1', {
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

    const result = await (service as any).createOrRotateRefreshSession('user-1', {
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

    await (service as any).createOrRotateRefreshSession('user-1', {
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
