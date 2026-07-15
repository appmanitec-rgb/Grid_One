import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  AuditDomain,
  CommissionStatus,
  ContractInvoiceStatus,
  CostCenterEntryType,
  CostCenterType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateAccountsPayableDto,
  CreateAccountsReceivableDto,
  CreateBankAccountDto,
  CreateCostCenterDto,
  CreateCostCenterEntryDto,
  PayAccountsPayableDto,
  PayAccountsReceivableDto,
  ReverseReceivablePaymentDto,
  SyncOrderReceivableDto,
  UpdateBankAccountDto,
  UpdateCostCenterDto,
} from './dto/finance.dto';

@Injectable()
export class FinanceService {
  private readonly defaultContractCommissionPercent = 2;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  listReceivables() {
    return this.prisma.accountsReceivable.findMany({
      include: {
        client: { select: { id: true, companyName: true } },
        contract: { select: { id: true, code: true } },
        maintenanceOrder: { select: { id: true, title: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: {
            bankAccount: {
              select: { id: true, name: true, bankName: true },
            },
          },
        },
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
      if (gross <= 0 || net <= 0) {
        throw new BadRequestException(
          'Conta a receber precisa ter valor maior que zero.',
        );
      }

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
      if (receivable.status === AccountsReceivableStatus.PAID) {
        throw new BadRequestException('Titulo ja esta quitado.');
      }
      if (!dto.bankAccountId) {
        throw new BadRequestException(
          'Selecione uma conta bancaria/caixa para registrar a baixa.',
        );
      }

      const bankAccount = await tx.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
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

      const paidAmount = Number(receivable.paidAmount || 0);
      const paymentAmount = Number(dto.amount || 0);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new BadRequestException(
          'Valor do recebimento deve ser maior que zero.',
        );
      }

      const totalDue =
        Number(receivable.netAmount || 0) +
        Number(receivable.interestAmount || 0) +
        Number(receivable.penaltyAmount || 0);
      const outstanding = Math.max(0, totalDue - paidAmount);
      if (outstanding <= 0) {
        throw new BadRequestException('Titulo ja esta quitado.');
      }
      if (paymentAmount - outstanding > 0.009) {
        throw new BadRequestException(
          'Valor informado excede o saldo do titulo.',
        );
      }

      const effectivePaidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      const nextPaid =
        paidAmount + paymentAmount > totalDue &&
        paidAmount + paymentAmount - totalDue <= 0.009
          ? totalDue
          : paidAmount + paymentAmount;

      await tx.accountsReceivablePayment.create({
        data: {
          receivableId: id,
          bankAccountId: dto.bankAccountId,
          amount: paymentAmount,
          method: dto.method,
          paidAt: effectivePaidAt,
          actorUserId,
          notes: dto.notes,
        },
      });

      await tx.bankAccount.update({
        where: { id: dto.bankAccountId },
        data: { currentBalance: { increment: paymentAmount } },
      });

      const status =
        nextPaid >= totalDue
          ? AccountsReceivableStatus.PAID
          : AccountsReceivableStatus.PARTIAL;

      const updated = await tx.accountsReceivable.update({
        where: { id },
        data: {
          paidAmount: nextPaid,
          status,
          commissionReleased:
            status === AccountsReceivableStatus.PAID
              ? true
              : receivable.commissionReleased,
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
              paidAt: effectivePaidAt,
            },
          });
        }
      }

      let releasedCommissions = 0;
      if (status === AccountsReceivableStatus.PAID) {
        const result = await tx.commissionEntry.updateMany({
          where: {
            receivableId: id,
            status: CommissionStatus.PENDING,
          },
          data: {
            status: CommissionStatus.RELEASED,
            releasedAt: effectivePaidAt,
          },
        });
        releasedCommissions = result.count;
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: id,
        action: 'PAY',
        payload: {
          ...dto,
          amount: paymentAmount,
          bankAccountId: dto.bankAccountId,
          releasedCommissions,
        } as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async reverseReceivablePayment(
    receivableId: string,
    paymentId: string,
    dto: ReverseReceivablePaymentDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para estornar a baixa.',
        );
      }

      const payment = await tx.accountsReceivablePayment.findFirst({
        where: { id: paymentId, receivableId },
      });
      if (!payment) {
        throw new NotFoundException('Baixa do recebivel nao encontrada.');
      }
      const paymentAmount = Number(payment.amount || 0);
      if (paymentAmount <= 0) {
        throw new BadRequestException(
          'Lancamento de estorno nao pode ser estornado novamente.',
        );
      }

      const existingReversal = await tx.accountsReceivablePayment.findFirst({
        where: {
          receivableId,
          amount: -paymentAmount,
          notes: { contains: `Estorno da baixa ${payment.id}` },
        },
        select: { id: true },
      });
      if (existingReversal) {
        throw new BadRequestException(
          'Esta baixa ja possui estorno registrado.',
        );
      }

      const receivable = await tx.accountsReceivable.findUnique({
        where: { id: receivableId },
      });
      if (!receivable) {
        throw new NotFoundException('Conta a receber nao encontrada.');
      }
      if (receivable.status === AccountsReceivableStatus.CANCELED) {
        throw new BadRequestException(
          'Titulo cancelado nao pode ter baixa estornada.',
        );
      }

      const totalDue =
        Number(receivable.netAmount || 0) +
        Number(receivable.interestAmount || 0) +
        Number(receivable.penaltyAmount || 0);
      const nextPaid = Math.max(
        0,
        Number(receivable.paidAmount || 0) - paymentAmount,
      );
      const now = new Date();
      const nextStatus =
        nextPaid <= 0
          ? receivable.dueDate < now
            ? AccountsReceivableStatus.OVERDUE
            : AccountsReceivableStatus.OPEN
          : nextPaid >= totalDue
            ? AccountsReceivableStatus.PAID
            : AccountsReceivableStatus.PARTIAL;

      const reversal = await tx.accountsReceivablePayment.create({
        data: {
          receivableId,
          bankAccountId: payment.bankAccountId,
          amount: -paymentAmount,
          method: payment.method,
          paidAt: now,
          actorUserId,
          notes: `Estorno da baixa ${payment.id}: ${reason}`,
        },
      });

      if (payment.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: payment.bankAccountId },
          data: { currentBalance: { decrement: paymentAmount } },
        });
      }

      const updated = await tx.accountsReceivable.update({
        where: { id: receivableId },
        data: {
          paidAmount: nextPaid,
          status: nextStatus,
          commissionReleased:
            nextStatus === AccountsReceivableStatus.PAID
              ? receivable.commissionReleased
              : false,
          updatedAt: now,
        },
      });

      if (
        nextStatus !== AccountsReceivableStatus.PAID &&
        receivable.contractId
      ) {
        const linkedInvoice = await tx.contractInvoice.findFirst({
          where: {
            contractId: receivable.contractId,
            competenceDate: receivable.competenceDate,
            status: ContractInvoiceStatus.PAID,
          },
          select: { id: true, dueDate: true },
        });

        if (linkedInvoice) {
          await tx.contractInvoice.update({
            where: { id: linkedInvoice.id },
            data: {
              status:
                linkedInvoice.dueDate < now
                  ? ContractInvoiceStatus.OVERDUE
                  : ContractInvoiceStatus.PENDING,
              paidAt: null,
            },
          });
        }
      }

      let pendingCommissions = 0;
      if (nextStatus !== AccountsReceivableStatus.PAID) {
        const result = await tx.commissionEntry.updateMany({
          where: {
            receivableId,
            status: CommissionStatus.RELEASED,
            paidAt: null,
          },
          data: {
            status: CommissionStatus.PENDING,
            releasedAt: null,
          },
        });
        pendingCommissions = result.count;
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivableId,
        action: 'REVERSE_PAYMENT',
        reason,
        payload: {
          paymentId,
          reversalPaymentId: reversal.id,
          amount: paymentAmount,
          bankAccountId: payment.bankAccountId,
          status: nextStatus,
          pendingCommissions,
        } as unknown as Prisma.InputJsonValue,
      });

      return {
        receivable: updated,
        reversal,
      };
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
        where: {
          status: { in: ['PENDING', 'OVERDUE'] },
          amount: { gt: 0 },
          contract: {
            status: { not: 'CANCELED' },
          },
        },
        include: {
          contract: {
            select: {
              id: true,
              clientId: true,
              code: true,
              costCenterId: true,
              createdByUserId: true,
              sourceProposal: { select: { userId: true } },
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
            status: { not: AccountsReceivableStatus.CANCELED },
          },
          select: { id: true },
        });
        if (exists) continue;

        const receivable = await this.createContractReceivableSafely(tx, {
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
        });
        if (!receivable) continue;

        if (invoice.contract.costCenterId) {
          await tx.costCenterEntry.create({
            data: {
              costCenterId: invoice.contract.costCenterId,
              entryType: CostCenterEntryType.REVENUE,
              sourceType: 'ACCOUNTS_RECEIVABLE',
              sourceId: receivable.id,
              amount: invoice.amount,
              competenceDate: invoice.competenceDate,
            },
          });
        }

        await this.audit(tx, {
          module: 'FINANCE',
          entityType: 'ACCOUNTS_RECEIVABLE',
          entityId: receivable.id,
          action: 'CREATE_FROM_CONTRACT_INVOICE',
          payload: {
            contractId: invoice.contractId,
            competenceDate: invoice.competenceDate.toISOString(),
            amount: invoice.amount,
          },
        });
        await this.ensureCommissionProvision(tx, {
          userId:
            invoice.contract.sourceProposal?.userId ??
            invoice.contract.createdByUserId,
          receivableId: receivable.id,
          contractId: invoice.contractId,
          baseAmount: invoice.amount,
        });
        created += 1;
      }

      return { synced: created };
    });
  }

  async createReceivableFromOrder(
    orderId: string,
    dto: SyncOrderReceivableDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.maintenanceOrder.findUnique({
        where: { id: orderId },
        include: {
          generator: { select: { clientId: true } },
        },
      });
      if (!order) throw new NotFoundException('OS nao encontrada.');
      if (order.status === 'CANCELED') {
        throw new BadRequestException('OS cancelada nao pode gerar cobranca.');
      }
      if (!order.generator.clientId) {
        throw new BadRequestException('OS precisa ter cliente para faturar.');
      }
      if (Number(dto.amount || 0) <= 0) {
        throw new BadRequestException(
          'Valor da cobranca deve ser maior que zero.',
        );
      }

      const existing = await tx.accountsReceivable.findFirst({
        where: {
          maintenanceOrderId: orderId,
          status: { not: AccountsReceivableStatus.CANCELED },
        },
        select: { id: true },
      });
      if (existing) {
        return tx.accountsReceivable.findUnique({
          where: { id: existing.id },
          include: {
            client: { select: { id: true, companyName: true } },
            maintenanceOrder: { select: { id: true, title: true } },
          },
        });
      }

      const receivable = await tx.accountsReceivable.create({
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

      if (order.costCenterId) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: order.costCenterId,
            entryType: CostCenterEntryType.REVENUE,
            sourceType: 'ACCOUNTS_RECEIVABLE',
            sourceId: receivable.id,
            amount: dto.amount,
            competenceDate: new Date(),
          },
        });
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivable.id,
        action: 'CREATE_FROM_MAINTENANCE_ORDER',
        payload: {
          maintenanceOrderId: orderId,
          clientId: order.generator.clientId,
          amount: dto.amount,
        },
      });

      return receivable;
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

      if (!dto.bankAccountId) {
        throw new BadRequestException(
          'Selecione uma conta bancaria/caixa para registrar o pagamento.',
        );
      }

      const bankAccount = await tx.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
        select: { id: true, isActive: true },
      });
      if (!bankAccount) {
        throw new NotFoundException('Conta bancaria/caixa nao encontrada.');
      }
      if (!bankAccount.isActive) {
        throw new BadRequestException(
          'Conta bancaria/caixa inativa nao pode registrar pagamento.',
        );
      }

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

      await tx.bankAccount.update({
        where: { id: dto.bankAccountId },
        data: { currentBalance: { decrement: paymentAmount } },
      });

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
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const projections = [] as Array<{
      horizonDays: number;
      expectedIn: number;
      expectedOut: number;
      realizedIn: number;
      realizedOut: number;
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

      const receivablePaymentsAgg =
        await this.prisma.accountsReceivablePayment.aggregate({
          where: {
            paidAt: {
              gte: periodStart,
              lte: target,
            },
          },
          _sum: { amount: true },
        });

      const payablePaymentsAgg =
        await this.prisma.accountsPayablePayment.aggregate({
          where: {
            paidAt: {
              gte: periodStart,
              lte: target,
            },
          },
          _sum: { amount: true },
        });

      const expectedIn =
        Number(receivableAgg._sum.netAmount || 0) +
        Number(receivableAgg._sum.interestAmount || 0) +
        Number(receivableAgg._sum.penaltyAmount || 0) -
        Number(receivableAgg._sum.paidAmount || 0);

      const expectedOut =
        Number(payableAgg._sum.amount || 0) -
        Number(payableAgg._sum.paidAmount || 0);
      const realizedIn = Number(receivablePaymentsAgg._sum.amount || 0);
      const realizedOut = Number(payablePaymentsAgg._sum.amount || 0);

      const projectedBalance = base + expectedIn - expectedOut;

      projections.push({
        horizonDays: h,
        expectedIn,
        expectedOut,
        realizedIn,
        realizedOut,
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
    const [realizedRevenueAgg, realizedExpensesAgg] = await Promise.all([
      this.prisma.accountsReceivablePayment.aggregate({
        where: {
          paidAt: {
            gte: fromDate,
            lte: toDate,
          },
          receivable: {
            costCenterId: id,
            status: { not: AccountsReceivableStatus.CANCELED },
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.accountsPayablePayment.aggregate({
        where: {
          paidAt: {
            gte: fromDate,
            lte: toDate,
          },
          payable: {
            costCenterId: id,
            status: { not: AccountsPayableStatus.CANCELED },
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const grossMargin = revenue - costs;
    const operationalResult = grossMargin - expenses;
    const realizedRevenue = Number(realizedRevenueAgg._sum.amount || 0);
    const realizedExpenses = Number(realizedExpensesAgg._sum.amount || 0);
    const realizedOperationalResult = realizedRevenue - realizedExpenses;

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
        realizedRevenue,
        realizedCosts: 0,
        realizedExpenses,
        realizedOperationalResult,
        realizedMarginPercent:
          realizedRevenue > 0
            ? Number(
                ((realizedOperationalResult / realizedRevenue) * 100).toFixed(
                  2,
                ),
              )
            : 0,
      },
      entries,
    };
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

    const percent = this.defaultContractCommissionPercent;
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

    await this.auditLogsService.record(
      {
        domain: AuditDomain.FINANCE,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        reason: input.reason,
        afterPayload: input.payload,
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
