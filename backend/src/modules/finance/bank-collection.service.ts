import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { FinanceService } from './finance.service';
import {
  buildSantanderCollectionRemittance,
  makeSantanderOurNumber,
  parseSantanderCollectionReturn,
  SantanderRemittanceTitle,
} from './santander-cnab240';

const digits = (value: string) => value.replace(/\D/g, '');

@Injectable()
export class BankCollectionService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly finance: FinanceService,
  ) {}

  async overview() {
    const [accounts, agreements, titles, batches, returns, events] =
      await Promise.all([
        this.prisma.bankAccount.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            bankName: true,
            agency: true,
            accountNumber: true,
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.bankCollectionAgreement.findMany({
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.bankCollectionTitle.findMany({
          include: {
            receivable: {
              include: {
                client: { select: { id: true, companyName: true, cnpj: true } },
                fiscalDocuments: {
                  select: { id: true, kind: true, status: true, number: true },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
            bankAccount: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        }),
        this.prisma.bankCollectionBatch.findMany({
          select: {
            id: true,
            agreementId: true,
            sequence: true,
            fileName: true,
            status: true,
            createdAt: true,
            sentAt: true,
            items: { select: { titleId: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.bankCollectionReturnImport.findMany({
          select: {
            id: true,
            agreementId: true,
            fileName: true,
            importedAt: true,
            events: { select: { id: true } },
          },
          orderBy: { importedAt: 'desc' },
          take: 50,
        }),
        this.prisma.bankCollectionReturnEvent.findMany({
          include: {
            title: {
              select: { id: true, documentNumber: true, ourNumber: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
    const unprepared = await this.prisma.accountsReceivable.findMany({
      where: {
        status: {
          in: [
            AccountsReceivableStatus.OPEN,
            AccountsReceivableStatus.OVERDUE,
            AccountsReceivableStatus.PARTIAL,
          ],
        },
        collectionTitle: null,
      },
      include: {
        client: { select: { id: true, companyName: true, cnpj: true } },
        fiscalDocuments: {
          select: { id: true, kind: true, status: true, number: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 300,
    });
    return {
      accounts,
      agreements,
      unprepared,
      titles,
      batches,
      returns,
      events,
    };
  }

  async saveAgreement(
    input: {
      bankAccountId: string;
      transmissionCode: string;
      beneficiaryName: string;
      beneficiaryDocument: string;
      agency: string;
      agencyDigit: string;
      accountNumber: string;
      accountDigit: string;
      walletCode?: string;
      documentType?: string;
      homologated?: boolean;
    },
    actorUserId?: string,
  ) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: input.bankAccountId },
    });
    if (!account?.isActive)
      throw new BadRequestException('Selecione uma conta bancária ativa.');
    if (account.bankName && !/santander|\b033\b/i.test(account.bankName))
      throw new BadRequestException(
        'Esta conta não está identificada como Santander.',
      );
    const beneficiaryDocument = digits(input.beneficiaryDocument || '');
    const transmissionCode = digits(input.transmissionCode || '');
    const agency = digits(input.agency || '');
    const agencyDigit = digits(input.agencyDigit || '');
    const accountNumber = digits(input.accountNumber || '');
    const accountDigit = digits(input.accountDigit || '');
    const beneficiaryName = input.beneficiaryName?.trim();
    if (
      !beneficiaryName ||
      beneficiaryName.length > 30 ||
      ![11, 14].includes(beneficiaryDocument.length) ||
      transmissionCode.length !== 15 ||
      agency.length !== 4 ||
      agencyDigit.length !== 1 ||
      accountNumber.length !== 9 ||
      accountDigit.length !== 1 ||
      !['1', '3', '5'].includes(input.walletCode || '1') ||
      !['1', '2'].includes(input.documentType || '2')
    )
      throw new BadRequestException(
        'Confira CNPJ/CPF, código de transmissão, agência, conta e carteira do convênio Santander.',
      );
    const data = {
      transmissionCode,
      beneficiaryName,
      beneficiaryDocument,
      agency,
      agencyDigit,
      accountNumber,
      accountDigit,
      walletCode: input.walletCode || '1',
      registrationForm: '1',
      documentType: input.documentType || '2',
      homologated: input.homologated === true,
    };
    const prior = await this.prisma.bankCollectionAgreement.findUnique({
      where: { bankAccountId: input.bankAccountId },
      include: { batches: { select: { id: true }, take: 1 } },
    });
    if (
      prior?.batches.length &&
      (prior.transmissionCode !== transmissionCode ||
        prior.beneficiaryDocument !== beneficiaryDocument ||
        prior.agency !== agency ||
        prior.agencyDigit !== agencyDigit ||
        prior.accountNumber !== accountNumber ||
        prior.accountDigit !== accountDigit)
    )
      throw new ConflictException(
        'Já existem remessas desta conta. Preserve os dados bancários do convênio para importar os retornos.',
      );
    const saved = await this.prisma.bankCollectionAgreement.upsert({
      where: { bankAccountId: input.bankAccountId },
      create: { bankAccountId: input.bankAccountId, ...data },
      update: data,
    });
    await this.audit('AGREEMENT', saved.id, 'SAVE', actorUserId, {
      bankAccountId: input.bankAccountId,
      homologated: saved.homologated,
    });
    return saved;
  }

  async prepareTitle(
    input: {
      receivableId: string;
      bankAccountId: string;
      documentNumber?: string;
      speciesCode?: string;
    },
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findUnique({
        where: { id: input.receivableId },
        include: { client: { include: { addresses: true } } },
      });
      if (!receivable)
        throw new NotFoundException('Conta a receber não encontrada.');
      if (
        receivable.status !== AccountsReceivableStatus.OPEN &&
        receivable.status !== AccountsReceivableStatus.OVERDUE &&
        receivable.status !== AccountsReceivableStatus.PARTIAL
      )
        throw new BadRequestException(
          'Apenas títulos em aberto podem gerar cobrança.',
        );
      const agreement = await tx.bankCollectionAgreement.findUnique({
        where: { bankAccountId: input.bankAccountId },
      });
      if (!agreement)
        throw new BadRequestException(
          'Configure o convênio Santander desta conta antes de preparar o boleto.',
        );
      const existing = await tx.bankCollectionTitle.findUnique({
        where: { receivableId: input.receivableId },
      });
      if (existing)
        throw new ConflictException(
          'Este título já possui uma cobrança bancária.',
        );
      this.requirePayer(receivable.client);
      const documentNumber = (
        input.documentNumber?.trim() ||
        `R${receivable.id.replace(/-/g, '').slice(0, 14)}`
      ).toUpperCase();
      if (
        !/^[A-Z0-9-]{1,15}$/.test(documentNumber) ||
        !['02', '04'].includes(input.speciesCode || '04')
      )
        throw new BadRequestException(
          'Número do documento ou espécie do boleto inválido.',
        );
      const claim = await tx.bankCollectionAgreement.updateMany({
        where: { id: agreement.id, nextOurNumber: agreement.nextOurNumber },
        data: { nextOurNumber: { increment: 1 } },
      });
      if (!claim.count)
        throw new ConflictException('A numeração mudou. Tente novamente.');
      const title = await tx.bankCollectionTitle.create({
        data: {
          receivableId: input.receivableId,
          bankAccountId: input.bankAccountId,
          documentNumber,
          ourNumber: makeSantanderOurNumber(agreement.nextOurNumber),
          speciesCode: input.speciesCode || '04',
        },
      });
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'BANK_COLLECTION_TITLE',
          entityId: title.id,
          action: 'PREPARE',
          actorUserId,
          payload: {
            receivableId: title.receivableId,
            bankAccountId: title.bankAccountId,
            ourNumber: title.ourNumber,
          },
        },
      });
      return title;
    });
  }

  async saveInvoice(
    titleId: string,
    input: {
      number?: string;
      issuedAt?: string;
      accessKey?: string;
      url?: string;
    },
    actorUserId?: string,
  ) {
    const title = await this.prisma.bankCollectionTitle.findUnique({
      where: { id: titleId },
    });
    if (!title) throw new NotFoundException('Boleto não encontrado.');
    const number = input.number?.trim() || null;
    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : null;
    if (
      number &&
      (number.length > 60 || !issuedAt || Number.isNaN(issuedAt.getTime()))
    )
      throw new BadRequestException(
        'Informe o número e a data de emissão da NF.',
      );
    if (
      input.url &&
      (!/^https:\/\//i.test(input.url) || input.url.length > 500)
    )
      throw new BadRequestException('Use um link HTTPS válido para a NF.');
    const saved = await this.prisma.bankCollectionTitle.update({
      where: { id: titleId },
      data: {
        invoiceNumber: number,
        invoiceIssuedAt: number ? issuedAt : null,
        invoiceAccessKey: number
          ? input.accessKey?.trim().slice(0, 80) || null
          : null,
        invoiceUrl: number ? input.url?.trim() || null : null,
      },
    });
    await this.audit(
      'BANK_COLLECTION_TITLE',
      titleId,
      'INVOICE_REFERENCE',
      actorUserId,
      { invoiceNumber: number },
    );
    return saved;
  }

  async generateBatch(
    input: { bankAccountId: string; titleIds: string[] },
    actorUserId?: string,
  ) {
    if (
      !Array.isArray(input.titleIds) ||
      !input.titleIds.length ||
      input.titleIds.length > 9999 ||
      new Set(input.titleIds).size !== input.titleIds.length
    )
      throw new BadRequestException(
        'Selecione entre 1 e 9999 boletos, sem repetição.',
      );
    const agreement = await this.prisma.bankCollectionAgreement.findUnique({
      where: { bankAccountId: input.bankAccountId },
    });
    if (!agreement)
      throw new BadRequestException('Convênio Santander não configurado.');
    const titles = await this.prisma.bankCollectionTitle.findMany({
      where: { id: { in: input.titleIds }, bankAccountId: input.bankAccountId },
      include: {
        receivable: { include: { client: { include: { addresses: true } } } },
      },
    });
    if (titles.length !== input.titleIds.length)
      throw new BadRequestException(
        'Há boletos de outra conta ou inexistentes.',
      );
    const byId = new Map(titles.map((item) => [item.id, item]));
    const ordered = input.titleIds.map((id) => byId.get(id)!);
    const today = this.todayInSaoPaulo();
    const rows: SantanderRemittanceTitle[] = ordered.map((title) => {
      const receivable = title.receivable;
      if (
        !['DRAFT', 'REJECTED'].includes(title.status) ||
        receivable.status === AccountsReceivableStatus.PAID ||
        receivable.status === AccountsReceivableStatus.CANCELED ||
        receivable.dueDate <= today
      )
        throw new BadRequestException(
          `Boleto ${title.documentNumber} não está pronto para remessa.`,
        );
      const address = this.requirePayer(receivable.client);
      const outstanding =
        Number(receivable.netAmount) +
        Number(receivable.interestAmount) +
        Number(receivable.penaltyAmount) -
        Number(receivable.paidAmount);
      if (outstanding <= 0)
        throw new BadRequestException(
          `Boleto ${title.documentNumber} sem saldo aberto.`,
        );
      return {
        id: title.id,
        documentNumber: title.documentNumber,
        ourNumber: title.ourNumber,
        amount: outstanding,
        dueDate: receivable.dueDate,
        speciesCode: title.speciesCode as '02' | '04',
        payerName: receivable.client.companyName,
        payerDocument: receivable.client.cnpj!,
        street: [address.street, address.number].filter(Boolean).join(', '),
        district: address.district!,
        zipCode: address.zipCode!,
        city: address.city,
        state: address.state,
      };
    });
    const content = buildSantanderCollectionRemittance({
      agreement,
      sequence: agreement.nextRemittanceNumber,
      generatedAt: today,
      titles: rows,
    });
    const fileName = `COB033_${String(agreement.nextRemittanceNumber).padStart(6, '0')}.REM`;
    const checksumSha256 = createHash('sha256').update(content).digest('hex');
    const batch = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.bankCollectionAgreement.updateMany({
        where: {
          id: agreement.id,
          nextRemittanceNumber: agreement.nextRemittanceNumber,
        },
        data: { nextRemittanceNumber: { increment: 1 } },
      });
      if (!claim.count)
        throw new ConflictException(
          'Outra remessa foi gerada. Atualize a página e tente novamente.',
        );
      const created = await tx.bankCollectionBatch.create({
        data: {
          agreementId: agreement.id,
          sequence: agreement.nextRemittanceNumber,
          fileName,
          content,
          checksumSha256,
          items: { create: ordered.map((title) => ({ titleId: title.id })) },
        },
      });
      const updated = await tx.bankCollectionTitle.updateMany({
        where: {
          id: { in: input.titleIds },
          status: { in: ['DRAFT', 'REJECTED'] },
        },
        data: { status: 'GENERATED' },
      });
      if (updated.count !== ordered.length)
        throw new ConflictException(
          'Um boleto mudou durante a geração. Nenhum lote foi gravado.',
        );
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'BANK_COLLECTION_BATCH',
          entityId: created.id,
          action: 'GENERATE',
          actorUserId,
          payload: {
            fileName,
            checksumSha256,
            titleIds: input.titleIds,
            homologated: agreement.homologated,
          },
        },
      });
      return created;
    });
    return {
      id: batch.id,
      fileName,
      sequence: batch.sequence,
      status: batch.status,
      homologated: agreement.homologated,
      titleCount: ordered.length,
    };
  }

  async downloadBatch(id: string) {
    const batch = await this.prisma.bankCollectionBatch.findUnique({
      where: { id },
      select: { content: true, fileName: true },
    });
    if (!batch) throw new NotFoundException('Remessa não encontrada.');
    return { content: Buffer.from(batch.content), fileName: batch.fileName };
  }

  async markBatchSent(id: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.bankCollectionBatch.findUnique({
        where: { id },
        include: { items: true, agreement: { select: { homologated: true } } },
      });
      if (!batch) throw new NotFoundException('Remessa não encontrada.');
      if (!batch.agreement.homologated)
        throw new BadRequestException(
          'Homologue o convênio Santander antes de marcar a remessa como enviada.',
        );
      if (batch.status !== 'GENERATED')
        throw new ConflictException(
          'Esta remessa já foi marcada como enviada.',
        );
      const changed = await tx.bankCollectionBatch.updateMany({
        where: { id, status: 'GENERATED' },
        data: { status: 'SENT', sentAt: new Date(), sentById: actorUserId },
      });
      if (!changed.count)
        throw new ConflictException(
          'Esta remessa já foi alterada. Atualize a página.',
        );
      const saved = await tx.bankCollectionBatch.findUniqueOrThrow({
        where: { id },
      });
      await tx.bankCollectionTitle.updateMany({
        where: {
          id: { in: batch.items.map((item) => item.titleId) },
          status: 'GENERATED',
        },
        data: { status: 'SENT' },
      });
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'BANK_COLLECTION_BATCH',
          entityId: id,
          action: 'MARK_SENT',
          actorUserId,
        },
      });
      return { id: saved.id, status: saved.status, sentAt: saved.sentAt };
    });
  }

  async importReturn(
    input: { bankAccountId: string; fileName: string; content: Buffer },
    actorUserId?: string,
  ) {
    const agreement = await this.prisma.bankCollectionAgreement.findUnique({
      where: { bankAccountId: input.bankAccountId },
    });
    if (!agreement)
      throw new BadRequestException(
        'Convênio Santander não configurado para esta conta.',
      );
    const parsed = parseSantanderCollectionReturn(
      input.content,
      agreement.beneficiaryDocument,
      agreement,
    );
    const checksumSha256 = createHash('sha256')
      .update(input.content)
      .digest('hex');
    const duplicate = await this.prisma.bankCollectionReturnImport.findUnique({
      where: {
        agreementId_checksumSha256: {
          agreementId: agreement.id,
          checksumSha256,
        },
      },
    });
    if (duplicate)
      throw new ConflictException('Este arquivo de retorno já foi importado.');
    const ourNumbers = [...new Set(parsed.map((event) => event.ourNumber))];
    const titles = await this.prisma.bankCollectionTitle.findMany({
      where: {
        bankAccountId: input.bankAccountId,
        ourNumber: { in: ourNumbers },
      },
    });
    const byOurNumber = new Map(
      titles.map((title) => [title.ourNumber, title]),
    );
    const imported = await this.prisma.$transaction(async (tx) => {
      const file = await tx.bankCollectionReturnImport.create({
        data: {
          agreementId: agreement.id,
          fileName: input.fileName.slice(0, 180),
          content: input.content,
          checksumSha256,
          importedById: actorUserId,
        },
      });
      for (const item of parsed) {
        const title = byOurNumber.get(item.ourNumber);
        const matched =
          title && title.documentNumber.trim() === item.documentNumber.trim();
        const repeatedSettlement =
          matched && item.movementCode === '06'
            ? await tx.bankCollectionReturnEvent.findFirst({
                where: {
                  titleId: title.id,
                  movementCode: '06',
                  amount: item.paidAmount,
                  eventDate: item.eventDate,
                },
              })
            : null;
        const divergentCredit =
          item.movementCode === '06' &&
          Math.abs(item.paidAmount - item.netCreditAmount) > 0.009;
        const outcome =
          !matched ||
          repeatedSettlement ||
          divergentCredit ||
          title.status === 'PAID'
            ? 'PENDING_REVIEW'
            : item.movementCode === '02' || item.movementCode === '03'
              ? 'APPLIED'
              : item.movementCode === '06'
                ? 'PENDING_SETTLEMENT'
                : 'PENDING_REVIEW';
        const message = divergentCredit
          ? `Valor pago ${item.paidAmount.toFixed(2)} difere do crédito ${item.netCreditAmount.toFixed(2)}. Confira tarifas e concilie manualmente.`
          : repeatedSettlement
            ? 'Liquidação já recebida em outro retorno. Confira antes de baixar novamente.'
            : matched && title.status === 'PAID'
              ? 'Título já liquidado. Confira esta nova ocorrência.'
              : !matched
                ? 'Nosso Número ou Seu Número não corresponde a um boleto desta conta.'
                : this.movementMessage(item.movementCode);
        await tx.bankCollectionReturnEvent.create({
          data: {
            importId: file.id,
            titleId: matched ? title.id : null,
            lineNumber: item.lineNumber,
            movementCode: item.movementCode,
            reasonCodes: item.reasonCodes,
            amount: item.paidAmount,
            netCreditAmount: item.netCreditAmount,
            eventDate: item.eventDate,
            outcome,
            message,
          },
        });
        if (matched && title.status !== 'PAID' && item.movementCode === '02')
          await tx.bankCollectionTitle.update({
            where: { id: title.id },
            data: {
              status: 'REGISTERED',
              registeredAt: item.eventDate || new Date(),
              lastOccurrenceCode: item.movementCode,
              lastOccurrenceAt: item.eventDate,
              lastMessage: message,
            },
          });
        if (matched && title.status !== 'PAID' && item.movementCode === '03')
          await tx.bankCollectionTitle.update({
            where: { id: title.id },
            data: {
              status: 'REJECTED',
              lastOccurrenceCode: item.movementCode,
              lastOccurrenceAt: item.eventDate,
              lastMessage: `${message} ${item.reasonCodes}`.trim(),
            },
          });
      }
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'BANK_COLLECTION_RETURN',
          entityId: file.id,
          action: 'IMPORT',
          actorUserId,
          payload: {
            fileName: file.fileName,
            checksumSha256,
            count: parsed.length,
          },
        },
      });
      return file;
    });
    const pending = await this.prisma.bankCollectionReturnEvent.findMany({
      where: { importId: imported.id, outcome: 'PENDING_SETTLEMENT' },
      select: { id: true },
    });
    for (const event of pending)
      await this.applySettlement(event.id, actorUserId);
    return this.prisma.bankCollectionReturnImport.findUnique({
      where: { id: imported.id },
      include: {
        events: {
          include: { title: { select: { id: true, documentNumber: true } } },
        },
      },
    });
  }

  async applySettlement(eventId: string, actorUserId?: string) {
    const event = await this.prisma.bankCollectionReturnEvent.findUnique({
      where: { id: eventId },
      include: { title: { include: { receivable: true } } },
    });
    if (!event || !event.title)
      throw new NotFoundException('Ocorrência sem boleto correspondente.');
    if (event.movementCode !== '06')
      throw new BadRequestException(
        'Esta ocorrência não confirma liquidação de boleto.',
      );
    if (Math.abs(event.amount - event.netCreditAmount) > 0.009)
      throw new BadRequestException(
        'Valor pago difere do crédito bancário; concilie a tarifa antes da baixa.',
      );
    if (event.outcome === 'APPLIED') return event;
    if (!['PENDING_SETTLEMENT', 'NEEDS_REVIEW'].includes(event.outcome))
      throw new ConflictException('Ocorrência em processamento.');
    const prior = await this.prisma.accountsReceivablePayment.findFirst({
      where: {
        receivableId: event.title.receivableId,
        notes: `Retorno Santander ${event.id}`,
      },
    });
    if (prior)
      return this.prisma.bankCollectionReturnEvent.update({
        where: { id: event.id },
        data: {
          outcome: 'APPLIED',
          message: 'Baixa financeira já registrada.',
        },
      });
    const lock = await this.prisma.bankCollectionReturnEvent.updateMany({
      where: { id: event.id, outcome: event.outcome },
      data: { outcome: 'PROCESSING' },
    });
    if (!lock.count)
      throw new ConflictException('Ocorrência em processamento.');
    try {
      const outstanding =
        Number(event.title.receivable.netAmount) +
        Number(event.title.receivable.interestAmount) +
        Number(event.title.receivable.penaltyAmount) -
        Number(event.title.receivable.paidAmount);
      if (event.amount <= 0 || event.amount - outstanding > 0.009)
        throw new BadRequestException(
          'Valor do retorno diverge do saldo. Confira juros, descontos e recebimentos anteriores.',
        );
      await this.finance.payReceivable(
        event.title.receivableId,
        {
          amount: event.amount,
          method: PaymentMethod.BOLETO,
          bankAccountId: event.title.bankAccountId,
          paidAt: event.eventDate?.toISOString(),
          notes: `Retorno Santander ${event.id}`,
        },
        actorUserId,
      );
      await this.prisma.bankCollectionReturnEvent.update({
        where: { id: event.id },
        data: {
          outcome: 'APPLIED',
          message: 'Liquidação registrada no contas a receber.',
        },
      });
      await this.prisma.bankCollectionTitle.update({
        where: { id: event.title.id },
        data: {
          status: 'PAID',
          paidAt: event.eventDate || new Date(),
          lastOccurrenceCode: '06',
          lastOccurrenceAt: event.eventDate,
          lastMessage: 'Liquidação registrada.',
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível baixar o título.';
      await this.prisma.bankCollectionReturnEvent.update({
        where: { id: event.id },
        data: { outcome: 'NEEDS_REVIEW', message },
      });
    }
    return this.prisma.bankCollectionReturnEvent.findUnique({
      where: { id: event.id },
    });
  }

  private requirePayer(client: {
    cnpj: string | null;
    addresses: Array<{
      type: string;
      street: string;
      number: string | null;
      district: string | null;
      zipCode: string | null;
      city: string;
      state: string;
    }>;
  }) {
    const address =
      client.addresses.find((item) => item.type === 'BILLING') ||
      client.addresses[0];
    if (
      ![11, 14].includes(digits(client.cnpj || '').length) ||
      !address ||
      !address.street?.trim() ||
      !address.district?.trim() ||
      digits(address.zipCode || '').length !== 8 ||
      !address.city?.trim() ||
      !/^[A-Z]{2}$/.test(address.state.toUpperCase())
    )
      throw new BadRequestException(
        'Complete CPF/CNPJ e endereço de cobrança do cliente, incluindo bairro, CEP, cidade e UF.',
      );
    return address;
  }

  private todayInSaoPaulo() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const read = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    return new Date(
      `${read('year')}-${read('month')}-${read('day')}T00:00:00.000Z`,
    );
  }

  private movementMessage(code: string) {
    return (
      (
        {
          '02': 'Entrada confirmada pelo banco.',
          '03': 'Entrada rejeitada pelo banco.',
          '06': 'Liquidação confirmada pelo banco.',
          '09': 'Baixa informada pelo banco; verifique se houve pagamento Pix.',
          '17': 'Liquidação após baixa; revisão necessária.',
        } as Record<string, string>
      )[code] || `Ocorrência ${code} recebida; revisão necessária.`
    );
  }

  private async audit(
    entityType: string,
    entityId: string,
    action: string,
    actorUserId?: string,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.financialAuditLog.create({
      data: {
        module: 'FINANCE',
        entityType,
        entityId,
        action,
        actorUserId,
        payload: payload as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
