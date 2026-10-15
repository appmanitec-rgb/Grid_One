import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from './auth.guard';
import { clientCredentialVersion } from './client-credential-version';

describe('AuthGuard current user permissions', () => {
  const request = {
    headers: { authorization: 'Bearer valid-token' },
    path: '/catalogs',
    user: undefined as unknown,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({
      sub: 'user-1',
      role: UserRole.ADMIN,
      accessPolicy: { catalog: { create: true } },
    }),
  };
  const database = {
    user: {
      findUnique: jest.fn(),
    },
    systemAuditLog: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const guard = new AuthGuard(jwt as never, database as never);

  beforeEach(() => {
    request.user = undefined;
    jest.clearAllMocks();
  });

  it('uses the current database role and permissions instead of stale JWT claims', async () => {
    database.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.NORMAL,
      isActive: true,
      isSystemMaster: false,
      accessPolicy: { catalog: { create: false } },
      linkedClientId: null,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request.user as { role: string }).role).toBe(UserRole.NORMAL);
    expect(
      (request.user as { accessPolicy: { catalog: { create: boolean } } })
        .accessPolicy.catalog.create,
    ).toBe(false);
  });

  it('rejects a user deactivated after the token was issued', async () => {
    database.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: false,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe.each([UserRole.CLIENT, UserRole.SALES])(
  'AuthGuard %s password changes',
  (role) => {
    const passwordHash = 'current-client-hash';
    const version = clientCredentialVersion(passwordHash);
    let jwt: { verifyAsync: jest.Mock };
    let db: {
      user: { findUnique: jest.Mock };
      systemAuditLog: { findFirst: jest.Mock };
    };
    let request: { headers: { authorization: string }; path: string };
    let guard: AuthGuard;
    let context: Parameters<AuthGuard['canActivate']>[0];
    beforeEach(() => {
      request = {
        headers: { authorization: 'Bearer token' },
        path: '/customer-portal/me',
      };
      context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as never;
      jwt = {
        verifyAsync: jest.fn().mockResolvedValue({
          sub: 'client-user',
          credentialVersion: version,
        }),
      };
      db = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'client-user',
            role,
            isActive: true,
            passwordHash,
            linkedClient: { portalEnabled: true },
            linkedClientId: 'client-1',
          }),
        },
        systemAuditLog: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      guard = new AuthGuard(jwt as never, db as never);
    });

    it('accepts the token signed for the current client credential', async () => {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(db.systemAuditLog.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a token signed before the password was changed', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'client-user',
        credentialVersion: clientCredentialVersion('old-client-hash'),
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'senha deste acesso',
      );
    });

    it('rejects an MFA challenge token presented as an access token', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'client-user',
        purpose: 'mfa_challenge',
        credentialVersion: version,
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Token de acesso invalido',
      );
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it('preserves existing tokens until a password reset and rejects them afterwards', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'client-user' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      db.systemAuditLog.findFirst.mockResolvedValue({ id: 'reset-event' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'senha deste acesso',
      );
    });
  },
);
