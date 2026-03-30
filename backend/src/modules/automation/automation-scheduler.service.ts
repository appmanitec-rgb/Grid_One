import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationRunMode } from '@prisma/client';
import { ContractsService } from '../contracts/contracts.service';
import { FinanceService } from '../finance/finance.service';
import {
  AutomationConfigSnapshot,
  AutomationService,
} from './automation.service';

@Injectable()
export class AutomationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private isRunning = false;

  constructor(
    private readonly contractsService: ContractsService,
    private readonly financeService: FinanceService,
    private readonly automationService: AutomationService,
  ) {}

  async onModuleInit() {
    await this.automationService.markInterruptedRuns();

    const config = this.configSnapshot();

    if (!config.enabled) {
      this.logger.warn(
        'Automacao agendada desabilitada por AUTOMATION_ENABLED=false.',
      );
      return;
    }

    this.logger.log(
      `Automacao agendada ativa. Timezone=${config.timezone} | daily=${config.dailyCron} | hourly=${config.hourlyCron}`,
    );

    if (config.runOnBoot) {
      void this.executeFullAutomation('startup');
    }
  }

  @Cron(process.env.AUTOMATION_DAILY_CRON || '0 5 * * *', {
    name: 'automationDaily',
    timeZone: process.env.AUTOMATION_TIMEZONE || 'America/Sao_Paulo',
  })
  async handleDailyAutomation() {
    if (!this.readBoolean('AUTOMATION_ENABLED', true)) return;
    await this.executeFullAutomation('cron:daily');
  }

  @Cron(process.env.AUTOMATION_HOURLY_CRON || '15 * * * *', {
    name: 'automationHourly',
    timeZone: process.env.AUTOMATION_TIMEZONE || 'America/Sao_Paulo',
  })
  async handleHourlyAutomation() {
    if (!this.readBoolean('AUTOMATION_ENABLED', true)) return;
    if (!this.readBoolean('AUTOMATION_HOURLY_ENABLED', true)) return;
    await this.executeLightAutomation('cron:hourly');
  }

  async getStatus() {
    return this.automationService.getStatus({
      config: this.configSnapshot(),
      isRunning: this.isRunning,
    });
  }

  async listRuns(limit = 30) {
    return this.automationService.listRuns(limit);
  }

  async triggerFullAutomation(requestedByUserId?: string) {
    return this.executeFullAutomation('manual:full', requestedByUserId);
  }

  async triggerLightAutomation(requestedByUserId?: string) {
    return this.executeLightAutomation('manual:light', requestedByUserId);
  }

  private async executeFullAutomation(
    trigger: string,
    requestedByUserId?: string,
  ) {
    if (this.isRunning) {
      const skipped = await this.automationService.createSkippedRun({
        mode: AutomationRunMode.FULL,
        trigger,
        requestedByUserId,
        reason: 'already_running',
      });
      this.logger.warn(
        `[${trigger}] Execucao ignorada: automacao ja em andamento.`,
      );
      return {
        status: 'SKIPPED',
        trigger,
        runId: skipped.id,
        reason: 'already_running',
      };
    }

    this.isRunning = true;
    const startedAt = new Date();
    const run = await this.automationService.createRunningRun({
      mode: AutomationRunMode.FULL,
      trigger,
      startedAt,
      requestedByUserId,
    });

    try {
      this.logger.log(`[${trigger}] Iniciando automacao completa.`);

      const delinquency = await this.contractsService.syncDelinquencyStatuses();
      const preventive = await this.contractsService.runPreventiveAutomation(
        this.preventiveDaysAhead(),
      );
      const receivableSync =
        await this.financeService.syncReceivablesFromContractInvoices();
      const receivableOverdue =
        await this.financeService.runReceivableOverdueCron();
      const payableOverdue = await this.financeService.runPayableOverdueCron();
      const preventiveSummary = {
        processedContracts: (preventive as any)?.processedContracts ?? 0,
        totalOrdersCreated: (preventive as any)?.totalOrdersCreated ?? 0,
      };

      const finishedAt = new Date();
      const elapsedMs = finishedAt.getTime() - startedAt.getTime();
      const summary = {
        delinquency,
        preventive: preventiveSummary,
        receivableSync,
        receivableOverdue,
        payableOverdue,
      };
      await this.automationService.completeRun({
        runId: run.id,
        finishedAt,
        durationMs: elapsedMs,
        summary,
      });

      this.logger.log(
        `[${trigger}] Automacao completa finalizada em ${elapsedMs}ms | delinquency=${JSON.stringify(
          delinquency,
        )} | preventive=${JSON.stringify(preventiveSummary)} | receivableSync=${JSON.stringify(
          receivableSync,
        )} | receivableOverdue=${JSON.stringify(
          receivableOverdue,
        )} | payableOverdue=${JSON.stringify(payableOverdue)}`,
      );
      return {
        status: 'SUCCESS',
        trigger,
        runId: run.id,
        durationMs: elapsedMs,
        summary,
      };
    } catch (error: any) {
      const finishedAt = new Date();
      const elapsedMs = finishedAt.getTime() - startedAt.getTime();
      await this.automationService.failRun({
        runId: run.id,
        finishedAt,
        durationMs: elapsedMs,
        errorMessage: error?.message || String(error),
      });
      this.logger.error(
        `[${trigger}] Falha na automacao completa: ${error?.message || error}`,
        error?.stack,
      );
      return {
        status: 'FAILED',
        trigger,
        runId: run.id,
        durationMs: elapsedMs,
        errorMessage: error?.message || String(error),
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async executeLightAutomation(
    trigger: string,
    requestedByUserId?: string,
  ) {
    if (this.isRunning) {
      const skipped = await this.automationService.createSkippedRun({
        mode: AutomationRunMode.LIGHT,
        trigger,
        requestedByUserId,
        reason: 'already_running',
      });
      this.logger.warn(
        `[${trigger}] Execucao ignorada: automacao ja em andamento.`,
      );
      return {
        status: 'SKIPPED',
        trigger,
        runId: skipped.id,
        reason: 'already_running',
      };
    }

    this.isRunning = true;
    const startedAt = new Date();
    const run = await this.automationService.createRunningRun({
      mode: AutomationRunMode.LIGHT,
      trigger,
      startedAt,
      requestedByUserId,
    });

    try {
      this.logger.log(`[${trigger}] Iniciando automacao leve.`);

      const delinquency = await this.contractsService.syncDelinquencyStatuses();
      const receivableSync =
        await this.financeService.syncReceivablesFromContractInvoices();

      const finishedAt = new Date();
      const elapsedMs = finishedAt.getTime() - startedAt.getTime();
      const summary = {
        delinquency,
        receivableSync,
      };
      await this.automationService.completeRun({
        runId: run.id,
        finishedAt,
        durationMs: elapsedMs,
        summary,
      });

      this.logger.log(
        `[${trigger}] Automacao leve finalizada em ${elapsedMs}ms | delinquency=${JSON.stringify(
          delinquency,
        )} | receivableSync=${JSON.stringify(receivableSync)}`,
      );
      return {
        status: 'SUCCESS',
        trigger,
        runId: run.id,
        durationMs: elapsedMs,
        summary,
      };
    } catch (error: any) {
      const finishedAt = new Date();
      const elapsedMs = finishedAt.getTime() - startedAt.getTime();
      await this.automationService.failRun({
        runId: run.id,
        finishedAt,
        durationMs: elapsedMs,
        errorMessage: error?.message || String(error),
      });
      this.logger.error(
        `[${trigger}] Falha na automacao leve: ${error?.message || error}`,
        error?.stack,
      );
      return {
        status: 'FAILED',
        trigger,
        runId: run.id,
        durationMs: elapsedMs,
        errorMessage: error?.message || String(error),
      };
    } finally {
      this.isRunning = false;
    }
  }

  private configSnapshot(): AutomationConfigSnapshot {
    return {
      enabled: this.readBoolean('AUTOMATION_ENABLED', true),
      runOnBoot: this.readBoolean('AUTOMATION_RUN_ON_BOOT', false),
      hourlyEnabled: this.readBoolean('AUTOMATION_HOURLY_ENABLED', true),
      timezone: this.timezone(),
      dailyCron: this.dailyCron(),
      hourlyCron: this.hourlyCron(),
      preventiveDaysAhead: this.preventiveDaysAhead(),
    };
  }

  private preventiveDaysAhead() {
    const raw = process.env.AUTOMATION_PREVENTIVE_DAYS_AHEAD;
    const parsed = raw ? Number(raw) : 45;
    if (!Number.isFinite(parsed) || parsed < 1) return 45;
    return Math.floor(parsed);
  }

  private timezone() {
    return process.env.AUTOMATION_TIMEZONE || 'America/Sao_Paulo';
  }

  private dailyCron() {
    return process.env.AUTOMATION_DAILY_CRON || '0 5 * * *';
  }

  private hourlyCron() {
    return process.env.AUTOMATION_HOURLY_CRON || '15 * * * *';
  }

  private readBoolean(name: string, fallback: boolean) {
    const value = process.env[name];
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
}
