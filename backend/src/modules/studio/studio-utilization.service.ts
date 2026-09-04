import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { readdir, stat, statfs } from 'fs/promises';
import { cpus, freemem, loadavg, totalmem } from 'os';
import { join, resolve } from 'path';
import { DatabaseService } from '../../database/database.service';
import { StudioHeartbeatDto } from './dto/studio-heartbeat.dto';

type SessionActor = { sub?: string };

@Injectable()
export class StudioUtilizationService {
  private storageCache: { at: number; bytes: number } | null = null;
  private previousCpu = process.cpuUsage();
  private previousCpuAt = process.hrtime.bigint();

  constructor(
    private readonly prisma: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async heartbeat(
    actor: SessionActor,
    dto: StudioHeartbeatDto,
    metadata: { ip?: string; userAgent?: string },
  ) {
    if (!actor.sub) return { accepted: false };
    const now = new Date();
    await this.prisma.userSessionActivity.upsert({
      where: {
        userId_sessionId: { userId: actor.sub, sessionId: dto.sessionId },
      },
      create: {
        userId: actor.sub,
        sessionId: dto.sessionId,
        currentPath: dto.currentPath,
        source: dto.source,
        visible: dto.visible ?? true,
        ipAddress: metadata.ip?.slice(0, 80),
        userAgent: metadata.userAgent?.slice(0, 500),
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        currentPath: dto.currentPath,
        source: dto.source,
        visible: dto.visible ?? true,
        ipAddress: metadata.ip?.slice(0, 80),
        userAgent: metadata.userAgent?.slice(0, 500),
        lastSeenAt: now,
        requestCount: { increment: 1 },
      },
    });
    return { accepted: true, recordedAt: now.toISOString() };
  }

  async overview(inputDays?: number) {
    const days = [7, 14, 30].includes(Number(inputDays)) ? Number(inputDays) : 14;
    const now = new Date();
    const onlineSince = new Date(now.getTime() - 5 * 60_000);
    const periodStart = new Date(now.getTime() - days * 86_400_000);

    const [
      sessions,
      activeUsers,
      actionGroups,
      domainGroups,
      documentGroups,
      evidenceGroups,
      actionTrendRows,
      databaseSizeRows,
      storage,
    ] = await Promise.all([
      this.prisma.userSessionActivity.findMany({
        where: { lastSeenAt: { gte: onlineSince } },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
              linkedClient: { select: { companyName: true, tradeName: true } },
            },
          },
        },
        orderBy: { lastSeenAt: 'desc' },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      this.prisma.systemAuditLog.groupBy({
        by: ['actorUserId'],
        where: { actorUserId: { not: null }, createdAt: { gte: periodStart } },
        _count: { _all: true },
      }),
      this.prisma.systemAuditLog.groupBy({
        by: ['domain'],
        where: { createdAt: { gte: periodStart } },
        _count: { _all: true },
        orderBy: { _count: { domain: 'desc' } },
      }),
      this.prisma.documentDelivery.groupBy({
        by: ['createdByUserId'],
        where: { createdByUserId: { not: null }, sizeBytes: { not: null } },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      this.prisma.serviceReportEvidence.groupBy({
        by: ['uploadedByUserId'],
        where: {
          uploadedByUserId: { not: null },
          sizeBytes: { not: null },
          deletedAt: null,
        },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ day: string; total: number }>>(Prisma.sql`
        SELECT
          date_trunc('day', "createdAt" AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,
          COUNT(*)::int AS total
        FROM "system_audit_logs"
        WHERE "createdAt" >= ${periodStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      this.prisma.$queryRaw<Array<{ bytes: string }>>(Prisma.sql`
        SELECT pg_database_size(current_database())::text AS bytes
      `),
      this.storageStatus(),
    ]);

    const userIds = new Set<string>();
    sessions.forEach((item) => userIds.add(item.userId));
    actionGroups.forEach((item) => item.actorUserId && userIds.add(item.actorUserId));
    documentGroups.forEach((item) => item.createdByUserId && userIds.add(item.createdByUserId));
    evidenceGroups.forEach((item) => item.uploadedByUserId && userIds.add(item.uploadedByUserId));
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            linkedClient: { select: { companyName: true, tradeName: true } },
          },
        })
      : [];

    const actionsByUser = new Map(
      actionGroups.map((item) => [item.actorUserId, item._count._all]),
    );
    const documentByUser = new Map(
      documentGroups.map((item) => [
        item.createdByUserId,
        { bytes: Number(item._sum.sizeBytes || 0), files: item._count._all },
      ]),
    );
    const evidenceByUser = new Map(
      evidenceGroups.map((item) => [
        item.uploadedByUserId,
        { bytes: Number(item._sum.sizeBytes || 0), files: item._count._all },
      ]),
    );
    const sessionsByUser = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const current = sessionsByUser.get(session.userId) || [];
      current.push(session);
      sessionsByUser.set(session.userId, current);
    }

    const memory = process.memoryUsage();
    const onlineSessionCount = Math.max(sessions.length, 1);
    const userRows = users
      .map((user) => {
        const currentSessions = sessionsByUser.get(user.id) || [];
        const documents = documentByUser.get(user.id) || { bytes: 0, files: 0 };
        const evidences = evidenceByUser.get(user.id) || { bytes: 0, files: 0 };
        const sessionWeight = currentSessions.length / onlineSessionCount;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          company:
            user.linkedClient?.tradeName || user.linkedClient?.companyName || null,
          online: currentSessions.length > 0,
          sessions: currentSessions.length,
          visibleSessions: currentSessions.filter((item) => item.visible).length,
          currentPath: currentSessions[0]?.currentPath || null,
          lastSeenAt: currentSessions[0]?.lastSeenAt.toISOString() || null,
          actions: actionsByUser.get(user.id) || 0,
          files: documents.files + evidences.files,
          storageBytes: documents.bytes + evidences.bytes,
          estimatedRamBytes: Math.round(memory.rss * sessionWeight),
        };
      })
      .sort((left, right) =>
        left.online === right.online
          ? right.actions - left.actions
          : Number(right.online) - Number(left.online),
      );

    const internalRoles = new Set<UserRole>(
      Object.values(UserRole).filter((role) => role !== UserRole.CLIENT),
    );
    const registeredClients = activeUsers
      .filter((item) => item.role === UserRole.CLIENT)
      .reduce((total, item) => total + item._count._all, 0);
    const registeredInternal = activeUsers
      .filter((item) => internalRoles.has(item.role))
      .reduce((total, item) => total + item._count._all, 0);
    const systemMemoryTotal = totalmem();
    const systemMemoryFree = freemem();

    return {
      generatedAt: now.toISOString(),
      periodDays: days,
      onlineWindowMinutes: 5,
      summary: {
        onlineUsers: new Set(sessions.map((item) => item.userId)).size,
        onlineSessions: sessions.length,
        internalOnline: new Set(
          sessions.filter((item) => item.user.role !== UserRole.CLIENT).map((item) => item.userId),
        ).size,
        clientOnline: new Set(
          sessions.filter((item) => item.user.role === UserRole.CLIENT).map((item) => item.userId),
        ).size,
        registeredInternal,
        registeredClients,
        actions: actionGroups.reduce((total, item) => total + item._count._all, 0),
        attributedStorageBytes: userRows.reduce((total, item) => total + item.storageBytes, 0),
      },
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        cpuCount: cpus().length,
        processCpuPercent: this.processCpuPercent(),
        loadAverage: loadavg().map((value) => Number(value.toFixed(2))),
        processRssBytes: memory.rss,
        processHeapUsedBytes: memory.heapUsed,
        processHeapTotalBytes: memory.heapTotal,
        systemMemoryTotalBytes: systemMemoryTotal,
        systemMemoryUsedBytes: systemMemoryTotal - systemMemoryFree,
        systemMemoryPercent: Number(
          (((systemMemoryTotal - systemMemoryFree) / systemMemoryTotal) * 100).toFixed(1),
        ),
        databaseBytes: Number(databaseSizeRows[0]?.bytes || 0),
        storage,
      },
      activityTrend: this.fillTrend(days, actionTrendRows),
      domains: domainGroups.slice(0, 8).map((item) => ({
        domain: item.domain,
        actions: item._count._all,
      })),
      users: userRows,
      notes: {
        online: 'Uma sessao e considerada conectada quando envia atividade nos ultimos 5 minutos.',
        memory:
          'RAM por usuario e uma estimativa proporcional das sessoes ativas. Node.js, banco e cache compartilham memoria entre todos.',
        storage:
          'Armazenamento por usuario soma documentos gerados e evidencias enviadas com autoria registrada.',
      },
    };
  }

  private processCpuPercent() {
    const nextCpu = process.cpuUsage();
    const nextAt = process.hrtime.bigint();
    const elapsedMicros = Number(nextAt - this.previousCpuAt) / 1000;
    const usedMicros =
      nextCpu.user - this.previousCpu.user + nextCpu.system - this.previousCpu.system;
    this.previousCpu = nextCpu;
    this.previousCpuAt = nextAt;
    if (elapsedMicros <= 0) return 0;
    return Number(Math.min(100, (usedMicros / elapsedMicros) * 100).toFixed(1));
  }

  private fillTrend(days: number, rows: Array<{ day: string; total: number }>) {
    const values = new Map(rows.map((row) => [row.day, Number(row.total)]));
    return Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (days - index - 1));
      const day = date.toISOString().slice(0, 10);
      return { day, actions: values.get(day) || 0 };
    });
  }

  private async storageStatus() {
    const driver = (this.config.get<string>('FILE_STORAGE_DRIVER') || 'local').toLowerCase();
    if (driver !== 'local') {
      return { driver, external: true, usedBytes: null, diskTotalBytes: null, diskFreeBytes: null };
    }
    const root = resolve(
      this.config.get<string>('FILE_STORAGE_LOCAL_PATH') ||
        this.config.get<string>('FILE_STORAGE_DIR') ||
        join(process.cwd(), 'storage', 'private'),
    );
    try {
      const [usedBytes, fileSystem] = await Promise.all([
        this.directorySize(root),
        statfs(root),
      ]);
      return {
        driver,
        external: false,
        usedBytes,
        diskTotalBytes: fileSystem.blocks * fileSystem.bsize,
        diskFreeBytes: fileSystem.bavail * fileSystem.bsize,
      };
    } catch {
      return { driver, external: false, usedBytes: null, diskTotalBytes: null, diskFreeBytes: null };
    }
  }

  private async directorySize(root: string) {
    if (this.storageCache && Date.now() - this.storageCache.at < 60_000) {
      return this.storageCache.bytes;
    }
    const visit = async (path: string): Promise<number> => {
      const entries = await readdir(path, { withFileTypes: true });
      const sizes = await Promise.all(
        entries.map(async (entry) => {
          const child = join(path, entry.name);
          if (entry.isDirectory()) return visit(child);
          if (!entry.isFile()) return 0;
          return (await stat(child)).size;
        }),
      );
      return sizes.reduce((total, size) => total + size, 0);
    };
    const bytes = await visit(root);
    this.storageCache = { at: Date.now(), bytes };
    return bytes;
  }
}
