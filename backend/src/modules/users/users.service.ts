import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  AuditDomain,
  ContractInvoiceStatus,
  ContractStatus,
  OrderStatus,
  Prisma,
  ProposalStatus,
  UserAvailabilityStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { effectiveAccessPolicy } from './access-policy';
import { CreateUserCertificationDto } from './dto/create-user-certification.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserSpecialtyDto } from './dto/create-user-specialty.dto';
import { UpdateUserCertificationDto } from './dto/update-user-certification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSpecialtyDto } from './dto/update-user-specialty.dto';
import { UserPresencePingDto } from './dto/user-presence-ping.dto';

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  isSystemMaster: true,
  accessPolicy: true,
  department: true,
  branch: true,
  approvalDiscountLimit: true,
  hourCost: true,
  functionalId: true,
  documentId: true,
  profilePhotoUrl: true,
  managerId: true,
  linkedClientId: true,
  availabilityStatus: true,
  availabilityUpdatedAt: true,
  skillLevel: true,
  regionTags: true,
  digitalSignatureUrl: true,
  salesTargetMonthly: true,
  kpiTargetJson: true,
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
  linkedClient: {
    select: {
      id: true,
      companyName: true,
      tradeName: true,
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(createUserDto: CreateUserDto, actorUserId?: string) {
    const userExists = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
      select: { id: true },
    });
    if (userExists) {
      throw new BadRequestException('Este e-mail ja esta cadastrado.');
    }

    await this.validateManager(createUserDto.managerId, undefined);
    const linkedClientId = await this.validateLinkedClientAccess(
      createUserDto.role,
      createUserDto.linkedClientId,
    );

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const { accessPolicy, role, managerId, kpiTargetJson } = createUserDto;
    const userData = { ...createUserDto } as Partial<CreateUserDto>;
    delete userData.password;
    delete userData.accessPolicy;
    delete userData.role;
    delete userData.managerId;
    delete userData.kpiTargetJson;
    delete userData.linkedClientId;

    const createData: Prisma.UserUncheckedCreateInput = {
      ...(userData as Omit<
        CreateUserDto,
        'password' | 'accessPolicy' | 'role' | 'managerId'
      >),
      role,
      managerId: managerId ?? null,
      linkedClientId,
      availabilityStatus:
        createUserDto.availabilityStatus ?? UserAvailabilityStatus.AVAILABLE,
      regionTags: createUserDto.regionTags || [],
      kpiTargetJson: kpiTargetJson as Prisma.InputJsonValue | undefined,
      accessPolicy: effectiveAccessPolicy(role, accessPolicy) as any,
      passwordHash: hashedPassword,
    };

    const created = await this.prisma.user.create({
      data: createData,
      select: userPublicSelect,
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER',
      entityId: created.id,
      action: 'CREATE',
      actorUserId,
      afterPayload: created as unknown as Prisma.InputJsonValue,
    });

    return this.withManager(created);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: userPublicSelect,
      orderBy: { name: 'asc' },
    });
    return this.attachManagers(users);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });
    if (!user) throw new BadRequestException('Usuario nao encontrado.');
    return this.withManager(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByEmailOrName(identifier: string) {
    const byEmail = await this.prisma.user.findUnique({
      where: { email: identifier },
    });
    if (byEmail) return byEmail;

    return this.prisma.user.findFirst({
      where: {
        name: {
          equals: identifier,
          mode: 'insensitive',
        },
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, actorUserId?: string) {
    const { password, accessPolicy, role, ...updateData } = updateUserDto;
    const currentUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        accessPolicy: true,
        isSystemMaster: true,
        linkedClientId: true,
      },
    });
    if (!currentUser) {
      throw new BadRequestException('Usuario nao encontrado.');
    }
    if (currentUser.isSystemMaster) {
      throw new ForbiddenException('Usuario master nao pode ser editado.');
    }

    await this.validateManager(updateUserDto.managerId, id);
    const targetRole = role ?? currentUser.role;
    const targetLinkedClientId = await this.validateLinkedClientAccess(
      targetRole,
      updateUserDto.linkedClientId !== undefined
        ? updateUserDto.linkedClientId
        : currentUser.linkedClientId,
    );

    const dataToUpdate: Prisma.UserUncheckedUpdateInput = {
      ...(updateData as Prisma.UserUncheckedUpdateInput),
      linkedClientId: targetLinkedClientId,
    };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      dataToUpdate.passwordHash = await bcrypt.hash(password, salt);
    }

    if (role) {
      dataToUpdate.role = role;
    }

    if (accessPolicy || role) {
      dataToUpdate.accessPolicy = effectiveAccessPolicy(
        targetRole,
        accessPolicy ?? currentUser.accessPolicy,
      ) as any;
    }

    if (updateUserDto.regionTags) {
      dataToUpdate.regionTags = updateUserDto.regionTags;
    }

    const before = await this.findOne(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: userPublicSelect,
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER',
      entityId: id,
      action: 'UPDATE',
      actorUserId,
      beforePayload: before as unknown as Prisma.InputJsonValue,
      afterPayload: updated as unknown as Prisma.InputJsonValue,
    });

    return this.withManager(updated);
  }

  async remove(id: string, actorUserId?: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isSystemMaster: true },
    });
    if (!currentUser) {
      throw new BadRequestException('Usuario nao encontrado.');
    }
    if (currentUser.isSystemMaster) {
      throw new ForbiddenException('Usuario master nao pode ser excluido.');
    }

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER',
      entityId: id,
      action: 'DELETE',
      actorUserId,
    });

    return this.prisma.user.delete({ where: { id } });
  }

  async getEffectiveAccessForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        isSystemMaster: true,
        accessPolicy: true,
      },
    });
    if (!user) throw new BadRequestException('Usuario nao encontrado.');

    return {
      ...user,
      accessPolicy: effectiveAccessPolicy(user.role, user.accessPolicy),
    };
  }

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        branch: true,
        profilePhotoUrl: true,
        isActive: true,
        mfaEnabled: true,
        availabilityStatus: true,
        availabilityUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new BadRequestException('Usuario nao encontrado.');

    return user;
  }

  async updateMyProfile(userId: string, updateUserDto: UpdateUserDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!currentUser) throw new BadRequestException('Usuario nao encontrado.');

    const allowed = { ...updateUserDto };
    delete (allowed as Partial<UpdateUserDto>).role;
    delete (allowed as Partial<UpdateUserDto>).isActive;
    delete (allowed as Partial<UpdateUserDto>).accessPolicy;
    delete (allowed as Partial<UpdateUserDto>).mfaEnabled;
    delete (allowed as Partial<UpdateUserDto>).linkedClientId;
    delete (allowed as Partial<UpdateUserDto>).approvalDiscountLimit;
    delete (allowed as Partial<UpdateUserDto>).hourCost;
    delete (allowed as Partial<UpdateUserDto>).functionalId;
    delete (allowed as Partial<UpdateUserDto>).documentId;
    delete (allowed as Partial<UpdateUserDto>).managerId;
    delete (allowed as Partial<UpdateUserDto>).availabilityStatus;
    delete (allowed as Partial<UpdateUserDto>).skillLevel;
    delete (allowed as Partial<UpdateUserDto>).regionTags;
    delete (allowed as Partial<UpdateUserDto>).digitalSignatureUrl;
    delete (allowed as Partial<UpdateUserDto>).salesTargetMonthly;
    delete (allowed as Partial<UpdateUserDto>).kpiTargetJson;

    if (allowed.email && allowed.email !== currentUser.email) {
      const exists = await this.prisma.user.findUnique({
        where: { email: allowed.email },
        select: { id: true },
      });
      if (exists) throw new BadRequestException('Este e-mail ja esta em uso.');
    }

    const dataToUpdate: Prisma.UserUpdateInput = {
      ...(allowed as Prisma.UserUpdateInput),
    };
    if (allowed.password) {
      const salt = await bcrypt.genSalt(10);
      dataToUpdate.passwordHash = await bcrypt.hash(allowed.password, salt);
      delete (dataToUpdate as any).password;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        branch: true,
        profilePhotoUrl: true,
        isActive: true,
        mfaEnabled: true,
        availabilityStatus: true,
        availabilityUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER',
      entityId: userId,
      action: 'UPDATE_SELF',
      actorUserId: userId,
      afterPayload: updated as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }

  async listCertifications(userId: string) {
    await this.ensureUserExists(userId);
    return this.prisma.userCertification.findMany({
      where: { userId },
      orderBy: { validUntil: 'asc' },
    });
  }

  async createCertification(
    userId: string,
    dto: CreateUserCertificationDto,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const created = await this.prisma.userCertification.create({
      data: {
        userId,
        code: dto.code.toUpperCase(),
        issuer: dto.issuer,
        scope: dto.scope,
        validUntil: new Date(dto.validUntil),
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_CERTIFICATION',
      entityId: created.id,
      action: 'CREATE',
      actorUserId,
      afterPayload: created as unknown as Prisma.InputJsonValue,
    });
    return created;
  }

  async updateCertification(
    userId: string,
    certId: string,
    dto: UpdateUserCertificationDto,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const current = await this.prisma.userCertification.findFirst({
      where: { id: certId, userId },
    });
    if (!current) throw new BadRequestException('Certificacao nao encontrada.');

    const updated = await this.prisma.userCertification.update({
      where: { id: certId },
      data: {
        code: dto.code?.toUpperCase(),
        issuer: dto.issuer,
        scope: dto.scope,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_CERTIFICATION',
      entityId: certId,
      action: 'UPDATE',
      actorUserId,
      beforePayload: current as unknown as Prisma.InputJsonValue,
      afterPayload: updated as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }

  async removeCertification(
    userId: string,
    certId: string,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const current = await this.prisma.userCertification.findFirst({
      where: { id: certId, userId },
    });
    if (!current) throw new BadRequestException('Certificacao nao encontrada.');
    const removed = await this.prisma.userCertification.delete({
      where: { id: certId },
    });
    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_CERTIFICATION',
      entityId: certId,
      action: 'DELETE',
      actorUserId,
      beforePayload: current as unknown as Prisma.InputJsonValue,
    });
    return removed;
  }

  async listSpecialties(userId: string) {
    await this.ensureUserExists(userId);
    return this.prisma.userManufacturerSpecialty.findMany({
      where: { userId },
      orderBy: { manufacturer: 'asc' },
    });
  }

  async createSpecialty(
    userId: string,
    dto: CreateUserSpecialtyDto,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const created = await this.prisma.userManufacturerSpecialty.create({
      data: {
        userId,
        manufacturer: dto.manufacturer.trim(),
        level: dto.level,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
      },
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_SPECIALTY',
      entityId: created.id,
      action: 'CREATE',
      actorUserId,
      afterPayload: created as unknown as Prisma.InputJsonValue,
    });
    return created;
  }

  async updateSpecialty(
    userId: string,
    specialtyId: string,
    dto: UpdateUserSpecialtyDto,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const current = await this.prisma.userManufacturerSpecialty.findFirst({
      where: { id: specialtyId, userId },
    });
    if (!current)
      throw new BadRequestException('Especialidade nao encontrada.');

    const updated = await this.prisma.userManufacturerSpecialty.update({
      where: { id: specialtyId },
      data: {
        manufacturer: dto.manufacturer?.trim(),
        level: dto.level,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        notes: dto.notes,
      },
    });

    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_SPECIALTY',
      entityId: specialtyId,
      action: 'UPDATE',
      actorUserId,
      beforePayload: current as unknown as Prisma.InputJsonValue,
      afterPayload: updated as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }

  async removeSpecialty(
    userId: string,
    specialtyId: string,
    actorUserId?: string,
  ) {
    await this.ensureUserExists(userId);
    const current = await this.prisma.userManufacturerSpecialty.findFirst({
      where: { id: specialtyId, userId },
    });
    if (!current)
      throw new BadRequestException('Especialidade nao encontrada.');
    const removed = await this.prisma.userManufacturerSpecialty.delete({
      where: { id: specialtyId },
    });
    await this.auditLogsService.record({
      domain: AuditDomain.USERS,
      entityType: 'USER_SPECIALTY',
      entityId: specialtyId,
      action: 'DELETE',
      actorUserId,
      beforePayload: current as unknown as Prisma.InputJsonValue,
    });
    return removed;
  }

  async pingPresence(userId: string, dto: UserPresencePingDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, availabilityStatus: true },
    });
    if (!user) throw new BadRequestException('Usuario nao encontrado.');

    const presence = await this.prisma.userPresence.create({
      data: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters,
        speedKmh: dto.speedKmh,
        heading: dto.heading,
        batteryLevel: dto.batteryLevel,
        source: dto.source,
      },
    });

    if (user.availabilityStatus === UserAvailabilityStatus.AVAILABLE) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { availabilityUpdatedAt: new Date() },
      });
    }

    return presence;
  }

  async listLivePresence() {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, role: { not: UserRole.CLIENT } },
      select: {
        id: true,
        name: true,
        role: true,
        availabilityStatus: true,
        availabilityUpdatedAt: true,
        regionTags: true,
        skillLevel: true,
        presences: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return rows.map((row) => ({
      ...row,
      latestPresence: row.presences[0] || null,
    }));
  }

  async getOfflineBundle(userId: string) {
    const profile = await this.findOne(userId);
    const effective = await this.getEffectiveAccessForUser(userId);
    const policyHash = createHash('sha256')
      .update(JSON.stringify(effective.accessPolicy))
      .digest('hex');

    const offlineValidUntil = new Date();
    offlineValidUntil.setHours(offlineValidUntil.getHours() + 24);

    return {
      profile,
      accessPolicy: effective.accessPolicy,
      policyHash,
      offlineValidUntil: offlineValidUntil.toISOString(),
    };
  }

  async listCertificationsExpiring(days = 30) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    return this.prisma.userCertification.findMany({
      where: { validUntil: { lte: until } },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  async assertUserIsAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem executar esta acao.',
      );
    }
  }

  async getClientPortalOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        linkedClientId: true,
        linkedClient: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            city: true,
            state: true,
            contactName: true,
            phone: true,
            email: true,
            isDelinquent: true,
            paymentTermDefault: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado.');
    }

    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'Este painel exclusivo e destinado apenas ao portal do cliente.',
      );
    }

    if (!user.linkedClientId || !user.linkedClient) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada. Ajuste o cadastro antes de acessar o portal.',
      );
    }

    const [proposals, contracts, orders, receivables] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { clientId: user.linkedClientId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: {
          generator: {
            select: { id: true, name: true, serialNumber: true },
          },
          generatedContract: {
            select: { id: true, code: true, status: true },
          },
        },
      }),
      this.prisma.serviceContract.findMany({
        where: { clientId: user.linkedClientId },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        include: {
          equipments: {
            include: {
              generator: {
                select: { id: true, name: true, serialNumber: true },
              },
            },
          },
          invoices: {
            where: {
              status: {
                in: [
                  ContractInvoiceStatus.PENDING,
                  ContractInvoiceStatus.OVERDUE,
                ],
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 4,
          },
        },
      }),
      this.prisma.maintenanceOrder.findMany({
        where: {
          generator: {
            clientId: user.linkedClientId,
          },
        },
        orderBy: [{ scheduledTo: 'asc' }, { updatedAt: 'desc' }],
        take: 8,
        include: {
          generator: {
            select: { id: true, name: true, serialNumber: true },
          },
          technician: {
            include: {
              user: {
                select: { id: true, name: true, skillLevel: true },
              },
            },
          },
          contract: {
            select: { id: true, code: true, status: true },
          },
        },
      }),
      this.prisma.accountsReceivable.findMany({
        where: {
          clientId: user.linkedClientId,
          status: { not: AccountsReceivableStatus.CANCELED },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        include: {
          contract: {
            select: { id: true, code: true, status: true },
          },
          maintenanceOrder: {
            select: { id: true, title: true, status: true },
          },
        },
      }),
    ]);

    const activeProposals = proposals.filter((proposal) =>
      (
        [
          ProposalStatus.DRAFT,
          ProposalStatus.BOARD_REVIEW,
          ProposalStatus.REVISION_REQUIRED,
          ProposalStatus.CLIENT_REVIEW,
          ProposalStatus.DISCOUNT_REVIEW,
        ] as ProposalStatus[]
      ).includes(proposal.status),
    );
    const openOrders = orders.filter((order) =>
      ([OrderStatus.OPEN, OrderStatus.IN_PROGRESS] as OrderStatus[]).includes(
        order.status,
      ),
    );
    const activeContracts = contracts.filter(
      (contract) => contract.status === ContractStatus.ACTIVE,
    );
    const overdueReceivables = receivables.filter(
      (entry) => entry.status === AccountsReceivableStatus.OVERDUE,
    );
    const receivableExposure = receivables.reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          Number(entry.netAmount || 0) - Number(entry.paidAmount || 0),
        ),
      0,
    );

    return {
      profile: {
        id: user.id,
        name: user.name,
      },
      client: user.linkedClient,
      stats: {
        activeProposals: activeProposals.length,
        awaitingClientDecision: proposals.filter(
          (proposal) => proposal.status === ProposalStatus.CLIENT_REVIEW,
        ).length,
        activeContracts: activeContracts.length,
        openOrders: openOrders.length,
        overdueReceivables: overdueReceivables.length,
        receivableExposure,
      },
      proposals,
      contracts,
      orders,
      receivables,
    };
  }

  private async validateManager(managerId?: string, userId?: string) {
    if (!managerId) return;
    if (userId && managerId === userId) {
      throw new BadRequestException(
        'O usuario nao pode ser gestor de si mesmo.',
      );
    }
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, isActive: true },
    });
    if (!manager || !manager.isActive) {
      throw new BadRequestException('Gestor direto invalido.');
    }
  }

  private async validateLinkedClientAccess(
    role: UserRole,
    linkedClientId?: string | null,
  ) {
    if (role !== UserRole.CLIENT) {
      return null;
    }

    if (!linkedClientId) {
      throw new BadRequestException(
        'Usuarios do portal do cliente precisam de um cliente vinculado.',
      );
    }

    const client = await this.prisma.client.findUnique({
      where: { id: linkedClientId },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('Cliente vinculado invalido.');
    }

    return linkedClientId;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Usuario nao encontrado.');
  }

  private async attachManagers<T extends { managerId: string | null }>(
    rows: T[],
  ) {
    const managerIds = Array.from(
      new Set(rows.map((row) => row.managerId).filter(Boolean) as string[]),
    );
    if (managerIds.length === 0) {
      return rows.map((row) => ({ ...row, manager: null }));
    }

    const managers = await this.prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const managerMap = new Map(managers.map((item) => [item.id, item]));

    return rows.map((row) => ({
      ...row,
      manager: row.managerId ? managerMap.get(row.managerId) || null : null,
    }));
  }

  private async withManager<T extends { managerId: string | null }>(row: T) {
    const [mapped] = await this.attachManagers([row]);
    return mapped;
  }
}
