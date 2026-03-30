import { Injectable } from '@nestjs/common';
import {
  AutomationRunMode,
  AutomationRunStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

export type AutomationConfigSnapshot = {
  enabled: boolean;
  runOnBoot: boolean;
  hourlyEnabled: boolean;
  timezone: string;
  dailyCron: string;
  hourlyCron: string;
  preventiveDaysAhead: number;
};

@Injectable()
export class AutomationService {
  constructor(private readonly database: DatabaseService) {}

  async markInterruptedRuns() {
    const now = new Date();
    return this.database.automationRun.updateMany({
      where: { status: AutomationRunStatus.RUNNING },
      data: {
        status: AutomationRunStatus.FAILED,
        finishedAt: now,
        durationMs: 0,
        errorMessage: 'Execucao interrompida por reinicio do servico.',
      },
    });
  }

  async createRunningRun(params: {
    mode: AutomationRunMode;
    trigger: string;
    startedAt: Date;
    requestedByUserId?: string;
  }) {
    return this.database.automationRun.create({
      data: {
        mode: params.mode,
        trigger: params.trigger,
        status: AutomationRunStatus.RUNNING,
        startedAt: params.startedAt,
        requestedByUserId: params.requestedByUserId,
      },
    });
  }

  async completeRun(params: {
    runId: string;
    finishedAt: Date;
    durationMs: number;
    summary?: Record<string, unknown>;
  }) {
    return this.database.automationRun.update({
      where: { id: params.runId },
      data: {
        status: AutomationRunStatus.SUCCESS,
        finishedAt: params.finishedAt,
        durationMs: params.durationMs,
        summary: params.summary as Prisma.InputJsonValue | undefined,
        errorMessage: null,
      },
      include: this.runInclude(),
    });
  }

  async failRun(params: {
    runId: string;
    finishedAt: Date;
    durationMs: number;
    errorMessage: string;
    summary?: Record<string, unknown>;
  }) {
    return this.database.automationRun.update({
      where: { id: params.runId },
      data: {
        status: AutomationRunStatus.FAILED,
        finishedAt: params.finishedAt,
        durationMs: params.durationMs,
        summary: params.summary as Prisma.InputJsonValue | undefined,
        errorMessage: params.errorMessage,
      },
      include: this.runInclude(),
    });
  }

  async createSkippedRun(params: {
    mode: AutomationRunMode;
    trigger: string;
    reason: string;
    requestedByUserId?: string;
  }) {
    const now = new Date();
    return this.database.automationRun.create({
      data: {
        mode: params.mode,
        trigger: params.trigger,
        status: AutomationRunStatus.SKIPPED,
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        requestedByUserId: params.requestedByUserId,
        summary: {
          reason: params.reason,
        } as Prisma.InputJsonValue,
      },
      include: this.runInclude(),
    });
  }

  async listRuns(limit = 30) {
    return this.database.automationRun.findMany({
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: this.runInclude(),
    });
  }

  async getStatus(params: {
    config: AutomationConfigSnapshot;
    isRunning: boolean;
  }) {
    const [currentRun, lastRun, lastSuccess, lastFailure, grouped] =
      await Promise.all([
        this.database.automationRun.findFirst({
          where: { status: AutomationRunStatus.RUNNING },
          orderBy: { startedAt: 'desc' },
          include: this.runInclude(),
        }),
        this.database.automationRun.findFirst({
          orderBy: { startedAt: 'desc' },
          include: this.runInclude(),
        }),
        this.database.automationRun.findFirst({
          where: { status: AutomationRunStatus.SUCCESS },
          orderBy: { startedAt: 'desc' },
          include: this.runInclude(),
        }),
        this.database.automationRun.findFirst({
          where: { status: AutomationRunStatus.FAILED },
          orderBy: { startedAt: 'desc' },
          include: this.runInclude(),
        }),
        this.database.automationRun.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ]);

    const totals = {
      total: 0,
      running: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    for (const row of grouped) {
      totals.total += row._count._all;
      if (row.status === AutomationRunStatus.RUNNING) {
        totals.running = row._count._all;
      }
      if (row.status === AutomationRunStatus.SUCCESS) {
        totals.success = row._count._all;
      }
      if (row.status === AutomationRunStatus.FAILED) {
        totals.failed = row._count._all;
      }
      if (row.status === AutomationRunStatus.SKIPPED) {
        totals.skipped = row._count._all;
      }
    }

    return {
      isRunning: params.isRunning,
      config: params.config,
      currentRun,
      lastRun,
      lastSuccess,
      lastFailure,
      totals,
    };
  }

  private runInclude() {
    return {
      requestedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    } as const;
  }
}
