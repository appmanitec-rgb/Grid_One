import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';
import { normalizePortalPermissions } from '../customer-portal/portal-permissions';
import { CreateClientPortalUserDto, UpdateClientPortalDto, UpdateClientPortalUserDto } from './dto/client-portal-admin.dto';

@Injectable()
export class ClientPortalAdminService {
  constructor(private readonly db: DatabaseService, private readonly users: UsersService) {}

  async overview(clientId: string) {
    const client = await this.db.client.findUnique({
      where: { id: clientId },
      select: {
        id: true, companyName: true, portalEnabled: true, portalLogoDataUrl: true,
        portalUsers: {
          where: { role: UserRole.CLIENT },
          select: { id: true, name: true, email: true, isActive: true, portalPermissions: true, createdAt: true },
          orderBy: { name: 'asc' },
        },
        portalFeedbacks: {
          select: { id: true, kind: true, message: true, createdAt: true, user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente nao encontrado.');
    return client;
  }

  async updateSettings(clientId: string, dto: UpdateClientPortalDto) {
    await this.overview(clientId);
    let logoDataUrl: string | null | undefined;
    if (dto.logoDataUrl !== undefined) {
      logoDataUrl = dto.logoDataUrl;
      if (logoDataUrl) {
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logoDataUrl);
        if (!match || logoDataUrl.length > 360000) {
          throw new BadRequestException('Logo invalida. Envie PNG, JPG ou WebP com ate 250 KB.');
        }
        const bytes = Buffer.from(match[2], 'base64');
        const valid =
          (match[1] === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
          (match[1] === 'jpeg' && bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))) ||
          (match[1] === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
        if (!valid || bytes.length > 256000) {
          throw new BadRequestException('Logo invalida. Envie PNG, JPG ou WebP com ate 250 KB.');
        }
      }
    }
    return this.db.client.update({
      where: { id: clientId },
      data: {
        ...(dto.enabled !== undefined ? { portalEnabled: dto.enabled } : {}),
        ...(logoDataUrl !== undefined ? { portalLogoDataUrl: logoDataUrl } : {}),
      },
      select: { id: true, portalEnabled: true, portalLogoDataUrl: true },
    });
  }

  async createUser(clientId: string, dto: CreateClientPortalUserDto, actorId: string) {
    const client = await this.overview(clientId);
    if (!client.portalEnabled) throw new BadRequestException('Habilite a central deste cliente antes de criar usuarios.');
    const user = await this.users.create({
      name: dto.name.trim(), email: dto.email.trim(), role: UserRole.CLIENT,
      linkedClientId: clientId, portalPermissions: normalizePortalPermissions(dto.permissions),
    }, actorId);
    const activation = await this.users.issueClientPortalActivation(user.id, actorId);
    return { user, activation };
  }

  async updateUser(clientId: string, userId: string, dto: UpdateClientPortalUserDto, actorId: string) {
    await this.assertUser(clientId, userId);
    return this.users.update(userId, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.email !== undefined ? { email: dto.email.trim() } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.permissions !== undefined ? { portalPermissions: normalizePortalPermissions(dto.permissions) } : {}),
    }, actorId);
  }

  async activateUser(clientId: string, userId: string, actorId: string) {
    await this.assertUser(clientId, userId);
    return this.users.issueClientPortalActivation(userId, actorId);
  }

  private async assertUser(clientId: string, userId: string) {
    const user = await this.db.user.findFirst({ where: { id: userId, linkedClientId: clientId, role: UserRole.CLIENT }, select: { id: true } });
    if (!user) throw new NotFoundException('Usuario nao pertence a este cliente.');
  }
}
