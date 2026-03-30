import { Injectable } from '@nestjs/common';
import { AuditDomain, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

type RecordAuditInput = {
  domain: AuditDomain;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: string;
  beforePayload?: Prisma.InputJsonValue;
  afterPayload?: Prisma.InputJsonValue;
  reason?: string;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: DatabaseService) {}

  async list(filters: {
    domain?: AuditDomain;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    return this.prisma.systemAuditLog.findMany({
      where: {
        domain: filters.domain,
        entityType: filters.entityType,
        entityId: filters.entityId,
        actorUserId: filters.actorUserId,
        createdAt:
          filters.from || filters.to
            ? {
                gte: filters.from,
                lte: filters.to,
              }
            : undefined,
      },
      include: {
        actorUser: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 200,
    });
  }

  async record(input: RecordAuditInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.systemAuditLog.create({
      data: {
        domain: input.domain,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        beforePayload: input.beforePayload,
        afterPayload: input.afterPayload,
        reason: input.reason,
      },
    });
  }
}
