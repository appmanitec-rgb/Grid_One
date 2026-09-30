import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from './auth.guard';

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
