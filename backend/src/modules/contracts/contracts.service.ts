import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  AuditDomain,
  BankMovementOriginType,
  BankMovementType,
  CommissionRuleTrigger,
  ClientType,
  CommissionStatus,
  ContractInvoiceStatus,
  ContractStatus,
  CostCenterEntryType,
  FinancialPeriodStatus,
  GeneratorLifecycleStatus,
  PaymentMethod,
  Prisma,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  private readonly defaultContractCommissionPercent = 2;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateContractDto, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    this.validateDates(dto.startDate, dto.endDate);

    return this.prisma.$transaction(async (tx) => {
      const code = await this.generateContractCode(tx);
      await this.validateEquipmentsOwnership(tx, dto.clientId, dto.equipments);

      const contract = await tx.serviceContract.create({
        data: {
          code,
          title: dto.title,
          clientId: dto.clientId,
          createdByUserId: actorUserId,
          status: dto.status ?? ContractStatus.ACTIVE,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          alertDays: dto.alertDays ?? 30,
          preventiveRecurrence: dto.preventiveRecurrence,
          responseTimeHours: dto.responseTimeHours,
          correctiveVisitAllowance: dto.correctiveVisitAllowance,
          partsCoverage: dto.partsCoverage,
          recurringAmount: dto.recurringAmount,
          dueDay: dto.dueDay,
          adjustmentIndex: dto.adjustmentIndex,
          adjustmentBaseMonth: dto.adjustmentBaseMonth,
          includesFuelManagement: dto.includesFuelManagement ?? false,
          notes: dto.notes,
          equipments: {
            create: dto.equipments.map((item) => ({
              generatorId: item.generatorId,
              coverageAmount: item.coverageAmount,
            })),
          },
        },
      });

      await this.syncContractAutomation(tx, contract.id, actorUserId);
      await this.auditLogsService.record(
        {
          domain: AuditDomain.CONTRACTS,
          entityType: 'SERVICE_CONTRACT',
          entityId: contract.id,
          action: 'CREATE',
          actorUserId,
          afterPayload: {
            code: contract.code,
            clientId: contract.clientId,
            status: contract.status,
            recurringAmount: contract.recurringAmount,
          },
        },
        tx,
      );

      return tx.serviceContract.findUnique({
        where: { id: contract.id },
        include: this.contractInclude(),
      });
    });
  }

  async findAll(actorUserId?: string) {
    await this.syncDelinquencyStatuses();
    const scope = await this.getActorScope(actorUserId);
    return this.prisma.serviceContract.findMany({
      where:
        scope?.role === UserRole.CLIENT
          ? { clientId: this.requireLinkedClientId(scope) }
          : undefined,
      include: this.contractInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actorUserId?: string) {
    await this.syncDelinquencyStatuses();
    const contract = await this.prisma.serviceContract.findUnique({
      where: { id },
      include: this.contractInclude(),
    });

    if (!contract) throw new NotFoundException('Contrato nao encontrado.');
    await this.assertContractScope(contract.clientId, actorUserId);
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    const existing = await this.findOne(id, actorUserId);

    if (dto.startDate || dto.endDate) {
      this.validateDates(
        dto.startDate ?? existing.startDate.toISOString(),
        dto.endDate ?? existing.endDate.toISOString(),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.equipments) {
        await this.validateEquipmentsOwnership(
          tx,
          dto.clientId ?? existing.clientId,
          dto.equipments,
        );
      }

      await tx.serviceContract.update({
        where: { id },
        data: {
          title: dto.title,
          clientId: dto.clientId,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          alertDays: dto.alertDays,
          preventiveRecurrence: dto.preventiveRecurrence,
          responseTimeHours: dto.responseTimeHours,
          correctiveVisitAllowance: dto.correctiveVisitAllowance,
          partsCoverage: dto.partsCoverage,
          recurringAmount: dto.recurringAmount,
          dueDay: dto.dueDay,
          adjustmentIndex: dto.adjustmentIndex,
          adjustmentBaseMonth: dto.adjustmentBaseMonth,
          includesFuelManagement: dto.includesFuelManagement,
          notes: dto.notes,
        },
      });

      if (dto.equipments) {
        await tx.contractEquipment.deleteMany({ where: { contractId: id } });
        if (dto.equipments.length) {
          await tx.contractEquipment.createMany({
            data: dto.equipments.map((item) => ({
              contractId: id,
              generatorId: item.generatorId,
              coverageAmount: item.coverageAmount,
            })),
          });
        }
      }

      await this.syncContractAutomation(tx, id, actorUserId);
      await this.auditLogsService.record(
        {
          domain: AuditDomain.CONTRACTS,
          entityType: 'SERVICE_CONTRACT',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          beforePayload: existing as unknown as Prisma.InputJsonValue,
          afterPayload: dto as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return tx.serviceContract.findUnique({
        where: { id },
        include: this.contractInclude(),
      });
    });
  }

  async suspendForDelinquency(id: string, note?: string, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    const contract = await this.findOne(id, actorUserId);
    return this.prisma.$transaction(async (tx) => {
      await tx.serviceContract.update({
        where: { id },
        data: {
          status: ContractStatus.SUSPENDED,
          notes:
            [contract.notes, note].filter(Boolean).join('\n').trim() ||
            contract.notes,
        },
      });

      await this.syncContractAutomation(tx, id, actorUserId);
      await this.auditLogsService.record(
        {
          domain: AuditDomain.CONTRACTS,
          entityType: 'SERVICE_CONTRACT',
          entityId: id,
          action: 'SUSPEND',
          actorUserId,
          reason: note,
        },
        tx,
      );
      return tx.serviceContract.findUnique({
        where: { id },
        include: this.contractInclude(),
      });
    });
  }

  async activate(id: string, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    await this.findOne(id, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      await tx.serviceContract.update({
        where: { id },
        data: { status: ContractStatus.ACTIVE },
      });
      await this.syncContractAutomation(tx, id, actorUserId);
      await this.auditLogsService.record(
        {
          domain: AuditDomain.CONTRACTS,
          entityType: 'SERVICE_CONTRACT',
          entityId: id,
          action: 'ACTIVATE',
          actorUserId,
        },
        tx,
      );
      return tx.serviceContract.findUnique({
        where: { id },
        include: this.contractInclude(),
      });
    });
  }

  async generateUpcomingPreventiveOrders(
    id: string,
    daysAhead = 30,
    actorUserId?: string,
  ) {
    await this.assertInternalActor(actorUserId);
    await this.syncDelinquencyStatuses();
    await this.findOne(id, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const until = new Date();
      until.setDate(until.getDate() + daysAhead);

      const schedules = await tx.contractPreventiveSchedule.findMany({
        where: {
          contractId: id,
          generatedOrderId: null,
          scheduledDate: { lte: until },
          contract: { status: ContractStatus.ACTIVE },
        },
        include: {
          generator: true,
          contract: true,
        },
        orderBy: { scheduledDate: 'asc' },
      });

      const createdOrders: any[] = [];
      for (const schedule of schedules) {
        const order = await tx.maintenanceOrder.create({
          data: {
            title: `Preventiva Contrato ${schedule.contract.code}`,
            description: `OS preventiva automatica prevista para ${schedule.scheduledDate.toISOString().slice(0, 10)}.`,
            generatorId: schedule.generatorId,
            contractId: schedule.contractId,
            contractScheduleId: schedule.id,
            scheduledTo: schedule.scheduledDate,
            priority: 'NORMAL',
          },
        });

        createdOrders.push(order);

        await tx.contractPreventiveSchedule.update({
          where: { id: schedule.id },
          data: {
            generatedOrderId: order.id,
            status: 'ORDER_CREATED',
          },
        });
      }

      if (createdOrders.length > 0) {
        await this.auditLogsService.record(
          {
            domain: AuditDomain.CONTRACTS,
            entityType: 'SERVICE_CONTRACT',
            entityId: id,
            action: 'GENERATE_PREVENTIVE_ORDERS',
            actorUserId,
            afterPayload: {
              createdOrderIds: createdOrders.map((order) => order.id),
              daysAhead,
            },
          },
          tx,
        );
      }

      return {
        createdCount: createdOrders.length,
        orders: createdOrders,
      };
    });
  }

  async syncDelinquencyStatuses() {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.contractInvoice.updateMany({
        where: {
          status: ContractInvoiceStatus.PENDING,
          dueDate: { lt: now },
        },
        data: { status: ContractInvoiceStatus.OVERDUE },
      });

      const delinquentContracts = await tx.serviceContract.findMany({
        where: {
          status: { in: [ContractStatus.ACTIVE, ContractStatus.RENEWAL] },
          invoices: {
            some: {
              status: ContractInvoiceStatus.OVERDUE,
            },
          },
        },
        include: { equipments: true },
      });

      if (delinquentContracts.length > 0) {
        const contractIds = delinquentContracts.map((c) => c.id);
        const clientIds = [
          ...new Set(delinquentContracts.map((c) => c.clientId)),
        ];
        const generatorIds = delinquentContracts.flatMap((c) =>
          c.equipments.map((e) => e.generatorId),
        );

        await tx.serviceContract.updateMany({
          where: { id: { in: contractIds } },
          data: { status: ContractStatus.SUSPENDED },
        });

        await tx.client.updateMany({
          where: { id: { in: clientIds } },
          data: { isDelinquent: true },
        });

        if (generatorIds.length > 0) {
          await tx.generator.updateMany({
            where: { id: { in: generatorIds } },
            data: { hasMaintenanceContract: false },
          });
        }
      }

      const clientsToClear = await tx.client.findMany({
        where: {
          isDelinquent: true,
          contracts: {
            none: {
              invoices: {
                some: { status: ContractInvoiceStatus.OVERDUE },
              },
            },
          },
        },
        select: { id: true },
      });

      if (clientsToClear.length > 0) {
        await tx.client.updateMany({
          where: { id: { in: clientsToClear.map((c) => c.id) } },
          data: { isDelinquent: false },
        });
      }

      return {
        suspendedContracts: delinquentContracts.length,
        flaggedClients: delinquentContracts.length
          ? [...new Set(delinquentContracts.map((c) => c.clientId))].length
          : 0,
      };
    });
  }

  async remove(id: string, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    await this.findOne(id, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      await tx.serviceContract.update({
        where: { id },
        data: { status: ContractStatus.CANCELED },
      });
      await this.syncContractAutomation(tx, id, actorUserId);
      await this.auditLogsService.record(
        {
          domain: AuditDomain.CONTRACTS,
          entityType: 'SERVICE_CONTRACT',
          entityId: id,
          action: 'CANCEL',
          actorUserId,
        },
        tx,
      );
      return { id, canceled: true };
    });
  }

  async findAllInvoices(status?: ContractInvoiceStatus, actorUserId?: string) {
    await this.syncDelinquencyStatuses();
    const scope = await this.getActorScope(actorUserId);
    return this.prisma.contractInvoice.findMany({
      where: {
        ...(scope?.role === UserRole.CLIENT
          ? {
              contract: {
                clientId: this.requireLinkedClientId(scope),
              },
            }
          : {}),
        ...(status ? { status } : {}),
      },
      include: {
        contract: {
          include: {
            client: {
              select: {
                id: true,
                companyName: true,
                isDelinquent: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
    });
  }

  async markInvoicePaid(
    invoiceId: string,
    paidAt?: string,
    bankAccountId?: string,
    actorUserId?: string,
  ) {
    await this.assertInternalActor(actorUserId);
    if (!bankAccountId) {
      throw new BadRequestException(
        'Selecione uma conta bancaria/caixa para baixar a fatura contratual.',
      );
    }
    const effectivePaidAt = paidAt ? new Date(paidAt) : new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findUnique({
        where: { id: bankAccountId },
        select: { id: true, isActive: true },
      });
      if (!bankAccount) {
        throw new NotFoundException('Conta bancaria/caixa nao encontrada.');
      }
      if (!bankAccount.isActive) {
        throw new BadRequestException(
          'Conta bancaria/caixa inativa nao pode receber baixa.',
        );
      }
      await this.ensureFinancialPeriodOpen(tx, effectivePaidAt);

      const invoice = await tx.contractInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          contract: true,
        },
      });

      if (!invoice) throw new NotFoundException('Fatura nao encontrada.');
      if (invoice.status === ContractInvoiceStatus.PAID) {
        throw new BadRequestException('Fatura ja esta quitada.');
      }

      const receivable = await tx.accountsReceivable.findFirst({
        where: {
          contractId: invoice.contractId,
          competenceDate: invoice.competenceDate,
          status: { not: AccountsReceivableStatus.CANCELED },
        },
        select: {
          id: true,
          clientId: true,
          contractId: true,
          maintenanceOrderId: true,
          costCenterId: true,
          description: true,
          competenceDate: true,
          netAmount: true,
          interestAmount: true,
          penaltyAmount: true,
          paidAmount: true,
          status: true,
        },
      });
      if (!receivable) {
        throw new BadRequestException(
          'Fatura precisa estar espelhada em contas a receber antes da baixa.',
        );
      }

      const outstanding = Math.max(
        0,
        Number(receivable.netAmount || 0) +
          Number(receivable.interestAmount || 0) +
          Number(receivable.penaltyAmount || 0) -
          Number(receivable.paidAmount || 0),
      );

      if (outstanding > 0) {
        const payment = await tx.accountsReceivablePayment.create({
          data: {
            receivableId: receivable.id,
            bankAccountId,
            amount: outstanding,
            method: PaymentMethod.OTHER,
            paidAt: effectivePaidAt,
            actorUserId,
            notes:
              'Baixa automatica a partir da quitacao da fatura contratual.',
          },
        });

        const movement = await this.createBankMovement(tx, {
          bankAccountId,
          type: BankMovementType.CREDIT,
          amount: outstanding,
          movementDate: effectivePaidAt,
          competenceDate: receivable.competenceDate,
          description: `Recebimento: ${receivable.description}`,
          originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
          originId: payment.id,
          receivableId: receivable.id,
          receivablePaymentId: payment.id,
          createdById: actorUserId,
          metadata: {
            clientId: receivable.clientId,
            contractId: receivable.contractId,
            maintenanceOrderId: receivable.maintenanceOrderId,
            contractInvoiceId: invoice.id,
          },
        });

        await tx.accountsReceivablePayment.update({
          where: { id: payment.id },
          data: { originalMovementId: movement.id },
        });

        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: { currentBalance: { increment: outstanding } },
        });
      }

      if (
        outstanding > 0 ||
        receivable.status !== AccountsReceivableStatus.PAID
      ) {
        await tx.accountsReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmount: Number(receivable.paidAmount || 0) + outstanding,
            status: AccountsReceivableStatus.PAID,
            commissionReleased: true,
            updatedAt: new Date(),
          },
        });
      }

      await tx.commissionEntry.updateMany({
        where: {
          receivableId: receivable.id,
          status: CommissionStatus.PENDING,
        },
        data: {
          status: CommissionStatus.RELEASED,
          releasedAt: effectivePaidAt,
        },
      });

      const paidInvoice = await tx.contractInvoice.update({
        where: { id: invoiceId },
        data: {
          status: ContractInvoiceStatus.PAID,
          paidAt: effectivePaidAt,
        },
        include: {
          contract: {
            include: {
              client: true,
            },
          },
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.FINANCE,
          entityType: 'CONTRACT_INVOICE',
          entityId: invoiceId,
          action: 'PAY',
          actorUserId,
          afterPayload: {
            contractId: invoice.contractId,
            receivableId: receivable?.id,
            bankAccountId,
            paidAt: effectivePaidAt.toISOString(),
          },
        },
        tx,
      );

      return paidInvoice;
    });

    await this.syncDelinquencyStatuses();
    return updated;
  }

  private contractInclude() {
    return {
      client: true,
      createdByUser: { select: { id: true, name: true, email: true } },
      sourceProposal: { select: { id: true, code: true, status: true } },
      equipments: {
        include: {
          generator: {
            include: {
              client: { select: { id: true, companyName: true } },
              model: true,
            },
          },
        },
      },
      invoices: {
        orderBy: { dueDate: 'asc' as const },
      },
      schedules: {
        orderBy: { scheduledDate: 'asc' as const },
        include: {
          generator: { select: { id: true, name: true, serialNumber: true } },
        },
      },
    };
  }

  private async validateEquipmentsOwnership(
    tx: Prisma.TransactionClient,
    clientId: string,
    equipments: Array<{ generatorId: string }>,
  ) {
    if (!equipments.length) {
      throw new BadRequestException(
        'Selecione pelo menos um equipamento no contrato.',
      );
    }

    const generators = await tx.generator.findMany({
      where: {
        id: { in: equipments.map((item) => item.generatorId) },
      },
      select: { id: true, clientId: true, lifecycleStatus: true },
    });

    if (generators.length !== equipments.length) {
      throw new BadRequestException(
        'Um ou mais equipamentos informados nao existem.',
      );
    }

    const hasWrongClient = generators.some(
      (item) => item.clientId !== clientId,
    );
    if (hasWrongClient) {
      throw new BadRequestException(
        'Todos os equipamentos devem pertencer ao cliente do contrato.',
      );
    }

    const blocked = generators.filter(
      (item) =>
        item.lifecycleStatus === GeneratorLifecycleStatus.IN_MAINTENANCE ||
        item.lifecycleStatus === GeneratorLifecycleStatus.SCRAP,
    );

    if (blocked.length > 0) {
      throw new BadRequestException(
        'Equipamento indisponivel para contrato: existe gerador em manutencao ou sucata.',
      );
    }
  }

  async runPreventiveAutomation(daysAhead = 45) {
    await this.syncDelinquencyStatuses();
    const contracts = await this.prisma.serviceContract.findMany({
      where: {
        status: { in: [ContractStatus.ACTIVE, ContractStatus.RENEWAL] },
      },
      select: { id: true, code: true },
    });

    const result: Array<{ contractId: string; code: string; created: number }> =
      [];

    for (const contract of contracts) {
      const generated = await this.generateUpcomingPreventiveOrders(
        contract.id,
        daysAhead,
      );
      result.push({
        contractId: contract.id,
        code: contract.code,
        created: generated.createdCount,
      });
    }

    return {
      processedContracts: result.length,
      totalOrdersCreated: result.reduce((acc, item) => acc + item.created, 0),
      details: result,
    };
  }

  private async getActorScope(actorUserId?: string) {
    if (!actorUserId) {
      return null;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        role: true,
        linkedClientId: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return actor;
  }

  private requireLinkedClientId(actor: { linkedClientId: string | null }) {
    if (!actor.linkedClientId) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    return actor.linkedClientId;
  }

  private async assertInternalActor(actorUserId?: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Usuarios do portal do cliente nao podem executar esta acao.',
      );
    }
  }

  private async assertContractScope(clientId: string, actorUserId?: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role !== UserRole.CLIENT) {
      return;
    }

    if (clientId !== this.requireLinkedClientId(actor)) {
      throw new NotFoundException('Contrato nao encontrado.');
    }
  }

  private validateDates(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Datas de vigencia invalidas.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'A data de termino precisa ser maior que a data de inicio.',
      );
    }
  }

  private async generateContractCode(tx: Prisma.TransactionClient) {
    const contracts = await tx.serviceContract.findMany({
      select: { code: true },
    });

    let max = 0;
    for (const item of contracts) {
      const match = /^CTR-(\d{5,})$/.exec(item.code);
      if (!match) continue;
      const num = Number(match[1]);
      if (num > max) max = num;
    }

    return `CTR-${String(max + 1).padStart(5, '0')}`;
  }

  private recurrenceToMonths(recurrence: string) {
    switch (recurrence) {
      case 'MONTHLY':
        return 1;
      case 'BIMONTHLY':
        return 2;
      case 'QUARTERLY':
        return 3;
      case 'SEMIANNUAL':
        return 6;
      case 'ANNUAL':
        return 12;
      default:
        return 1;
    }
  }

  private addMonths(base: Date, months: number) {
    const copy = new Date(base);
    const day = copy.getDate();
    copy.setMonth(copy.getMonth() + months);
    if (copy.getDate() < day) {
      copy.setDate(0);
    }
    return copy;
  }

  private buildDueDate(competence: Date, dueDay: number) {
    const year = competence.getFullYear();
    const month = competence.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(Math.max(dueDay, 1), maxDay);
    return new Date(year, month, day, 10, 0, 0, 0);
  }

  private async syncContractAutomation(
    tx: Prisma.TransactionClient,
    contractId: string,
    actorUserId?: string,
  ) {
    const contract = await tx.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        equipments: true,
        sourceProposal: { select: { userId: true } },
      },
    });

    if (!contract) throw new NotFoundException('Contrato nao encontrado.');

    const stats = {
      invoicesCreated: 0,
      schedulesCreated: 0,
      receivablesCreated: 0,
      receivablesUpdated: 0,
    };
    const activeForAutomation =
      contract.status === ContractStatus.ACTIVE ||
      contract.status === ContractStatus.RENEWAL;
    const coveredGeneratorIds = contract.equipments.map(
      (item) => item.generatorId,
    );

    await tx.contractInvoice.deleteMany({
      where: {
        contractId,
        status: ContractInvoiceStatus.PENDING,
      },
    });

    await tx.contractPreventiveSchedule.deleteMany({
      where: {
        contractId,
        generatedOrderId: null,
      },
    });

    if (!activeForAutomation) {
      await this.updateContractCoverageState(tx, {
        contractId: contract.id,
        clientId: contract.clientId,
        coveredGeneratorIds,
        activeForAutomation,
      });
      return stats;
    }

    const stepMonths = this.recurrenceToMonths(contract.preventiveRecurrence);
    const competenceDates: Date[] = [];

    let cursor = new Date(contract.startDate);
    while (cursor <= contract.endDate) {
      competenceDates.push(new Date(cursor));
      cursor = this.addMonths(cursor, stepMonths);
    }

    if (competenceDates.length) {
      const invoiceData = competenceDates.map((competenceDate) => ({
        contractId,
        competenceDate,
        dueDate: this.buildDueDate(competenceDate, contract.dueDay),
        amount: contract.recurringAmount,
        variableAmount: 0,
        status: ContractInvoiceStatus.PENDING,
        description: `Mensalidade contrato ${contract.code}`,
      }));
      const invoiceResult = await tx.contractInvoice.createMany({
        data: invoiceData,
        skipDuplicates: true,
      });
      stats.invoicesCreated = invoiceResult?.count ?? 0;

      for (const invoice of invoiceData) {
        const result = await this.syncReceivableFromContractInvoice(tx, {
          contractId: contract.id,
          clientId: contract.clientId,
          costCenterId: contract.costCenterId,
          contractCode: contract.code,
          competenceDate: invoice.competenceDate,
          dueDate: invoice.dueDate,
          amount: invoice.amount,
          actorUserId,
          commissionUserId:
            contract.sourceProposal?.userId ?? contract.createdByUserId,
        });
        if (result === 'created') stats.receivablesCreated += 1;
        if (result === 'updated') stats.receivablesUpdated += 1;
      }
    }

    const scheduleData: Array<{
      contractId: string;
      generatorId: string;
      scheduledDate: Date;
      status: string;
    }> = [];
    for (const equipment of contract.equipments) {
      for (const date of competenceDates) {
        scheduleData.push({
          contractId,
          generatorId: equipment.generatorId,
          scheduledDate: date,
          status: 'PLANNED',
        });
      }
    }

    if (scheduleData.length) {
      const scheduleResult = await tx.contractPreventiveSchedule.createMany({
        data: scheduleData,
        skipDuplicates: true,
      });
      stats.schedulesCreated = scheduleResult?.count ?? 0;
    }

    await this.updateContractCoverageState(tx, {
      contractId: contract.id,
      clientId: contract.clientId,
      coveredGeneratorIds,
      activeForAutomation,
    });

    return stats;
  }

  private async updateContractCoverageState(
    tx: Prisma.TransactionClient,
    input: {
      contractId: string;
      clientId: string;
      coveredGeneratorIds: string[];
      activeForAutomation: boolean;
    },
  ) {
    if (input.coveredGeneratorIds.length) {
      await tx.generator.updateMany({
        where: { id: { in: input.coveredGeneratorIds } },
        data: {
          hasMaintenanceContract: input.activeForAutomation,
        },
      });
    }

    if (input.activeForAutomation) {
      await tx.client.update({
        where: { id: input.clientId },
        data: { clientType: ClientType.CONTRACT },
      });
    } else {
      const activeForClient = await tx.serviceContract.count({
        where: {
          clientId: input.clientId,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.RENEWAL] },
          id: { not: input.contractId },
        },
      });

      if (activeForClient === 0) {
        await tx.client.update({
          where: { id: input.clientId },
          data: { clientType: ClientType.NO_CONTRACT },
        });
      }
    }
  }

  private async syncReceivableFromContractInvoice(
    tx: Prisma.TransactionClient,
    input: {
      contractId: string;
      clientId: string;
      costCenterId: string | null;
      contractCode: string;
      competenceDate: Date;
      dueDate: Date;
      amount: number;
      actorUserId?: string;
      commissionUserId?: string | null;
    },
  ): Promise<'created' | 'updated' | 'skipped'> {
    const amount = Number(input.amount || 0);
    if (amount <= 0) {
      return 'skipped';
    }

    const existing = await tx.accountsReceivable.findFirst({
      where: {
        contractId: input.contractId,
        competenceDate: input.competenceDate,
        status: { not: AccountsReceivableStatus.CANCELED },
      },
      select: { id: true, status: true },
    });

    const receivableData = {
      clientId: input.clientId,
      contractId: input.contractId,
      costCenterId: input.costCenterId,
      description: `Mensalidade contrato ${input.contractCode}`,
      competenceDate: input.competenceDate,
      dueDate: input.dueDate,
      grossAmount: amount,
      discountAmount: 0,
      netAmount: amount,
      status: AccountsReceivableStatus.OPEN,
    };

    if (existing) {
      if (
        existing.status === AccountsReceivableStatus.OPEN ||
        existing.status === AccountsReceivableStatus.OVERDUE
      ) {
        await tx.accountsReceivable.update({
          where: { id: existing.id },
          data: receivableData,
        });

        await tx.costCenterEntry.updateMany({
          where: {
            sourceType: 'ACCOUNTS_RECEIVABLE',
            sourceId: existing.id,
          },
          data: {
            ...(input.costCenterId ? { costCenterId: input.costCenterId } : {}),
            amount,
            competenceDate: input.competenceDate,
          },
        });

        await this.ensureCommissionProvision(tx, {
          userId: input.commissionUserId,
          receivableId: existing.id,
          contractId: input.contractId,
          baseAmount: amount,
          actorUserId: input.actorUserId,
        });

        return 'updated';
      }

      await this.ensureCommissionProvision(tx, {
        userId: input.commissionUserId,
        receivableId: existing.id,
        contractId: input.contractId,
        baseAmount: amount,
        actorUserId: input.actorUserId,
      });

      return 'skipped';
    }

    const receivable = await this.createContractReceivableSafely(
      tx,
      receivableData,
    );
    if (!receivable) return 'skipped';

    if (input.costCenterId) {
      await tx.costCenterEntry.create({
        data: {
          costCenterId: input.costCenterId,
          entryType: CostCenterEntryType.REVENUE,
          sourceType: 'ACCOUNTS_RECEIVABLE',
          sourceId: receivable.id,
          amount,
          competenceDate: input.competenceDate,
        },
      });
    }

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivable.id,
        action: 'CREATE_FROM_CONTRACT',
        actorUserId: input.actorUserId,
        afterPayload: {
          contractId: input.contractId,
          clientId: input.clientId,
          competenceDate: input.competenceDate.toISOString(),
          dueDate: input.dueDate.toISOString(),
          amount,
        },
      },
      tx,
    );

    await this.ensureCommissionProvision(tx, {
      userId: input.commissionUserId,
      receivableId: receivable.id,
      contractId: input.contractId,
      baseAmount: amount,
      actorUserId: input.actorUserId,
    });

    return 'created';
  }

  private async createContractReceivableSafely(
    tx: Prisma.TransactionClient,
    receivableData: Prisma.AccountsReceivableUncheckedCreateInput,
  ) {
    try {
      return await tx.accountsReceivable.create({ data: receivableData });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      return null;
    }
  }

  private async ensureCommissionProvision(
    tx: Prisma.TransactionClient,
    input: {
      userId?: string | null;
      receivableId: string;
      contractId: string;
      baseAmount: number;
      actorUserId?: string;
    },
  ) {
    if (!input.userId || input.baseAmount <= 0) return;

    const existing = await tx.commissionEntry.findFirst({
      where: {
        userId: input.userId,
        receivableId: input.receivableId,
        contractId: input.contractId,
        status: { not: CommissionStatus.CANCELED },
      },
      select: { id: true },
    });
    if (existing) return;

    const percent = await this.resolveCommissionPercent(tx, {
      userId: input.userId,
      trigger: CommissionRuleTrigger.RECEIVABLE_PAID,
    });
    const commission = await tx.commissionEntry.create({
      data: {
        userId: input.userId,
        receivableId: input.receivableId,
        contractId: input.contractId,
        baseAmount: input.baseAmount,
        percent,
        amount: Number(((input.baseAmount * percent) / 100).toFixed(2)),
        status: CommissionStatus.PENDING,
        notes:
          'Comissao provisionada automaticamente a partir de recebivel contratual.',
      },
    });

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: 'COMMISSION_ENTRY',
        entityId: commission.id,
        action: 'CREATE_FROM_CONTRACT_RECEIVABLE',
        actorUserId: input.actorUserId,
        afterPayload: {
          receivableId: input.receivableId,
          contractId: input.contractId,
          userId: input.userId,
          percent,
          amount: commission.amount,
        },
      },
      tx,
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private async ensureFinancialPeriodOpen(
    tx: Prisma.TransactionClient,
    date: Date,
  ) {
    const period = {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    };
    const closing = await tx.financialPeriodClosing.findUnique({
      where: { year_month: period },
      select: { id: true, status: true },
    });

    if (closing?.status === FinancialPeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Periodo financeiro ${String(period.month).padStart(2, '0')}/${period.year} esta fechado.`,
      );
    }
  }

  private async createBankMovement(
    tx: Prisma.TransactionClient,
    input: {
      bankAccountId: string;
      type: BankMovementType;
      amount: number;
      movementDate: Date;
      competenceDate?: Date | null;
      description: string;
      originType: BankMovementOriginType;
      originId: string;
      receivableId?: string | null;
      receivablePaymentId?: string | null;
      createdById?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Movimento financeiro precisa ter valor maior que zero.',
      );
    }

    try {
      return await tx.bankMovement.create({
        data: {
          bankAccountId: input.bankAccountId,
          type: input.type,
          amount,
          movementDate: input.movementDate,
          competenceDate: input.competenceDate,
          description: input.description,
          originType: input.originType,
          originId: input.originId,
          receivableId: input.receivableId,
          receivablePaymentId: input.receivablePaymentId,
          createdById: input.createdById,
          metadata: input.metadata,
        },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Movimento financeiro duplicado para a mesma origem.',
        );
      }
      throw error;
    }
  }

  private async resolveCommissionPercent(
    tx: Prisma.TransactionClient,
    input: {
      userId?: string | null;
      trigger: CommissionRuleTrigger;
    },
  ) {
    const now = new Date();
    const activeWindow: Prisma.CommissionRuleWhereInput = {
      active: true,
      trigger: input.trigger,
      OR: [
        { validFrom: null, validUntil: null },
        { validFrom: null, validUntil: { gte: now } },
        { validFrom: { lte: now }, validUntil: null },
        { validFrom: { lte: now }, validUntil: { gte: now } },
      ],
    };

    if (input.userId) {
      const sellerRule = await tx.commissionRule.findFirst({
        where: { ...activeWindow, sellerId: input.userId },
        orderBy: { createdAt: 'desc' },
      });
      if (sellerRule) return Number(sellerRule.percentage || 0);

      const seller = await tx.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });
      if (seller?.role) {
        const roleRule = await tx.commissionRule.findFirst({
          where: {
            ...activeWindow,
            role: seller.role,
            sellerId: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (roleRule) return Number(roleRule.percentage || 0);
      }
    }

    const generalRule = await tx.commissionRule.findFirst({
      where: { ...activeWindow, sellerId: null, role: null },
      orderBy: { createdAt: 'desc' },
    });

    return Number(
      generalRule?.percentage ?? this.defaultContractCommissionPercent,
    );
  }
}
