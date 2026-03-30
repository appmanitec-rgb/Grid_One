import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  CommissionStatus,
  ContractInvoiceStatus,
  CostCenterEntryType,
  CostCenterType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import {
  CreateAccountsPayableDto,
  CreateAccountsReceivableDto,
  CreateBankAccountDto,
  CreateCostCenterDto,
  CreateCostCenterEntryDto,
  PayAccountsPayableDto,
  PayAccountsReceivableDto,
  SyncOrderReceivableDto,
  UpdateBankAccountDto,
  UpdateCostCenterDto,
} from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: DatabaseService) {}

  listReceivables() {
    return this.prisma.accountsReceivable.findMany({
      include: {
        client: { select: { id: true, companyName: true } },
        contract: { select: { id: true, code: true } },
        maintenanceOrder: { select: { id: true, title: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createReceivable(
    dto: CreateAccountsReceivableDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const gross = Number(dto.grossAmount || 0);
      const discount = Number(dto.discountAmount || 0);
      const net = Math.max(0, gross - discount);

      const receivable = await tx.accountsReceivable.create({
        data: {
          clientId: dto.clientId,
          contractId: dto.contractId,
          maintenanceOrderId: dto.maintenanceOrderId,
          costCenterId: dto.costCenterId,
          description: dto.description,
          competenceDate: new Date(dto.competenceDate),
          dueDate: new Date(dto.dueDate),
          grossAmount: gross,
          discountAmount: discount,
          netAmount: net,
          status: AccountsReceivableStatus.OPEN,
        },
      });

      if (dto.costCenterId) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: dto.costCenterId,
            entryType: CostCenterEntryType.REVENUE,
            sourceType: 'ACCOUNTS_RECEIVABLE',
            sourceId: receivable.id,
            amount: net,
            competenceDate: new Date(dto.competenceDate),
          },
        });
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivable.id,
        action: 'CREATE',
        payload: dto as unknown as Prisma.InputJsonValue,
      });

      return receivable;
    });
  }

  async payReceivable(
    id: string,
    dto: PayAccountsReceivableDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findUnique({
        where: { id },
      });
      if (!receivable)
        throw new NotFoundException('Conta a receber nao encontrada.');
      if (receivable.status === AccountsReceivableStatus.CANCELED) {
        throw new BadRequestException(
          'Titulo cancelado nao pode receber pagamento.',
        );
      }

      const nextPaid =
        Number(receivable.paidAmount || 0) + Number(dto.amount || 0);
      const totalDue =
        Number(receivable.netAmount || 0) +
        Number(receivable.interestAmount || 0) +
        Number(receivable.penaltyAmount || 0);

      await tx.accountsReceivablePayment.create({
        data: {
          receivableId: id,
          bankAccountId: dto.bankAccountId,
          amount: dto.amount,
          method: dto.method,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          actorUserId,
          notes: dto.notes,
        },
      });

      if (dto.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: dto.bankAccountId },
          data: { currentBalance: { increment: dto.amount } },
        });
      }

      const status =
        nextPaid >= totalDue
          ? AccountsReceivableStatus.PAID
          : AccountsReceivableStatus.PARTIAL;

      const updated = await tx.accountsReceivable.update({
        where: { id },
        data: {
          paidAmount: nextPaid,
          status,
          updatedAt: new Date(),
        },
      });

      if (status === AccountsReceivableStatus.PAID && receivable.contractId) {
        const linkedInvoice = await tx.contractInvoice.findFirst({
          where: {
            contractId: receivable.contractId,
            competenceDate: receivable.competenceDate,
            status: { not: ContractInvoiceStatus.CANCELED },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (
          linkedInvoice &&
          linkedInvoice.status !== ContractInvoiceStatus.PAID
        ) {
          await tx.contractInvoice.update({
            where: { id: linkedInvoice.id },
            data: {
              status: ContractInvoiceStatus.PAID,
              paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
            },
          });
        }
      }

      if (status === AccountsReceivableStatus.PAID) {
        await tx.commissionEntry.updateMany({
          where: {
            receivableId: id,
            status: CommissionStatus.PENDING,
          },
          data: {
            status: CommissionStatus.RELEASED,
            releasedAt: new Date(),
          },
        });
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: id,
        action: 'PAY',
        payload: dto as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async cancelReceivable(id: string, reason: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findUnique({
        where: { id },
      });
      if (!receivable)
        throw new NotFoundException('Conta a receber nao encontrada.');
      const updated = await tx.accountsReceivable.update({
        where: { id },
        data: {
          status: AccountsReceivableStatus.CANCELED,
          canceledAt: new Date(),
          cancelReason: reason,
        },
      });
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: id,
        action: 'CANCEL',
        reason,
      });
      return updated;
    });
  }

  async runReceivableOverdueCron() {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.accountsReceivable.findMany({
        where: {
          dueDate: { lt: now },
          status: {
            in: [
              AccountsReceivableStatus.OPEN,
              AccountsReceivableStatus.PARTIAL,
            ],
          },
        },
      });

      let updated = 0;
      for (const row of rows) {
        const days = Math.max(
          1,
          Math.floor(
            (now.getTime() - row.dueDate.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );
        const penalty = Number(row.netAmount || 0) * 0.02;
        const interest = Number(row.netAmount || 0) * 0.00033 * days;

        await tx.accountsReceivable.update({
          where: { id: row.id },
          data: {
            status: AccountsReceivableStatus.OVERDUE,
            penaltyAmount: penalty,
            interestAmount: interest,
            lastChargeEmailAt: now,
          },
        });
        updated += 1;
      }

      return { updatedOverdue: updated };
    });
  }

  async syncReceivablesFromContractInvoices() {
    return this.prisma.$transaction(async (tx) => {
      const invoices = await tx.contractInvoice.findMany({
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        include: {
          contract: {
            select: {
              id: true,
              clientId: true,
              code: true,
              costCenterId: true,
            },
          },
        },
      });

      let created = 0;
      for (const invoice of invoices) {
        const exists = await tx.accountsReceivable.findFirst({
          where: {
            contractId: invoice.contractId,
            competenceDate: invoice.competenceDate,
            grossAmount: invoice.amount,
            status: { not: AccountsReceivableStatus.CANCELED },
          },
          select: { id: true },
        });
        if (exists) continue;

        await tx.accountsReceivable.create({
          data: {
            clientId: invoice.contract.clientId,
            contractId: invoice.contractId,
            costCenterId: invoice.contract.costCenterId,
            description: `Parcela contrato ${invoice.contract.code}`,
            competenceDate: invoice.competenceDate,
            dueDate: invoice.dueDate,
            grossAmount: invoice.amount,
            discountAmount: 0,
            netAmount: invoice.amount,
            status:
              invoice.status === 'OVERDUE'
                ? AccountsReceivableStatus.OVERDUE
                : AccountsReceivableStatus.OPEN,
          },
        });
        created += 1;
      }

      return { synced: created };
    });
  }

  async createReceivableFromOrder(
    orderId: string,
    dto: SyncOrderReceivableDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.maintenanceOrder.findUnique({
        where: { id: orderId },
        include: {
          generator: { select: { clientId: true } },
        },
      });
      if (!order) throw new NotFoundException('OS nao encontrada.');

      return tx.accountsReceivable.create({
        data: {
          clientId: order.generator.clientId,
          maintenanceOrderId: orderId,
          costCenterId: order.costCenterId,
          description:
            dto.description ||
            `Faturamento de servico avulso da OS ${order.title}`,
          competenceDate: new Date(),
          dueDate: new Date(dto.dueDate),
          grossAmount: dto.amount,
          discountAmount: 0,
          netAmount: dto.amount,
          status: AccountsReceivableStatus.OPEN,
        },
      });
    });
  }

  listPayables() {
    return this.prisma.accountsPayable.findMany({
      include: {
        supplier: { select: { id: true, companyName: true } },
        purchaseOrder: { select: { id: true, code: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createPayable(dto: CreateAccountsPayableDto, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const duplicateHash = `${dto.supplierId}|${new Date(dto.dueDate).toISOString().slice(0, 10)}|${Number(dto.amount).toFixed(2)}`;
      const duplicate = await tx.accountsPayable.findFirst({
        where: {
          duplicateHash,
          status: { not: AccountsPayableStatus.CANCELED },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new BadRequestException(
          'Possivel duplicidade: mesmo fornecedor, valor e vencimento.',
        );
      }

      const payable = await tx.accountsPayable.create({
        data: {
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          costCenterId: dto.costCenterId,
          description: dto.description,
          dueDate: new Date(dto.dueDate),
          competenceDate: dto.competenceDate
            ? new Date(dto.competenceDate)
            : undefined,
          amount: dto.amount,
          category: dto.category,
          barcode: dto.barcode,
          pixCopyPaste: dto.pixCopyPaste,
          proofUrl: dto.proofUrl,
          duplicateHash,
          status: AccountsPayableStatus.OPEN,
        },
      });

      if (dto.costCenterId) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: dto.costCenterId,
            entryType: CostCenterEntryType.EXPENSE,
            sourceType: 'ACCOUNTS_PAYABLE',
            sourceId: payable.id,
            amount: Number(dto.amount || 0),
            competenceDate: dto.competenceDate
              ? new Date(dto.competenceDate)
              : new Date(),
          },
        });
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_PAYABLE',
        entityId: payable.id,
        action: 'CREATE',
        payload: dto as unknown as Prisma.InputJsonValue,
      });

      return payable;
    });
  }

  async payPayable(
    id: string,
    dto: PayAccountsPayableDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findUnique({ where: { id } });
      if (!payable)
        throw new NotFoundException('Conta a pagar nao encontrada.');
      if (payable.status === AccountsPayableStatus.CANCELED) {
        throw new BadRequestException('Titulo cancelado nao pode ser pago.');
      }
      if (payable.status === AccountsPayableStatus.PAID) {
        throw new BadRequestException('Titulo ja esta quitado.');
      }

      const paidAmount = Number(payable.paidAmount || 0);
      const totalAmount = Number(payable.amount || 0);
      const outstanding = Math.max(0, totalAmount - paidAmount);
      const paymentAmount = Number(dto.amount || 0);

      if (paymentAmount > outstanding) {
        throw new BadRequestException(
          'Valor informado excede o saldo do titulo.',
        );
      }

      const effectivePaidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      await tx.accountsPayablePayment.create({
        data: {
          payableId: id,
          bankAccountId: dto.bankAccountId,
          amount: dto.amount,
          method: dto.method,
          paidAt: effectivePaidAt,
          actorUserId,
          notes: dto.notes,
        },
      });

      if (dto.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: dto.bankAccountId },
          data: { currentBalance: { decrement: dto.amount } },
        });
      }

      const nextPaid = paidAmount + paymentAmount;
      const status =
        nextPaid >= totalAmount
          ? AccountsPayableStatus.PAID
          : payable.dueDate < new Date()
            ? AccountsPayableStatus.OVERDUE
            : AccountsPayableStatus.OPEN;

      const updated = await tx.accountsPayable.update({
        where: { id },
        data: {
          paidAmount: nextPaid,
          status,
          paidAt:
            status === AccountsPayableStatus.PAID ? effectivePaidAt : undefined,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_PAYABLE',
        entityId: id,
        action: 'PAY',
        payload: dto as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async cancelPayable(id: string, reason: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findUnique({ where: { id } });
      if (!payable)
        throw new NotFoundException('Conta a pagar nao encontrada.');
      if (payable.status === AccountsPayableStatus.CANCELED) {
        throw new BadRequestException('Titulo ja esta cancelado.');
      }
      if (
        payable.status === AccountsPayableStatus.PAID ||
        Number(payable.paidAmount || 0) > 0
      ) {
        throw new BadRequestException(
          'Titulo com pagamento registrado nao pode ser cancelado.',
        );
      }
      if (payable.purchaseOrderId) {
        throw new BadRequestException(
          'Titulo vinculado a pedido de compra deve ser tratado na origem do pedido.',
        );
      }
      const updated = await tx.accountsPayable.update({
        where: { id },
        data: {
          status: AccountsPayableStatus.CANCELED,
          canceledAt: new Date(),
          cancelReason: reason,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_PAYABLE',
        entityId: id,
        action: 'CANCEL',
        reason,
      });

      return updated;
    });
  }

  async runPayableOverdueCron() {
    const now = new Date();
    const updated = await this.prisma.accountsPayable.updateMany({
      where: {
        dueDate: { lt: now },
        status: AccountsPayableStatus.OPEN,
      },
      data: { status: AccountsPayableStatus.OVERDUE },
    });
    return { updatedOverdue: updated.count };
  }

  listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  createBankAccount(dto: CreateBankAccountDto) {
    const initial = Number(dto.initialBalance || 0);
    return this.prisma.bankAccount.create({
      data: {
        name: dto.name,
        bankName: dto.bankName,
        type: dto.type,
        agency: dto.agency,
        accountNumber: dto.accountNumber,
        pixKey: dto.pixKey,
        initialBalance: initial,
        currentBalance: initial,
      },
    });
  }

  async updateBankAccount(id: string, dto: UpdateBankAccountDto) {
    const current = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Conta bancaria nao encontrada.');
    }

    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name ?? current.name,
        bankName: dto.bankName ?? current.bankName,
        type: dto.type ?? current.type,
        agency: dto.agency ?? current.agency,
        accountNumber: dto.accountNumber ?? current.accountNumber,
        pixKey: dto.pixKey ?? current.pixKey,
        isActive: dto.isActive ?? current.isActive,
      },
    });
  }

  async cashFlowProjection(days = 90) {
    const horizons = [30, 60, 90].filter((x) => x <= Math.max(days, 30));
    if (!horizons.includes(days)) horizons.push(days);

    const currentBalance = await this.prisma.bankAccount.aggregate({
      _sum: { currentBalance: true },
      where: { isActive: true },
    });

    const base = Number(currentBalance._sum.currentBalance || 0);
    const now = new Date();

    const projections = [] as Array<{
      horizonDays: number;
      expectedIn: number;
      expectedOut: number;
      projectedBalance: number;
      negative: boolean;
    }>;

    for (const h of horizons.sort((a, b) => a - b)) {
      const target = new Date(now);
      target.setDate(target.getDate() + h);

      const receivableAgg = await this.prisma.accountsReceivable.aggregate({
        where: {
          dueDate: { lte: target },
          status: {
            in: [
              AccountsReceivableStatus.OPEN,
              AccountsReceivableStatus.PARTIAL,
              AccountsReceivableStatus.OVERDUE,
            ],
          },
        },
        _sum: {
          netAmount: true,
          paidAmount: true,
          interestAmount: true,
          penaltyAmount: true,
        },
      });

      const payableAgg = await this.prisma.accountsPayable.aggregate({
        where: {
          dueDate: { lte: target },
          status: {
            in: [AccountsPayableStatus.OPEN, AccountsPayableStatus.OVERDUE],
          },
        },
        _sum: { amount: true, paidAmount: true },
      });

      const expectedIn =
        Number(receivableAgg._sum.netAmount || 0) +
        Number(receivableAgg._sum.interestAmount || 0) +
        Number(receivableAgg._sum.penaltyAmount || 0) -
        Number(receivableAgg._sum.paidAmount || 0);

      const expectedOut =
        Number(payableAgg._sum.amount || 0) -
        Number(payableAgg._sum.paidAmount || 0);

      const projectedBalance = base + expectedIn - expectedOut;

      projections.push({
        horizonDays: h,
        expectedIn,
        expectedOut,
        projectedBalance,
        negative: projectedBalance < 0,
      });
    }

    return {
      currentBalance: base,
      projections,
    };
  }

  listCostCenters() {
    return this.prisma.costCenter.findMany({
      include: {
        client: { select: { id: true, companyName: true } },
        contract: { select: { id: true, code: true } },
        generator: { select: { id: true, name: true, serialNumber: true } },
      },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  createCostCenter(dto: CreateCostCenterDto) {
    return this.prisma.$transaction(async (tx) => {
      const payload = await this.prepareCostCenterData(tx, dto);
      return tx.costCenter.create({ data: payload });
    });
  }

  updateCostCenter(id: string, dto: UpdateCostCenterDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.costCenter.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Centro de custo nao encontrado.');
      }

      const payload = await this.prepareCostCenterData(tx, dto, current);
      return tx.costCenter.update({
        where: { id },
        data: payload,
      });
    });
  }

  async createCostCenterEntry(dto: CreateCostCenterEntryDto) {
    const center = await this.prisma.costCenter.findUnique({
      where: { id: dto.costCenterId },
      select: { id: true, isActive: true },
    });
    if (!center) {
      throw new NotFoundException('Centro de custo nao encontrado.');
    }
    if (!center.isActive) {
      throw new BadRequestException(
        'Centro de custo inativo nao pode receber lancamentos.',
      );
    }

    return this.prisma.costCenterEntry.create({
      data: {
        costCenterId: dto.costCenterId,
        entryType: dto.entryType,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        amount: dto.amount,
        competenceDate: new Date(dto.competenceDate),
        notes: dto.notes,
      },
    });
  }

  async dreByCostCenter(id: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date('2000-01-01');
    const toDate = to ? new Date(to) : new Date('2999-12-31');

    const entries = await this.prisma.costCenterEntry.findMany({
      where: {
        costCenterId: id,
        competenceDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { competenceDate: 'asc' },
    });

    const revenue = entries
      .filter((e) => e.entryType === CostCenterEntryType.REVENUE)
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const costs = entries
      .filter((e) => e.entryType === CostCenterEntryType.COST)
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const expenses = entries
      .filter((e) => e.entryType === CostCenterEntryType.EXPENSE)
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);

    const grossMargin = revenue - costs;
    const operationalResult = grossMargin - expenses;

    return {
      costCenterId: id,
      period: { from: fromDate, to: toDate },
      totals: {
        revenue,
        costs,
        expenses,
        grossMargin,
        operationalResult,
        marginPercent:
          revenue > 0
            ? Number(((operationalResult / revenue) * 100).toFixed(2))
            : 0,
      },
      entries,
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    input: {
      module: string;
      entityType: string;
      entityId: string;
      action: string;
      actorUserId?: string;
      reason?: string;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    await tx.financialAuditLog.create({
      data: {
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        reason: input.reason,
        payload: input.payload,
      },
    });
  }

  private async prepareCostCenterData(
    tx: Prisma.TransactionClient,
    dto: CreateCostCenterDto | UpdateCostCenterDto,
    current?: {
      id: string;
      code: string;
      name: string;
      type: CostCenterType;
      clientId: string | null;
      contractId: string | null;
      generatorId: string | null;
      isActive: boolean;
    },
  ) {
    const type = dto.type ?? current?.type ?? CostCenterType.INTERNAL;
    const code = (dto.code ?? current?.code ?? '').trim().toUpperCase();
    const name = (dto.name ?? current?.name ?? '').trim();

    if (!code) {
      throw new BadRequestException('Codigo do centro de custo e obrigatorio.');
    }

    if (!name) {
      throw new BadRequestException('Nome do centro de custo e obrigatorio.');
    }

    const duplicateCode = await tx.costCenter.findFirst({
      where: {
        code,
        ...(current ? { id: { not: current.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicateCode) {
      throw new BadRequestException(
        'Ja existe um centro de custo com este codigo.',
      );
    }

    let clientId = dto.clientId ?? current?.clientId ?? null;
    let contractId = dto.contractId ?? current?.contractId ?? null;
    let generatorId = dto.generatorId ?? current?.generatorId ?? null;

    if (type === CostCenterType.INTERNAL) {
      clientId = null;
      contractId = null;
      generatorId = null;
    }

    if (type === CostCenterType.CLIENT) {
      if (!clientId) {
        throw new BadRequestException(
          'Centro do tipo CLIENT exige um cliente.',
        );
      }
      contractId = null;
      generatorId = null;
    }

    if (type === CostCenterType.CONTRACT) {
      if (!contractId) {
        throw new BadRequestException(
          'Centro do tipo CONTRACT exige um contrato.',
        );
      }
      const contract = await tx.serviceContract.findUnique({
        where: { id: contractId },
        select: { id: true, clientId: true },
      });
      if (!contract) {
        throw new NotFoundException('Contrato nao encontrado.');
      }

      const existing = await tx.costCenter.findFirst({
        where: {
          contractId,
          ...(current ? { id: { not: current.id } } : {}),
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'Este contrato ja possui centro de custo vinculado.',
        );
      }

      clientId = contract.clientId;
      generatorId = null;
    }

    if (type === CostCenterType.GENERATOR) {
      if (!generatorId) {
        throw new BadRequestException(
          'Centro do tipo GENERATOR exige um gerador.',
        );
      }
      const generator = await tx.generator.findUnique({
        where: { id: generatorId },
        select: { id: true, clientId: true },
      });
      if (!generator) {
        throw new NotFoundException('Gerador nao encontrado.');
      }

      const existing = await tx.costCenter.findFirst({
        where: {
          generatorId,
          ...(current ? { id: { not: current.id } } : {}),
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'Este gerador ja possui centro de custo vinculado.',
        );
      }

      clientId = generator.clientId;
      contractId = null;
    }

    return {
      code,
      name,
      type,
      clientId,
      contractId,
      generatorId,
      isActive:
        ('isActive' in dto ? dto.isActive : undefined) ??
        current?.isActive ??
        true,
    };
  }
}
