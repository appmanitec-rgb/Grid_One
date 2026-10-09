import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TeamService } from './team.service';
import { DatabaseService } from '../../database/database.service';

describe('private team channels', () => {
  const user = {
    id: 'u1',
    name: 'Ana',
    role: UserRole.NORMAL,
    isActive: true,
    isSystemMaster: false,
  };
  const db = {
    user: { findUnique: jest.fn(), count: jest.fn() },
    teamChannel: { findUnique: jest.fn(), create: jest.fn() },
    teamChannelMember: { findUnique: jest.fn() },
    teamMessage: { findMany: jest.fn() },
  };
  const service = new TeamService(db as unknown as DatabaseService);

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue(user);
    db.teamChannel.findUnique.mockResolvedValue({
      id: 'c1',
      isPrivate: true,
      isArchived: false,
    });
    db.teamChannelMember.findUnique.mockResolvedValue(null);
  });

  it('denies a nonmember access to private messages', async () => {
    await expect(service.messages('u1', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.teamMessage.findMany).not.toHaveBeenCalled();
  });

  it('denies clients even when they know a channel id', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, role: UserRole.CLIENT });
    await expect(service.messages('u1', 'c1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.teamChannel.findUnique).not.toHaveBeenCalled();
  });

  it('lets an internal user create a channel restricted to selected people', async () => {
    db.teamChannel.findUnique.mockResolvedValue(null);
    db.user.count.mockResolvedValue(1);
    db.teamChannel.create.mockResolvedValue({ id: 'new' });
    await service.createChannel('u1', 'Projeto', '', ['u2']);
    expect(db.teamChannel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isPrivate: true,
        members: { create: [{ userId: 'u1' }, { userId: 'u2' }] },
      }),
    });
  });

  it('keeps public channel creation restricted to managers', async () => {
    await expect(service.createChannel('u1', 'Público')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.teamChannel.create).not.toHaveBeenCalled();
  });
});
