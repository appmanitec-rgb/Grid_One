import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { ClientPortalAdminService } from './client-portal-admin.service';
import { UpdateClientPortalPasswordDto } from './dto/update-client-portal-password.dto';

describe('client portal password changes', () => {
  const password = 'NovaSenha!12345';
  type MockDatabase = {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    authSession: { updateMany: jest.Mock };
    clientPortalActivation: { updateMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let db: MockDatabase;
  let audit: { record: jest.Mock };
  let users: UsersService;
  beforeEach(() => {
    db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: UserRole.ADMIN }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          isActive: true,
          isSystemMaster: false,
        }),
        update: jest.fn(),
      },
      authSession: { updateMany: jest.fn() },
      clientPortalActivation: { updateMany: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (tx: MockDatabase) => unknown) =>
        callback(db),
      ),
    };
    audit = { record: jest.fn() };
    users = new UsersService(db as never, audit as never);
  });

  it('hashes the new password, revokes old sessions and never logs credentials', async () => {
    await users.changeClientPortalPassword(
      'client-1',
      'user-1',
      password,
      'admin-1',
    );
    const hash = db.user.update.mock.calls[0][0].data.passwordHash;
    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-1',
          linkedClientId: 'client-1',
          role: UserRole.CLIENT,
        },
      }),
    );
    expect(db.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
    expect(db.clientPortalActivation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }),
    );
    expect(audit.record.mock.calls[0][0].afterPayload).toEqual({
      linkedClientId: 'client-1',
      sessionsRevoked: true,
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(password);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(hash);
  });

  it('rejects an administrator without the security permission', async () => {
    db.user.findUnique.mockResolvedValue({
      role: UserRole.SALES,
      isSystemMaster: false,
      accessPolicy: {},
    });
    await expect(
      users.changeClientPortalPassword(
        'client-1',
        'user-1',
        password,
        'sales-1',
      ),
    ).rejects.toThrow('permissao');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects a user belonging to another client', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(
      users.changeClientPortalPassword(
        'client-2',
        'user-1',
        password,
        'admin-1',
      ),
    ).rejects.toThrow('não pertence');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('preserves inactive account activation rules', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'user-1', isActive: false });
    await expect(
      users.changeClientPortalPassword(
        'client-1',
        'user-1',
        password,
        'admin-1',
      ),
    ).rejects.toThrow('link de ativação');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation without changing the password', async () => {
    const portal = new ClientPortalAdminService(db as never, users);
    await expect(
      portal.changePassword(
        'client-1',
        'user-1',
        { password, confirmPassword: 'OutraSenha!12345' },
        'admin-1',
      ),
    ).rejects.toThrow('confirmação');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('validates minimum length and prevents bcrypt truncation for Unicode passwords', async () => {
    expect(
      await validate(
        plainToInstance(UpdateClientPortalPasswordDto, {
          password,
          confirmPassword: password,
        }),
      ),
    ).toHaveLength(0);
    for (const invalid of ['curta', 'é'.repeat(40)]) {
      expect(
        (
          await validate(
            plainToInstance(UpdateClientPortalPasswordDto, {
              password: invalid,
              confirmPassword: invalid,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
