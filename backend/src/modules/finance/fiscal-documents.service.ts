import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsReceivableStatus,
  FiscalDocumentKind,
  FiscalDocumentStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { SaveFiscalDraftDto } from './fiscal-documents.controller';

type DraftItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  ncm: string | null;
  cfop: string | null;
  serviceCode: string | null;
};

const digits = (value?: string | null) => (value || '').replace(/\D/g, '');

@Injectable()
export class FiscalDocumentsService {
  constructor(private readonly prisma: DatabaseService) {}

  async overview() {
    const [company, receivables, documents] = await Promise.all([
      this.prisma.companySettings
        .findFirst({
          where: { isPrimary: true },
          orderBy: { createdAt: 'asc' },
        })
        .then(
          async (primary) =>
            primary ||
            this.prisma.companySettings.findFirst({
              where: { key: 'default' },
            }),
        ),
      this.prisma.accountsReceivable.findMany({
        where: { status: { not: AccountsReceivableStatus.CANCELED } },
        select: {
          id: true,
          description: true,
          grossAmount: true,
          dueDate: true,
          client: { select: { id: true, companyName: true, cnpj: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      this.prisma.fiscalDocument.findMany({
        select: {
          id: true,
          receivableId: true,
          kind: true,
          status: true,
          items: true,
          totalAmount: true,
          fiscalNotes: true,
          issuerSnapshot: true,
          recipientSnapshot: true,
          provider: true,
          number: true,
          series: true,
          accessKey: true,
          issuedAt: true,
          authorizedAt: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
          receivable: {
            select: {
              description: true,
              client: { select: { companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    return {
      issuer: company
        ? {
            companyName: company.companyName,
            cnpj: company.cnpj,
            stateRegistration: company.stateRegistration,
            municipalRegistration: company.municipalRegistration,
            taxRegime: company.taxRegime,
            city: company.city,
            state: company.state,
          }
        : null,
      receivables,
      documents: documents.map((document) => ({
        ...document,
        checklist: this.checklist(
          document.kind,
          document.issuerSnapshot,
          document.recipientSnapshot,
          document.items,
        ),
      })),
      issuanceConfigured: false,
    };
  }

  async createDraft(input: SaveFiscalDraftDto, actorUserId?: string) {
    const { items, totalAmount } = this.normalizeItems(input);
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findUnique({
        where: { id: input.receivableId },
        include: { client: { include: { addresses: true } } },
      });
      if (!receivable)
        throw new NotFoundException('Conta a receber não encontrada.');
      if (receivable.status === AccountsReceivableStatus.CANCELED)
        throw new BadRequestException(
          'Não é possível preparar nota para uma conta cancelada.',
        );
      const primary = await tx.companySettings.findFirst({
        where: { isPrimary: true },
        orderBy: { createdAt: 'asc' },
      });
      const company =
        primary ||
        (await tx.companySettings.findFirst({ where: { key: 'default' } }));
      const issuerSnapshot = this.issuerSnapshot(company);
      const recipientSnapshot = this.recipientSnapshot(receivable.client);
      const document = await tx.fiscalDocument.create({
        data: {
          receivableId: input.receivableId,
          kind: input.kind,
          issuerSnapshot,
          recipientSnapshot,
          items: items as unknown as Prisma.InputJsonValue,
          totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          fiscalNotes: input.fiscalNotes?.trim() || null,
        },
      });
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'FISCAL_DOCUMENT',
          entityId: document.id,
          action: 'CREATE_DRAFT',
          actorUserId,
          payload: {
            receivableId: document.receivableId,
            kind: document.kind,
            totalAmount,
          },
        },
      });
      return {
        ...document,
        checklist: this.checklist(
          input.kind,
          issuerSnapshot,
          recipientSnapshot,
          items,
        ),
      };
    });
  }

  async updateDraft(
    id: string,
    input: SaveFiscalDraftDto,
    actorUserId?: string,
  ) {
    const { items, totalAmount } = this.normalizeItems(input);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.fiscalDocument.findUnique({ where: { id } });
      if (!existing)
        throw new NotFoundException('Rascunho fiscal não encontrado.');
      if (existing.status !== FiscalDocumentStatus.DRAFT)
        throw new ConflictException('A nota já saiu do estado de rascunho.');
      if (
        existing.receivableId !== input.receivableId ||
        existing.kind !== input.kind
      )
        throw new BadRequestException(
          'A conta e o tipo da nota não podem ser alterados. Crie outro rascunho.',
        );
      const receivable = await tx.accountsReceivable.findUnique({
        where: { id: existing.receivableId },
        include: { client: { include: { addresses: true } } },
      });
      if (
        !receivable ||
        receivable.status === AccountsReceivableStatus.CANCELED
      )
        throw new BadRequestException('A conta a receber não está disponível.');
      const primary = await tx.companySettings.findFirst({
        where: { isPrimary: true },
        orderBy: { createdAt: 'asc' },
      });
      const company =
        primary ||
        (await tx.companySettings.findFirst({ where: { key: 'default' } }));
      const issuerSnapshot = this.issuerSnapshot(company);
      const recipientSnapshot = this.recipientSnapshot(receivable.client);
      const document = await tx.fiscalDocument.update({
        where: { id },
        data: {
          issuerSnapshot,
          recipientSnapshot,
          items: items as unknown as Prisma.InputJsonValue,
          totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          fiscalNotes: input.fiscalNotes?.trim() || null,
        },
      });
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: 'FISCAL_DOCUMENT',
          entityId: id,
          action: 'UPDATE_DRAFT',
          actorUserId,
          payload: {
            receivableId: document.receivableId,
            kind: document.kind,
            totalAmount,
          },
        },
      });
      return {
        ...document,
        checklist: this.checklist(
          input.kind,
          issuerSnapshot,
          recipientSnapshot,
          items,
        ),
      };
    });
  }

  private normalizeItems(input: SaveFiscalDraftDto) {
    if (
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > 50
    )
      throw new BadRequestException('Informe entre 1 e 50 itens.');
    let totalCents = 0;
    const items: DraftItem[] = input.items.map((item) => {
      const description = item.description?.trim();
      const quantity = Number(item.quantity);
      const unitAmount = Number(item.unitAmount);
      if (
        !description ||
        description.length > 500 ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > 1000000 ||
        !Number.isFinite(unitAmount) ||
        unitAmount <= 0 ||
        unitAmount > 100000000
      )
        throw new BadRequestException(
          'Confira descrição, quantidade e valor dos itens fiscais.',
        );
      const cents = Math.round(quantity * unitAmount * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0)
        throw new BadRequestException('Valor de item fiscal inválido.');
      totalCents += cents;
      return {
        description,
        quantity,
        unitAmount,
        totalAmount: cents / 100,
        ncm: digits(item.ncm) || null,
        cfop: digits(item.cfop) || null,
        serviceCode: item.serviceCode?.trim() || null,
      };
    });
    if (!Number.isSafeInteger(totalCents) || totalCents > 999999999999999)
      throw new BadRequestException('Total do rascunho fiscal inválido.');
    return { items, totalAmount: totalCents / 100 };
  }

  private issuerSnapshot(
    company: {
      companyName: string | null;
      cnpj: string | null;
      stateRegistration: string | null;
      municipalRegistration: string | null;
      taxRegime: string | null;
      address: string | null;
      addressNumber: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
    } | null,
  ) {
    return {
      name: company?.companyName || null,
      cnpj: digits(company?.cnpj),
      stateRegistration: company?.stateRegistration || null,
      municipalRegistration: company?.municipalRegistration || null,
      taxRegime: company?.taxRegime || null,
      address: company?.address || null,
      addressNumber: company?.addressNumber || null,
      district: company?.district || null,
      city: company?.city || null,
      state: company?.state || null,
      zipCode: digits(company?.zipCode),
    };
  }

  private recipientSnapshot(client: {
    companyName: string;
    cnpj: string | null;
    stateRegistration: string | null;
    municipalRegistration: string | null;
    address: string | null;
    city: string;
    state: string;
    addresses: {
      street: string;
      number: string | null;
      district: string | null;
      zipCode: string | null;
      city: string;
      state: string;
    }[];
  }) {
    const address = client.addresses[0];
    return {
      name: client.companyName,
      document: digits(client.cnpj),
      stateRegistration: client.stateRegistration || null,
      municipalRegistration: client.municipalRegistration || null,
      address: address?.street || client.address || null,
      addressNumber: address?.number || null,
      district: address?.district || null,
      city: address?.city || client.city,
      state: address?.state || client.state,
      zipCode: digits(address?.zipCode),
    };
  }

  private checklist(
    kind: FiscalDocumentKind,
    issuerValue: Prisma.JsonValue,
    recipientValue: Prisma.JsonValue,
    itemsValue: Prisma.JsonValue,
  ) {
    const issuer = issuerValue as Record<string, unknown>;
    const recipient = recipientValue as Record<string, unknown>;
    const items = itemsValue as unknown as DraftItem[];
    const missing: string[] = [];
    if (
      digits(typeof issuer.cnpj === 'string' ? issuer.cnpj : '').length !== 14
    )
      missing.push('CNPJ válido da empresa');
    if (!issuer.name || !issuer.city || !issuer.state)
      missing.push('nome e endereço da empresa');
    if (!issuer.taxRegime) missing.push('regime tributário da empresa');
    if (kind === FiscalDocumentKind.NFE && !issuer.stateRegistration)
      missing.push('inscrição estadual da empresa');
    if (kind === FiscalDocumentKind.NFSE && !issuer.municipalRegistration)
      missing.push('inscrição municipal da empresa');
    if (
      ![11, 14].includes(
        digits(typeof recipient.document === 'string' ? recipient.document : '')
          .length,
      )
    )
      missing.push('CPF/CNPJ do cliente');
    if (!recipient.name || !recipient.city || !recipient.state)
      missing.push('nome e endereço do cliente');
    if (
      kind === FiscalDocumentKind.NFE &&
      items.some((item) => item.ncm?.length !== 8 || item.cfop?.length !== 4)
    )
      missing.push('NCM e CFOP dos produtos');
    if (
      kind === FiscalDocumentKind.NFSE &&
      items.some((item) => !item.serviceCode)
    )
      missing.push('código fiscal dos serviços');
    missing.push('enquadramento tributário validado pela contabilidade');
    missing.push('integração fiscal e credenciais de homologação');
    return missing;
  }
}
