import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  AuditDomain,
  ClientType,
  ContractInvoiceStatus,
  ContractStatus,
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

      await this.syncContractAutomation(tx, contract.id);
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

      await this.syncContractAutomation(tx, id);
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

      await this.syncContractAutomation(tx, id);
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
      await this.syncContractAutomation(tx, id);
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
      await this.syncContractAutomation(tx, id);
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
    actorUserId?: string,
  ) {
    await this.assertInternalActor(actorUserId);
    const effectivePaidAt = paidAt ? new Date(paidAt) : new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.contractInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          contract: true,
        },
      });

      if (!invoice) throw new NotFoundException('Fatura nao encontrada.');

      const receivable = await tx.accountsReceivable.findFirst({
        where: {
          contractId: invoice.contractId,
          competenceDate: invoice.competenceDate,
          status: { not: AccountsReceivableStatus.CANCELED },
        },
        select: {
          id: true,
          netAmount: true,
          interestAmount: true,
          penaltyAmount: true,
          paidAmount: true,
          status: true,
        },
      });

      if (receivable) {
        const outstanding = Math.max(
          0,
          Number(receivable.netAmount || 0) +
            Number(receivable.interestAmount || 0) +
            Number(receivable.penaltyAmount || 0) -
            Number(receivable.paidAmount || 0),
        );

        if (outstanding > 0) {
          await tx.accountsReceivablePayment.create({
            data: {
              receivableId: receivable.id,
              amount: outstanding,
              method: PaymentMethod.OTHER,
              paidAt: effectivePaidAt,
              actorUserId,
              notes:
                'Baixa automatica a partir da quitacao da fatura contratual.',
            },
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
              updatedAt: new Date(),
            },
          });
        }
      }

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
  ) {
    const contract = await tx.serviceContract.findUnique({
      where: { id: contractId },
      include: {
        equipments: true,
      },
    });

    if (!contract) throw new NotFoundException('Contrato nao encontrado.');

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

    const stepMonths = this.recurrenceToMonths(contract.preventiveRecurrence);
    const competenceDates: Date[] = [];

    let cursor = new Date(contract.startDate);
    while (cursor <= contract.endDate) {
      competenceDates.push(new Date(cursor));
      cursor = this.addMonths(cursor, stepMonths);
    }

    if (competenceDates.length) {
      await tx.contractInvoice.createMany({
        data: competenceDates.map((competenceDate) => ({
          contractId,
          competenceDate,
          dueDate: this.buildDueDate(competenceDate, contract.dueDay),
          amount: contract.recurringAmount,
          variableAmount: 0,
          status: ContractInvoiceStatus.PENDING,
          description: `Mensalidade contrato ${contract.code}`,
        })),
      });
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
      await tx.contractPreventiveSchedule.createMany({
        data: scheduleData,
      });
    }

    const coveredGeneratorIds = contract.equipments.map(
      (item) => item.generatorId,
    );

    if (coveredGeneratorIds.length) {
      await tx.generator.updateMany({
        where: { id: { in: coveredGeneratorIds } },
        data: {
          hasMaintenanceContract: contract.status === ContractStatus.ACTIVE,
        },
      });
    }

    if (contract.status === ContractStatus.ACTIVE) {
      await tx.client.update({
        where: { id: contract.clientId },
        data: { clientType: ClientType.CONTRACT },
      });
    } else {
      const activeForClient = await tx.serviceContract.count({
        where: {
          clientId: contract.clientId,
          status: ContractStatus.ACTIVE,
          id: { not: contract.id },
        },
      });

      if (activeForClient === 0) {
        await tx.client.update({
          where: { id: contract.clientId },
          data: { clientType: ClientType.NO_CONTRACT },
        });
      }
    }
  }
}
