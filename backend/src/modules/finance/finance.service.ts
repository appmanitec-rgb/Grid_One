import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  AuditDomain,
  BankReconciliationIssueStatus,
  BankReconciliationIssueType,
  BankMovementOriginType,
  BankMovementStatus,
  BankMovementType,
  BankStatementEntryMatchStatus,
  BankStatementFileType,
  BankStatementImportStatus,
  CommissionRuleTrigger,
  CommissionStatus,
  ContractInvoiceStatus,
  CostCenterEntryType,
  CostCenterType,
  FinancialPaymentStatus,
  FinancialPeriodStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  AutoMatchBankStatementDto,
  BankMovementQueryDto,
  CreateAccountsPayableDto,
  CreateAccountsReceivableDto,
  CreateBankAdjustmentDto,
  CreateBankAccountDto,
  CreateCostCenterDto,
  CreateCostCenterEntryDto,
  CreateReconciliationIssueDto,
  CloseFinancialPeriodDto,
  IgnoreBankStatementEntryDto,
  ImportBankStatementDto,
  MatchBankStatementEntryDto,
  PayAccountsPayableDto,
  PayAccountsReceivableDto,
  ReconcileBankMovementDto,
  ReconciliationReportQueryDto,
  ReopenFinancialPeriodDto,
  ResolveReconciliationIssueDto,
  ReversePayablePaymentDto,
  ReverseReceivablePaymentDto,
  SyncOrderReceivableDto,
  UnmatchBankStatementEntryDto,
  UnreconcileBankMovementDto,
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
      await this.ensureFinancialPeriodOpen(tx, effectivePaidAt);

      const nextPaid =
        paidAmount + paymentAmount > totalDue &&
        paidAmount + paymentAmount - totalDue <= 0.009
          ? totalDue
          : paidAmount + paymentAmount;

      const payment = await tx.accountsReceivablePayment.create({
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

      const movement = await this.createBankMovement(tx, {
        bankAccountId: dto.bankAccountId,
        type: BankMovementType.CREDIT,
        amount: paymentAmount,
        movementDate: effectivePaidAt,
        competenceDate: receivable.competenceDate,
        description: `Recebimento: ${receivable.description}`,
        originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
        originId: payment.id,
        receivableId: id,
        receivablePaymentId: payment.id,
        createdById: actorUserId,
        metadata: {
          clientId: receivable.clientId,
          contractId: receivable.contractId,
          maintenanceOrderId: receivable.maintenanceOrderId,
        },
      });

      await tx.accountsReceivablePayment.update({
        where: { id: payment.id },
        data: { originalMovementId: movement.id },
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
          paymentId: payment.id,
          bankMovementId: movement.id,
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
      if (payment.status !== FinancialPaymentStatus.POSTED) {
        throw new BadRequestException('Esta baixa ja foi estornada.');
      }

      const existingReversal = await tx.accountsReceivablePayment.findFirst({
        where: {
          originalPaymentId: payment.id,
          status: FinancialPaymentStatus.REVERSAL,
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

      await this.ensureFinancialPeriodOpen(tx, payment.paidAt);

      const movementWhere: Prisma.BankMovementWhereInput[] = [
        {
          originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
          originId: payment.id,
        },
      ];
      if (payment.originalMovementId) {
        movementWhere.unshift({ id: payment.originalMovementId });
      }
      const originalMovement = await tx.bankMovement.findFirst({
        where: { OR: movementWhere },
      });
      if (!originalMovement) {
        throw new BadRequestException(
          'Baixa nao possui movimento financeiro original para estorno formal.',
        );
      }
      if (originalMovement.reconciledAt) {
        throw new BadRequestException(
          'Movimento conciliado precisa ter conciliacao desfeita antes do estorno.',
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
          status: FinancialPaymentStatus.REVERSAL,
          originalPaymentId: payment.id,
          originalMovementId: originalMovement.id,
          reversedById: actorUserId,
          reversalReason: reason,
          notes: `Estorno da baixa ${payment.id}: ${reason}`,
        },
      });

      if (!payment.bankAccountId) {
        throw new BadRequestException(
          'Baixa sem conta bancaria nao pode ser estornada formalmente.',
        );
      }

      const reversalMovement = await this.createBankMovement(tx, {
        bankAccountId: payment.bankAccountId,
        type: BankMovementType.DEBIT,
        amount: paymentAmount,
        movementDate: now,
        competenceDate: receivable.competenceDate,
        description: `Estorno de recebimento: ${receivable.description}`,
        originType: BankMovementOriginType.REVERSAL,
        originId: reversal.id,
        receivableId,
        receivablePaymentId: reversal.id,
        reversalOfMovementId: originalMovement.id,
        createdById: actorUserId,
        metadata: {
          originalPaymentId: payment.id,
          originalMovementId: originalMovement.id,
          reason,
        },
      });

      await tx.accountsReceivablePayment.update({
        where: { id: payment.id },
        data: {
          status: FinancialPaymentStatus.REVERSED,
          reversedAt: now,
          reversedById: actorUserId,
          reversalReason: reason,
          originalMovementId: originalMovement.id,
          reversalMovementId: reversalMovement.id,
        },
      });

      await tx.accountsReceivablePayment.update({
        where: { id: reversal.id },
        data: { reversalMovementId: reversalMovement.id },
      });

      await tx.bankMovement.update({
        where: { id: originalMovement.id },
        data: { status: BankMovementStatus.REVERSED },
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
          originalMovementId: originalMovement.id,
          reversalMovementId: reversalMovement.id,
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
      await this.ensureFinancialPeriodOpen(tx, effectivePaidAt);

      const payment = await tx.accountsPayablePayment.create({
        data: {
          payableId: id,
          bankAccountId: dto.bankAccountId,
          amount: paymentAmount,
          method: dto.method,
          paidAt: effectivePaidAt,
          actorUserId,
          notes: dto.notes,
        },
      });

      const movement = await this.createBankMovement(tx, {
        bankAccountId: dto.bankAccountId,
        type: BankMovementType.DEBIT,
        amount: paymentAmount,
        movementDate: effectivePaidAt,
        competenceDate: payable.competenceDate ?? payable.dueDate,
        description: `Pagamento: ${payable.description}`,
        originType: BankMovementOriginType.ACCOUNTS_PAYABLE_PAYMENT,
        originId: payment.id,
        payableId: id,
        payablePaymentId: payment.id,
        createdById: actorUserId,
        metadata: {
          supplierId: payable.supplierId,
          purchaseOrderId: payable.purchaseOrderId,
        },
      });

      await tx.accountsPayablePayment.update({
        where: { id: payment.id },
        data: { originalMovementId: movement.id },
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
        payload: {
          ...dto,
          amount: paymentAmount,
          paymentId: payment.id,
          bankMovementId: movement.id,
        } as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async reversePayablePayment(
    payableId: string,
    paymentId: string,
    dto: ReversePayablePaymentDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para estornar o pagamento.',
        );
      }

      const payment = await tx.accountsPayablePayment.findFirst({
        where: { id: paymentId, payableId },
      });
      if (!payment) {
        throw new NotFoundException('Pagamento do titulo nao encontrado.');
      }
      const paymentAmount = Number(payment.amount || 0);
      if (paymentAmount <= 0) {
        throw new BadRequestException(
          'Lancamento de estorno nao pode ser estornado novamente.',
        );
      }
      if (payment.status !== FinancialPaymentStatus.POSTED) {
        throw new BadRequestException('Este pagamento ja foi estornado.');
      }

      const existingReversal = await tx.accountsPayablePayment.findFirst({
        where: {
          originalPaymentId: payment.id,
          status: FinancialPaymentStatus.REVERSAL,
        },
        select: { id: true },
      });
      if (existingReversal) {
        throw new BadRequestException(
          'Este pagamento ja possui estorno registrado.',
        );
      }

      const payable = await tx.accountsPayable.findUnique({
        where: { id: payableId },
      });
      if (!payable) {
        throw new NotFoundException('Conta a pagar nao encontrada.');
      }
      if (payable.status === AccountsPayableStatus.CANCELED) {
        throw new BadRequestException(
          'Titulo cancelado nao pode ter pagamento estornado.',
        );
      }

      await this.ensureFinancialPeriodOpen(tx, payment.paidAt);

      const movementWhere: Prisma.BankMovementWhereInput[] = [
        {
          originType: BankMovementOriginType.ACCOUNTS_PAYABLE_PAYMENT,
          originId: payment.id,
        },
      ];
      if (payment.originalMovementId) {
        movementWhere.unshift({ id: payment.originalMovementId });
      }
      const originalMovement = await tx.bankMovement.findFirst({
        where: { OR: movementWhere },
      });
      if (!originalMovement) {
        throw new BadRequestException(
          'Pagamento nao possui movimento financeiro original para estorno formal.',
        );
      }
      if (originalMovement.reconciledAt) {
        throw new BadRequestException(
          'Movimento conciliado precisa ter conciliacao desfeita antes do estorno.',
        );
      }
      if (!payment.bankAccountId) {
        throw new BadRequestException(
          'Pagamento sem conta bancaria nao pode ser estornado formalmente.',
        );
      }

      const now = new Date();
      const nextPaid = Math.max(
        0,
        Number(payable.paidAmount || 0) - paymentAmount,
      );
      const nextStatus =
        nextPaid <= 0
          ? payable.dueDate < now
            ? AccountsPayableStatus.OVERDUE
            : AccountsPayableStatus.OPEN
          : nextPaid >= Number(payable.amount || 0)
            ? AccountsPayableStatus.PAID
            : AccountsPayableStatus.OPEN;

      const reversal = await tx.accountsPayablePayment.create({
        data: {
          payableId,
          bankAccountId: payment.bankAccountId,
          amount: -paymentAmount,
          method: payment.method,
          paidAt: now,
          actorUserId,
          status: FinancialPaymentStatus.REVERSAL,
          originalPaymentId: payment.id,
          originalMovementId: originalMovement.id,
          reversedById: actorUserId,
          reversalReason: reason,
          notes: `Estorno do pagamento ${payment.id}: ${reason}`,
        },
      });

      const reversalMovement = await this.createBankMovement(tx, {
        bankAccountId: payment.bankAccountId,
        type: BankMovementType.CREDIT,
        amount: paymentAmount,
        movementDate: now,
        competenceDate: payable.competenceDate ?? payable.dueDate,
        description: `Estorno de pagamento: ${payable.description}`,
        originType: BankMovementOriginType.REVERSAL,
        originId: reversal.id,
        payableId,
        payablePaymentId: reversal.id,
        reversalOfMovementId: originalMovement.id,
        createdById: actorUserId,
        metadata: {
          originalPaymentId: payment.id,
          originalMovementId: originalMovement.id,
          reason,
        },
      });

      await tx.accountsPayablePayment.update({
        where: { id: payment.id },
        data: {
          status: FinancialPaymentStatus.REVERSED,
          reversedAt: now,
          reversedById: actorUserId,
          reversalReason: reason,
          originalMovementId: originalMovement.id,
          reversalMovementId: reversalMovement.id,
        },
      });
      await tx.accountsPayablePayment.update({
        where: { id: reversal.id },
        data: { reversalMovementId: reversalMovement.id },
      });
      await tx.bankMovement.update({
        where: { id: originalMovement.id },
        data: { status: BankMovementStatus.REVERSED },
      });

      await tx.bankAccount.update({
        where: { id: payment.bankAccountId },
        data: { currentBalance: { increment: paymentAmount } },
      });

      const updated = await tx.accountsPayable.update({
        where: { id: payableId },
        data: {
          paidAmount: nextPaid,
          status: nextStatus,
          paidAt:
            nextStatus === AccountsPayableStatus.PAID ? payable.paidAt : null,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'ACCOUNTS_PAYABLE',
        entityId: payableId,
        action: 'REVERSE_PAYMENT',
        reason,
        payload: {
          paymentId,
          reversalPaymentId: reversal.id,
          amount: paymentAmount,
          bankAccountId: payment.bankAccountId,
          originalMovementId: originalMovement.id,
          reversalMovementId: reversalMovement.id,
          status: nextStatus,
        } as unknown as Prisma.InputJsonValue,
      });

      return {
        payable: updated,
        reversal,
      };
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

  async importBankStatement(
    bankAccountId: string,
    dto: ImportBankStatementDto,
    actorUserId?: string,
  ) {
    const content = this.decodeStatementContent(dto);
    const checksumSha256 = createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');

    const parsedEntries = this.parseStatementEntries(dto.fileType, content);
    if (parsedEntries.length === 0) {
      throw new BadRequestException('Extrato bancario nao possui lancamentos.');
    }

    this.assertNoDuplicatedExternalIds(parsedEntries);
    const periodStart = new Date(
      Math.min(...parsedEntries.map((entry) => entry.postedDate.getTime())),
    );
    const periodEnd = new Date(
      Math.max(...parsedEntries.map((entry) => entry.postedDate.getTime())),
    );

    return this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findUnique({
        where: { id: bankAccountId },
        select: { id: true, isActive: true },
      });
      if (!bankAccount) {
        throw new NotFoundException('Conta bancaria/caixa nao encontrada.');
      }
      if (!bankAccount.isActive) {
        throw new BadRequestException(
          'Conta bancaria/caixa inativa nao pode receber importacao.',
        );
      }

      const duplicate = await tx.bankStatementImport.findUnique({
        where: {
          bankAccountId_checksumSha256: {
            bankAccountId,
            checksumSha256,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException(
          'Este arquivo de extrato ja foi importado para a conta selecionada.',
        );
      }

      const statementImport = await tx.bankStatementImport.create({
        data: {
          bankAccountId,
          fileName: dto.fileName.trim(),
          fileType: dto.fileType,
          importedById: actorUserId,
          periodStart,
          periodEnd,
          checksumSha256,
          metadata: {
            rows: parsedEntries.length,
            parser: dto.fileType === BankStatementFileType.CSV ? 'csv' : 'ofx',
          },
        },
      });

      for (const entry of parsedEntries) {
        try {
          await tx.bankStatementEntry.create({
            data: {
              importId: statementImport.id,
              bankAccountId,
              postedDate: entry.postedDate,
              amount: entry.amount,
              type: entry.type,
              description: entry.description,
              documentNumber: entry.documentNumber,
              bankReference: entry.bankReference,
              fitId: entry.fitId,
              externalId: entry.externalId,
            },
          });
        } catch (error: unknown) {
          if (this.isUniqueConstraintError(error)) {
            throw new BadRequestException(
              'Lancamento bancario duplicado pelo identificador externo.',
            );
          }
          throw error;
        }
      }

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_IMPORT',
        entityId: statementImport.id,
        action: 'IMPORT_STATEMENT',
        payload: {
          bankAccountId,
          fileName: dto.fileName,
          fileType: dto.fileType,
          entries: parsedEntries.length,
          checksumSha256,
        },
      });

      return tx.bankStatementImport.findUnique({
        where: { id: statementImport.id },
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
          entries: { orderBy: [{ postedDate: 'asc' }, { createdAt: 'asc' }] },
        },
      });
    });
  }

  listBankStatements(bankAccountId: string) {
    return this.prisma.bankStatementImport.findMany({
      where: { bankAccountId },
      include: {
        bankAccount: { select: { id: true, name: true, bankName: true } },
        _count: { select: { entries: true, issues: true } },
      },
      orderBy: { importedAt: 'desc' },
    });
  }

  getBankStatement(id: string) {
    return this.prisma.bankStatementImport.findUnique({
      where: { id },
      include: {
        bankAccount: { select: { id: true, name: true, bankName: true } },
        importedBy: { select: { id: true, name: true, email: true } },
        entries: {
          include: {
            matchedMovement: {
              select: {
                id: true,
                description: true,
                movementDate: true,
                amount: true,
                type: true,
              },
            },
          },
          orderBy: [{ postedDate: 'asc' }, { createdAt: 'asc' }],
        },
        issues: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  listBankStatementEntries(id: string) {
    return this.prisma.bankStatementEntry.findMany({
      where: { importId: id },
      include: {
        matchedMovement: {
          select: {
            id: true,
            description: true,
            movementDate: true,
            amount: true,
            type: true,
            reconciledAt: true,
          },
        },
      },
      orderBy: [{ postedDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async autoMatchBankStatement(
    id: string,
    dto: AutoMatchBankStatementDto = {},
    actorUserId?: string,
  ) {
    const dateWindowDays = dto.dateWindowDays ?? 2;

    return this.prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatementImport.findUnique({
        where: { id },
        include: {
          entries: {
            where: { matchStatus: BankStatementEntryMatchStatus.UNMATCHED },
            orderBy: [{ postedDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (!statement) {
        throw new NotFoundException('Extrato importado nao encontrado.');
      }

      let autoMatched = 0;
      let ambiguous = 0;
      let unmatched = 0;

      for (const entry of statement.entries) {
        const exactCandidates = await this.findMovementCandidates(tx, entry, 0);
        const candidates =
          exactCandidates.length > 0
            ? exactCandidates
            : await this.findMovementCandidates(tx, entry, dateWindowDays);

        if (candidates.length === 1) {
          const movement = candidates[0];
          const confidenceScore = exactCandidates.length === 1 ? 1 : 0.82;
          await this.applyStatementMatch(tx, {
            entryId: entry.id,
            movementId: movement.id,
            status: BankStatementEntryMatchStatus.AUTO_MATCHED,
            confidenceScore,
            actorUserId,
            reference: entry.bankReference ?? entry.externalId ?? entry.id,
            note: `Conciliacao automatica do extrato ${statement.fileName}`,
          });
          autoMatched += 1;
        } else if (candidates.length > 1) {
          ambiguous += 1;
          await this.createReconciliationIssueSafely(tx, {
            bankAccountId: entry.bankAccountId,
            statementImportId: entry.importId,
            statementEntryId: entry.id,
            type: BankReconciliationIssueType.MISSING_MOVEMENT,
            reason:
              'Matching automatico encontrou mais de um movimento candidato.',
          });
        } else {
          unmatched += 1;
        }
      }

      await this.updateBankStatementStatus(tx, id);

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_IMPORT',
        entityId: id,
        action: 'AUTO_MATCH_STATEMENT',
        payload: { autoMatched, ambiguous, unmatched, dateWindowDays },
      });

      return { autoMatched, ambiguous, unmatched };
    });
  }

  async matchBankStatementEntry(
    id: string,
    dto: MatchBankStatementEntryDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.bankStatementEntry.findUnique({
        where: { id },
      });
      if (!entry) {
        throw new NotFoundException('Lancamento do extrato nao encontrado.');
      }
      if (entry.matchStatus !== BankStatementEntryMatchStatus.UNMATCHED) {
        throw new BadRequestException(
          'Lancamento bancario ja possui tratamento de conciliacao.',
        );
      }

      const movement = await tx.bankMovement.findUnique({
        where: { id: dto.movementId },
      });
      if (!movement) {
        throw new NotFoundException('Movimento financeiro nao encontrado.');
      }
      await this.assertCanMatchEntryWithMovement(tx, entry, movement);
      await this.ensureFinancialPeriodOpen(tx, entry.postedDate);

      await this.applyStatementMatch(tx, {
        entryId: entry.id,
        movementId: movement.id,
        status: BankStatementEntryMatchStatus.MANUAL_MATCHED,
        confidenceScore: 1,
        actorUserId,
        reference: entry.bankReference ?? entry.externalId ?? entry.id,
        note: 'Conciliacao manual com extrato bancario importado.',
      });

      await this.updateBankStatementStatus(tx, entry.importId);
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_ENTRY',
        entityId: id,
        action: 'MANUAL_MATCH',
        payload: { movementId: movement.id },
      });

      return tx.bankStatementEntry.findUnique({
        where: { id },
        include: { matchedMovement: true },
      });
    });
  }

  async unmatchBankStatementEntry(
    id: string,
    dto: UnmatchBankStatementEntryDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para desfazer o match.',
        );
      }

      const entry = await tx.bankStatementEntry.findUnique({ where: { id } });
      if (!entry) {
        throw new NotFoundException('Lancamento do extrato nao encontrado.');
      }
      if (!entry.matchedMovementId) {
        throw new BadRequestException('Lancamento ainda nao esta conciliado.');
      }
      await this.ensureFinancialPeriodOpen(tx, entry.postedDate);

      await tx.bankStatementEntry.update({
        where: { id },
        data: {
          matchedMovementId: null,
          matchStatus: BankStatementEntryMatchStatus.UNMATCHED,
          confidenceScore: null,
        },
      });

      await tx.bankMovement.update({
        where: { id: entry.matchedMovementId },
        data: {
          reconciledAt: null,
          reconciledById: null,
          reconciliationReference: null,
          reconciliationNote: null,
        },
      });

      await this.createReconciliationIssueSafely(tx, {
        bankAccountId: entry.bankAccountId,
        statementImportId: entry.importId,
        statementEntryId: entry.id,
        movementId: entry.matchedMovementId,
        type: BankReconciliationIssueType.MISSING_MOVEMENT,
        reason,
      });
      await this.updateBankStatementStatus(tx, entry.importId);
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_ENTRY',
        entityId: id,
        action: 'UNMATCH',
        reason,
      });

      return { id, unmatched: true };
    });
  }

  async ignoreBankStatementEntry(
    id: string,
    dto: IgnoreBankStatementEntryDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para ignorar o lancamento.',
        );
      }

      const entry = await tx.bankStatementEntry.findUnique({ where: { id } });
      if (!entry) {
        throw new NotFoundException('Lancamento do extrato nao encontrado.');
      }
      if (entry.matchedMovementId) {
        throw new BadRequestException(
          'Lancamento conciliado precisa ter match desfeito antes de ignorar.',
        );
      }

      const ignored = await tx.bankStatementEntry.update({
        where: { id },
        data: {
          matchStatus: BankStatementEntryMatchStatus.IGNORED,
          ignoreReason: reason,
        },
      });

      await this.createReconciliationIssueSafely(tx, {
        bankAccountId: entry.bankAccountId,
        statementImportId: entry.importId,
        statementEntryId: entry.id,
        type: BankReconciliationIssueType.IGNORED_ENTRY,
        status: BankReconciliationIssueStatus.IGNORED,
        reason,
        resolvedAt: new Date(),
        resolvedById: actorUserId,
      });
      await this.updateBankStatementStatus(tx, entry.importId);
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_ENTRY',
        entityId: id,
        action: 'IGNORE_STATEMENT_ENTRY',
        reason,
      });

      return ignored;
    });
  }

  async createBankAdjustmentFromStatementEntry(
    id: string,
    dto: CreateBankAdjustmentDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para criar o ajuste.',
        );
      }

      const entry = await tx.bankStatementEntry.findUnique({ where: { id } });
      if (!entry) {
        throw new NotFoundException('Lancamento do extrato nao encontrado.');
      }
      if (entry.matchedMovementId) {
        throw new BadRequestException('Lancamento ja esta conciliado.');
      }
      if (
        entry.type !== dto.type ||
        Math.abs(entry.amount - dto.amount) > 0.009
      ) {
        throw new BadRequestException(
          'Ajuste controlado deve ter mesmo tipo e valor do lancamento bancario.',
        );
      }

      const postedDate = new Date(dto.postedDate);
      await this.ensureFinancialPeriodOpen(tx, postedDate);
      const movement = await this.createBankMovement(tx, {
        bankAccountId: entry.bankAccountId,
        type: dto.type,
        amount: dto.amount,
        movementDate: postedDate,
        competenceDate: postedDate,
        description: dto.description,
        originType: BankMovementOriginType.MANUAL_ADJUSTMENT,
        originId: entry.id,
        createdById: actorUserId,
        metadata: {
          statementEntryId: entry.id,
          reason,
          bankReference: entry.bankReference,
        },
      });

      await tx.bankAccount.update({
        where: { id: entry.bankAccountId },
        data: {
          currentBalance:
            dto.type === BankMovementType.CREDIT
              ? { increment: dto.amount }
              : { decrement: dto.amount },
        },
      });

      await this.applyStatementMatch(tx, {
        entryId: entry.id,
        movementId: movement.id,
        status: BankStatementEntryMatchStatus.MANUAL_MATCHED,
        confidenceScore: 1,
        actorUserId,
        reference: entry.bankReference ?? entry.externalId ?? entry.id,
        note: `Ajuste controlado: ${reason}`,
      });

      await this.createReconciliationIssueSafely(tx, {
        bankAccountId: entry.bankAccountId,
        statementImportId: entry.importId,
        statementEntryId: entry.id,
        movementId: movement.id,
        type: BankReconciliationIssueType.MANUAL_ADJUSTMENT,
        status: BankReconciliationIssueStatus.RESOLVED,
        reason,
        resolvedAt: new Date(),
        resolvedById: actorUserId,
      });
      await this.updateBankStatementStatus(tx, entry.importId);
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_STATEMENT_ENTRY',
        entityId: id,
        action: 'CREATE_CONTROLLED_ADJUSTMENT',
        reason,
        payload: {
          movementId: movement.id,
          amount: dto.amount,
          type: dto.type,
        },
      });

      return { movementId: movement.id, matched: true };
    });
  }

  async createReconciliationIssue(
    dto: CreateReconciliationIssueDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const issue = await this.createReconciliationIssueSafely(tx, {
        bankAccountId: dto.bankAccountId,
        statementEntryId: dto.statementEntryId,
        movementId: dto.movementId,
        type: dto.type,
        reason: dto.reason,
      });
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_RECONCILIATION_ISSUE',
        entityId: issue.id,
        action: 'CREATE_ISSUE',
        reason: dto.reason,
      });
      return issue;
    });
  }

  async resolveReconciliationIssue(
    id: string,
    dto: ResolveReconciliationIssueDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para resolver a divergencia.',
        );
      }
      const issue = await tx.bankReconciliationIssue.findUnique({
        where: { id },
      });
      if (!issue) {
        throw new NotFoundException(
          'Divergencia de conciliacao nao encontrada.',
        );
      }

      const updated = await tx.bankReconciliationIssue.update({
        where: { id },
        data: {
          status: BankReconciliationIssueStatus.RESOLVED,
          reason,
          resolvedAt: new Date(),
          resolvedById: actorUserId,
        },
      });
      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_RECONCILIATION_ISSUE',
        entityId: id,
        action: 'RESOLVE_ISSUE',
        reason,
      });
      return updated;
    });
  }

  async reconciliationReport(query: ReconciliationReportQueryDto) {
    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Periodo do relatorio invalido.');
    }

    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: query.bankAccountId },
      select: { id: true, name: true, bankName: true, initialBalance: true },
    });
    if (!bankAccount) {
      throw new NotFoundException('Conta bancaria/caixa nao encontrada.');
    }

    const beforeMovements = await this.prisma.bankMovement.findMany({
      where: {
        bankAccountId: query.bankAccountId,
        movementDate: { lt: fromDate },
      },
      select: { type: true, amount: true },
    });
    const movements = await this.prisma.bankMovement.findMany({
      where: {
        bankAccountId: query.bankAccountId,
        movementDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        movementDate: true,
        reconciledAt: true,
      },
    });
    const statementEntries = await this.prisma.bankStatementEntry.findMany({
      where: {
        bankAccountId: query.bankAccountId,
        postedDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        amount: true,
        type: true,
        matchStatus: true,
        matchedMovementId: true,
      },
    });
    const issues = await this.prisma.bankReconciliationIssue.findMany({
      where: {
        bankAccountId: query.bankAccountId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { id: true, status: true, type: true },
    });
    const periodKey = this.getPeriodKey(fromDate);
    const closing = await this.prisma.financialPeriodClosing.findUnique({
      where: { year_month: periodKey },
    });

    const openingBalance =
      Number(bankAccount.initialBalance || 0) +
      this.sumMovementDelta(beforeMovements);
    const credits = movements
      .filter((movement) => movement.type === BankMovementType.CREDIT)
      .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
    const debits = movements
      .filter((movement) => movement.type === BankMovementType.DEBIT)
      .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
    const finalBalance = openingBalance + credits - debits;
    const reconciledMovements = movements.filter(
      (movement) => movement.reconciledAt,
    ).length;
    const unreconciledMovements = movements.length - reconciledMovements;
    const unmatchedStatementEntries = statementEntries.filter(
      (entry) => entry.matchStatus === BankStatementEntryMatchStatus.UNMATCHED,
    ).length;
    const openIssues = issues.filter(
      (issue) => issue.status === BankReconciliationIssueStatus.OPEN,
    ).length;
    const resolvedIssues = issues.filter(
      (issue) => issue.status === BankReconciliationIssueStatus.RESOLVED,
    ).length;

    return {
      bankAccount,
      period: { from: fromDate, to: toDate },
      closing: closing
        ? { id: closing.id, status: closing.status, closedAt: closing.closedAt }
        : { status: FinancialPeriodStatus.OPEN },
      totals: {
        openingBalance,
        finalBalance,
        credits,
        debits,
        movements: movements.length,
        reconciledMovements,
        unreconciledMovements,
        statementEntries: statementEntries.length,
        unmatchedStatementEntries,
        openIssues,
        resolvedIssues,
      },
      issues,
    };
  }

  async listBankMovements(query: BankMovementQueryDto = {}) {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    const where: Prisma.BankMovementWhereInput = {
      ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.originType ? { originType: query.originType } : {}),
      ...(fromDate || toDate
        ? {
            movementDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const allAccounts = await this.prisma.bankAccount.findMany({
      where: query.bankAccountId
        ? { id: query.bankAccountId }
        : { isActive: true },
      select: { id: true, initialBalance: true },
    });

    const accountIds = allAccounts.map((account) => account.id);
    if (!query.bankAccountId) {
      where.bankAccountId = { in: accountIds };
    }
    const openingInitial = allAccounts.reduce(
      (sum, account) => sum + Number(account.initialBalance || 0),
      0,
    );

    const beforeMovements = fromDate
      ? await this.prisma.bankMovement.findMany({
          where: {
            bankAccountId: { in: accountIds },
            movementDate: { lt: fromDate },
          },
          select: { type: true, amount: true },
        })
      : [];
    const openingMovements = this.sumMovementDelta(beforeMovements);
    const openingBalance = openingInitial + openingMovements;

    const movements = await this.prisma.bankMovement.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true, bankName: true } },
        receivable: {
          select: {
            id: true,
            description: true,
            contractId: true,
            maintenanceOrderId: true,
          },
        },
        payable: {
          select: { id: true, description: true, purchaseOrderId: true },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        reconciledBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
    });

    let runningBalance = openingBalance;
    const entries = movements.map((movement) => {
      runningBalance += this.movementDelta(movement);
      return {
        ...movement,
        runningBalance,
      };
    });

    const totals = {
      credits: movements
        .filter((movement) => movement.type === BankMovementType.CREDIT)
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0),
      debits: movements
        .filter((movement) => movement.type === BankMovementType.DEBIT)
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0),
    };

    return {
      period: { from: fromDate, to: toDate },
      openingBalance,
      entries,
      totals,
      finalBalance: runningBalance,
    };
  }

  async reconcileBankMovement(
    id: string,
    dto: ReconcileBankMovementDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.bankMovement.findUnique({ where: { id } });
      if (!movement) {
        throw new NotFoundException('Movimento financeiro nao encontrado.');
      }
      if (movement.reconciledAt) {
        throw new BadRequestException('Movimento ja esta conciliado.');
      }

      const updated = await tx.bankMovement.update({
        where: { id },
        data: {
          reconciledAt: new Date(),
          reconciledById: actorUserId,
          reconciliationReference: dto.reconciliationReference,
          reconciliationNote: dto.reconciliationNote,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_MOVEMENT',
        entityId: id,
        action: 'RECONCILE',
        payload: dto as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  async unreconcileBankMovement(
    id: string,
    dto: UnreconcileBankMovementDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para desfazer a conciliacao.',
        );
      }

      const movement = await tx.bankMovement.findUnique({ where: { id } });
      if (!movement) {
        throw new NotFoundException('Movimento financeiro nao encontrado.');
      }
      if (!movement.reconciledAt) {
        throw new BadRequestException('Movimento ainda nao esta conciliado.');
      }

      const updated = await tx.bankMovement.update({
        where: { id },
        data: {
          reconciledAt: null,
          reconciledById: null,
          reconciliationReference: null,
          reconciliationNote: null,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'BANK_MOVEMENT',
        entityId: id,
        action: 'UNRECONCILE',
        reason,
      });

      return updated;
    });
  }

  async updateBankMovement(id: string) {
    const movement = await this.prisma.bankMovement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!movement) {
      throw new NotFoundException('Movimento financeiro nao encontrado.');
    }

    throw new BadRequestException(
      'Movimento financeiro lancado e imutavel. Use estorno ou ajuste reverso.',
    );
  }

  listPeriodClosings() {
    return this.prisma.financialPeriodClosing.findMany({
      include: {
        closedBy: { select: { id: true, name: true, email: true } },
        reopenedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async closeFinancialPeriod(
    dto: CloseFinancialPeriodDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      this.validatePeriodInput(dto.year, dto.month, dto.reason);

      const current = await tx.financialPeriodClosing.findUnique({
        where: { year_month: { year: dto.year, month: dto.month } },
      });
      if (current?.status === FinancialPeriodStatus.CLOSED) {
        throw new BadRequestException('Periodo financeiro ja esta fechado.');
      }

      const closedAt = new Date();
      const closing = current
        ? await tx.financialPeriodClosing.update({
            where: { id: current.id },
            data: {
              status: FinancialPeriodStatus.CLOSED,
              closedAt,
              closedById: actorUserId,
              closeReason: dto.reason.trim(),
              reopenedAt: null,
              reopenedById: null,
              reopenReason: null,
            },
          })
        : await tx.financialPeriodClosing.create({
            data: {
              year: dto.year,
              month: dto.month,
              status: FinancialPeriodStatus.CLOSED,
              closedAt,
              closedById: actorUserId,
              closeReason: dto.reason.trim(),
            },
          });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'FINANCIAL_PERIOD_CLOSING',
        entityId: closing.id,
        action: 'CLOSE_PERIOD',
        reason: dto.reason,
        payload: { year: dto.year, month: dto.month },
      });

      return closing;
    });
  }

  async reopenFinancialPeriod(
    id: string,
    dto: ReopenFinancialPeriodDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reason = dto.reason?.trim();
      if (!reason || reason.length < 4) {
        throw new BadRequestException(
          'Informe um motivo claro para reabrir o periodo.',
        );
      }

      const current = await tx.financialPeriodClosing.findUnique({
        where: { id },
      });
      if (!current) {
        throw new NotFoundException('Periodo financeiro nao encontrado.');
      }
      if (current.status !== FinancialPeriodStatus.CLOSED) {
        throw new BadRequestException('Periodo financeiro ja esta aberto.');
      }

      const reopened = await tx.financialPeriodClosing.update({
        where: { id },
        data: {
          status: FinancialPeriodStatus.OPEN,
          reopenedAt: new Date(),
          reopenedById: actorUserId,
          reopenReason: reason,
        },
      });

      await this.audit(tx, {
        actorUserId,
        module: 'FINANCE',
        entityType: 'FINANCIAL_PERIOD_CLOSING',
        entityId: id,
        action: 'REOPEN_PERIOD',
        reason,
        payload: { year: current.year, month: current.month },
      });

      return reopened;
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

      const [realizedCreditsAgg, realizedDebitsAgg] = await Promise.all([
        this.prisma.bankMovement.aggregate({
          where: {
            type: BankMovementType.CREDIT,
            movementDate: {
              gte: periodStart,
              lte: target,
            },
          },
          _sum: { amount: true },
        }),
        this.prisma.bankMovement.aggregate({
          where: {
            type: BankMovementType.DEBIT,
            movementDate: {
              gte: periodStart,
              lte: target,
            },
          },
          _sum: { amount: true },
        }),
      ]);

      const expectedIn =
        Number(receivableAgg._sum.netAmount || 0) +
        Number(receivableAgg._sum.interestAmount || 0) +
        Number(receivableAgg._sum.penaltyAmount || 0) -
        Number(receivableAgg._sum.paidAmount || 0);

      const expectedOut =
        Number(payableAgg._sum.amount || 0) -
        Number(payableAgg._sum.paidAmount || 0);
      const realizedIn = Number(realizedCreditsAgg._sum.amount || 0);
      const realizedOut = Number(realizedDebitsAgg._sum.amount || 0);

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
      this.prisma.bankMovement.aggregate({
        where: {
          type: BankMovementType.CREDIT,
          originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
          movementDate: {
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
      this.prisma.bankMovement.aggregate({
        where: {
          type: BankMovementType.DEBIT,
          originType: BankMovementOriginType.ACCOUNTS_PAYABLE_PAYMENT,
          movementDate: {
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

  private decodeStatementContent(dto: ImportBankStatementDto) {
    if (!dto.content?.trim()) {
      throw new BadRequestException('Conteudo do extrato nao informado.');
    }
    if (dto.contentBase64) {
      try {
        return Buffer.from(dto.content, 'base64').toString('utf8');
      } catch {
        throw new BadRequestException('Conteudo base64 do extrato invalido.');
      }
    }
    return dto.content;
  }

  private parseStatementEntries(
    fileType: BankStatementFileType,
    content: string,
  ) {
    if (fileType === BankStatementFileType.CSV) {
      return this.parseCsvStatement(content);
    }
    if (fileType === BankStatementFileType.OFX) {
      return this.parseOfxStatement(content);
    }
    throw new BadRequestException(
      'Importacao CNAB esta preparada no modelo, mas ainda nao foi habilitada neste ciclo.',
    );
  }

  private parseCsvStatement(content: string) {
    const rows = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);
    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV de extrato precisa ter cabecalho e ao menos uma linha.',
      );
    }

    const delimiter = rows[0].includes(';') ? ';' : ',';
    const headers = this.splitCsvLine(rows[0], delimiter).map((header) =>
      this.normalizeHeader(header),
    );
    const findColumn = (...names: string[]) =>
      names.map((name) => headers.indexOf(name)).find((index) => index !== -1);

    const dateIndex = findColumn('data', 'posteddate', 'dtposted');
    const descriptionIndex = findColumn(
      'descricao',
      'description',
      'historico',
    );
    const amountIndex = findColumn('valor', 'amount', 'vlr');
    const typeIndex = findColumn('tipo', 'type', 'natureza');
    const documentIndex = findColumn('documento', 'documentnumber', 'doc');
    const referenceIndex = findColumn(
      'referencia',
      'bankreference',
      'reference',
      'fitid',
      'externalid',
    );

    if (
      dateIndex === undefined ||
      descriptionIndex === undefined ||
      amountIndex === undefined
    ) {
      throw new BadRequestException(
        'CSV precisa conter colunas data, descricao e valor.',
      );
    }

    return rows.slice(1).map((row, offset) => {
      const cells = this.splitCsvLine(row, delimiter);
      const postedDate = this.parseStatementDate(cells[dateIndex], offset + 2);
      const rawAmount = this.parseStatementAmount(
        cells[amountIndex],
        offset + 2,
      );
      const type = this.resolveStatementType(
        typeIndex !== undefined ? cells[typeIndex] : undefined,
        rawAmount,
        offset + 2,
      );
      const description = (cells[descriptionIndex] || '').trim();
      if (!description) {
        throw new BadRequestException(
          `Descricao invalida na linha ${offset + 2} do CSV.`,
        );
      }
      const documentNumber =
        documentIndex !== undefined ? cells[documentIndex]?.trim() : undefined;
      const bankReference =
        referenceIndex !== undefined
          ? cells[referenceIndex]?.trim()
          : undefined;
      const externalId = bankReference || documentNumber || undefined;

      return {
        postedDate,
        amount: Math.abs(rawAmount),
        type,
        description,
        documentNumber: documentNumber || undefined,
        bankReference: bankReference || undefined,
        fitId: bankReference || undefined,
        externalId,
      };
    });
  }

  private parseOfxStatement(content: string) {
    const blocks = content.match(
      /<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>)/gi,
    );
    if (!blocks?.length) {
      throw new BadRequestException(
        'OFX nao possui blocos STMTTRN reconheciveis.',
      );
    }

    return blocks.map((block, index) => {
      const amount = this.parseStatementAmount(
        this.readOfxTag(block, 'TRNAMT') || '',
        index + 1,
      );
      const type = this.resolveStatementType(
        this.readOfxTag(block, 'TRNTYPE') || undefined,
        amount,
        index + 1,
      );
      const postedDate = this.parseStatementDate(
        this.readOfxTag(block, 'DTPOSTED') || '',
        index + 1,
      );
      const fitId = this.readOfxTag(block, 'FITID') || undefined;
      const documentNumber = this.readOfxTag(block, 'CHECKNUM') || undefined;
      const description =
        this.readOfxTag(block, 'MEMO') ||
        this.readOfxTag(block, 'NAME') ||
        `Lancamento OFX ${index + 1}`;

      return {
        postedDate,
        amount: Math.abs(amount),
        type,
        description: description.trim(),
        documentNumber,
        bankReference: fitId,
        fitId,
        externalId: fitId,
      };
    });
  }

  private splitCsvLine(line: string, delimiter = ',') {
    const cells: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  private normalizeHeader(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private readOfxTag(block: string, tag: string) {
    const match = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i').exec(block);
    return match?.[1]?.trim();
  }

  private parseStatementDate(value: string | undefined, rowNumber: number) {
    const raw = String(value || '').trim();
    if (!raw) {
      throw new BadRequestException(`Data ausente na linha ${rowNumber}.`);
    }
    const ofxDate = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
    if (ofxDate) {
      return new Date(
        Date.UTC(
          Number(ofxDate[1]),
          Number(ofxDate[2]) - 1,
          Number(ofxDate[3]),
        ),
      );
    }
    const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (brDate) {
      return new Date(
        Date.UTC(Number(brDate[3]), Number(brDate[2]) - 1, Number(brDate[1])),
      );
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Data invalida na linha ${rowNumber}.`);
    }
    return parsed;
  }

  private parseStatementAmount(value: string | undefined, rowNumber: number) {
    const raw = String(value || '')
      .trim()
      .replace(/\s/g, '')
      .replace(/^R\$/i, '');
    if (!raw) {
      throw new BadRequestException(`Valor ausente na linha ${rowNumber}.`);
    }

    const normalized =
      raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException(`Valor invalido na linha ${rowNumber}.`);
    }
    return amount;
  }

  private resolveStatementType(
    value: string | undefined,
    amount: number,
    rowNumber: number,
  ) {
    const normalized = this.normalizeHeader(value || '');
    if (
      ['credito', 'credit', 'entrada', 'c', 'cr', 'dep', 'deposit'].includes(
        normalized,
      )
    ) {
      return BankMovementType.CREDIT;
    }
    if (
      ['debito', 'debit', 'saida', 'd', 'db', 'pagamento', 'payment'].includes(
        normalized,
      )
    ) {
      return BankMovementType.DEBIT;
    }
    if (!normalized && amount !== 0) {
      return amount > 0 ? BankMovementType.CREDIT : BankMovementType.DEBIT;
    }
    throw new BadRequestException(`Tipo invalido na linha ${rowNumber}.`);
  }

  private assertNoDuplicatedExternalIds(
    entries: Array<{ externalId?: string }>,
  ) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry.externalId) continue;
      if (seen.has(entry.externalId)) {
        throw new BadRequestException(
          'CSV/OFX contem identificador bancario duplicado.',
        );
      }
      seen.add(entry.externalId);
    }
  }

  private sameBankDay(left: Date, right: Date) {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private dateWindow(date: Date, days: number) {
    const from = new Date(date);
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setUTCDate(to.getUTCDate() + days);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  private async findMovementCandidates(
    tx: Prisma.TransactionClient,
    entry: {
      bankAccountId: string;
      type: BankMovementType;
      amount: number;
      postedDate: Date;
    },
    dateWindowDays: number,
  ) {
    const { from, to } = this.dateWindow(entry.postedDate, dateWindowDays);
    const candidates = await tx.bankMovement.findMany({
      where: {
        bankAccountId: entry.bankAccountId,
        type: entry.type,
        amount: { gte: entry.amount - 0.009, lte: entry.amount + 0.009 },
        movementDate: { gte: from, lte: to },
        reconciledAt: null,
        status: BankMovementStatus.POSTED,
        statementEntries: {
          none: {
            matchStatus: {
              in: [
                BankStatementEntryMatchStatus.AUTO_MATCHED,
                BankStatementEntryMatchStatus.MANUAL_MATCHED,
              ],
            },
          },
        },
      },
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (dateWindowDays === 0) {
      return candidates.filter((candidate) =>
        this.sameBankDay(candidate.movementDate, entry.postedDate),
      );
    }
    return candidates;
  }

  private async assertCanMatchEntryWithMovement(
    tx: Prisma.TransactionClient,
    entry: {
      id: string;
      bankAccountId: string;
      type: BankMovementType;
      amount: number;
    },
    movement: {
      id: string;
      bankAccountId: string;
      type: BankMovementType;
      amount: number;
      reconciledAt: Date | null;
    },
  ) {
    if (entry.bankAccountId !== movement.bankAccountId) {
      throw new BadRequestException(
        'Lancamento e movimento pertencem a contas diferentes.',
      );
    }
    if (entry.type !== movement.type) {
      throw new BadRequestException(
        'Tipo do lancamento bancario nao bate com o movimento interno.',
      );
    }
    if (
      Math.abs(Number(entry.amount || 0) - Number(movement.amount || 0)) > 0.009
    ) {
      throw new BadRequestException(
        'Valor do lancamento bancario diverge do movimento interno.',
      );
    }
    if (movement.reconciledAt) {
      throw new BadRequestException('Movimento financeiro ja esta conciliado.');
    }

    const alreadyMatched = await tx.bankStatementEntry.findFirst({
      where: {
        matchedMovementId: movement.id,
        id: { not: entry.id },
        matchStatus: {
          in: [
            BankStatementEntryMatchStatus.AUTO_MATCHED,
            BankStatementEntryMatchStatus.MANUAL_MATCHED,
          ],
        },
      },
      select: { id: true },
    });
    if (alreadyMatched) {
      throw new BadRequestException(
        'Movimento financeiro ja foi vinculado a outro lancamento bancario.',
      );
    }
  }

  private async applyStatementMatch(
    tx: Prisma.TransactionClient,
    input: {
      entryId: string;
      movementId: string;
      status: BankStatementEntryMatchStatus;
      confidenceScore: number;
      actorUserId?: string;
      reference?: string | null;
      note?: string | null;
    },
  ) {
    await tx.bankStatementEntry.update({
      where: { id: input.entryId },
      data: {
        matchedMovementId: input.movementId,
        matchStatus: input.status,
        confidenceScore: input.confidenceScore,
      },
    });

    await tx.bankMovement.update({
      where: { id: input.movementId },
      data: {
        reconciledAt: new Date(),
        reconciledById: input.actorUserId,
        reconciliationReference: input.reference,
        reconciliationNote: input.note,
      },
    });
  }

  private async updateBankStatementStatus(
    tx: Prisma.TransactionClient,
    importId: string,
  ) {
    const entries = await tx.bankStatementEntry.findMany({
      where: { importId },
      select: { matchStatus: true },
    });
    const unmatched = entries.filter(
      (entry) => entry.matchStatus === BankStatementEntryMatchStatus.UNMATCHED,
    ).length;
    const matchedStatuses: BankStatementEntryMatchStatus[] = [
      BankStatementEntryMatchStatus.AUTO_MATCHED,
      BankStatementEntryMatchStatus.MANUAL_MATCHED,
    ];
    const matched = entries.filter((entry) =>
      matchedStatuses.includes(entry.matchStatus),
    ).length;
    const ignored = entries.filter(
      (entry) => entry.matchStatus === BankStatementEntryMatchStatus.IGNORED,
    ).length;
    const status =
      unmatched === 0 && ignored === 0
        ? BankStatementImportStatus.RECONCILED
        : matched > 0 || ignored > 0
          ? BankStatementImportStatus.PARTIALLY_RECONCILED
          : BankStatementImportStatus.IMPORTED;

    await tx.bankStatementImport.update({
      where: { id: importId },
      data: { status },
    });
  }

  private async createReconciliationIssueSafely(
    tx: Prisma.TransactionClient,
    input: {
      bankAccountId: string;
      statementImportId?: string | null;
      statementEntryId?: string | null;
      movementId?: string | null;
      type: BankReconciliationIssueType;
      status?: BankReconciliationIssueStatus;
      reason?: string | null;
      resolvedAt?: Date | null;
      resolvedById?: string | null;
    },
  ) {
    return tx.bankReconciliationIssue.create({
      data: {
        bankAccountId: input.bankAccountId,
        statementImportId: input.statementImportId,
        statementEntryId: input.statementEntryId,
        movementId: input.movementId,
        type: input.type,
        status: input.status ?? BankReconciliationIssueStatus.OPEN,
        reason: input.reason,
        resolvedAt: input.resolvedAt,
        resolvedById: input.resolvedById,
      },
    });
  }

  private movementDelta(movement: { type: BankMovementType; amount: number }) {
    return movement.type === BankMovementType.CREDIT
      ? Number(movement.amount || 0)
      : -Number(movement.amount || 0);
  }

  private sumMovementDelta(
    movements: Array<{ type: BankMovementType; amount: number }>,
  ) {
    return movements.reduce(
      (sum, movement) => sum + this.movementDelta(movement),
      0,
    );
  }

  private validatePeriodInput(year: number, month: number, reason?: string) {
    if (!Number.isInteger(year) || year < 2000 || year > 2999) {
      throw new BadRequestException('Ano do periodo financeiro invalido.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mes do periodo financeiro invalido.');
    }
    if (reason !== undefined && reason.trim().length < 4) {
      throw new BadRequestException(
        'Informe um motivo claro para a operacao do periodo.',
      );
    }
  }

  private getPeriodKey(date: Date) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    };
  }

  private async ensureFinancialPeriodOpen(
    tx: Prisma.TransactionClient,
    date: Date,
  ) {
    const period = this.getPeriodKey(date);
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
      payableId?: string | null;
      receivablePaymentId?: string | null;
      payablePaymentId?: string | null;
      reversalOfMovementId?: string | null;
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

    const duplicate = await tx.bankMovement.findUnique({
      where: {
        originType_originId: {
          originType: input.originType,
          originId: input.originId,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Movimento financeiro duplicado para a mesma origem.',
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
          payableId: input.payableId,
          receivablePaymentId: input.receivablePaymentId,
          payablePaymentId: input.payablePaymentId,
          reversalOfMovementId: input.reversalOfMovementId,
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
        {
          validFrom: null,
          validUntil: null,
        },
        {
          validFrom: null,
          validUntil: { gte: now },
        },
        {
          validFrom: { lte: now },
          validUntil: null,
        },
        {
          validFrom: { lte: now },
          validUntil: { gte: now },
        },
      ],
    };

    if (input.userId) {
      const sellerRule = await tx.commissionRule.findFirst({
        where: {
          ...activeWindow,
          sellerId: input.userId,
        },
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
      where: {
        ...activeWindow,
        sellerId: null,
        role: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Number(
      generalRule?.percentage ?? this.defaultContractCommissionPercent,
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
