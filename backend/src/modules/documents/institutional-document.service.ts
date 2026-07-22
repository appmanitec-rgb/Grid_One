/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { DocumentTemplateKind } from './document-template.service';

type AnyRecord = Record<string, any>;

export type InstitutionalDocumentContext = {
  company: Record<string, unknown>;
  client: Record<string, unknown>;
  contact: Record<string, unknown>;
  record: Record<string, unknown>;
  equipment: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  commercialTerms: Record<string, unknown>;
  technicalScope: Record<string, unknown>;
  signatures: Record<string, unknown>;
  metadata: Record<string, unknown>;
  proposal?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  workOrder?: Record<string, unknown>;
  serviceReport?: Record<string, unknown>;
};

@Injectable()
export class InstitutionalDocumentService {
  buildContext(
    kind: DocumentTemplateKind,
    payload: AnyRecord,
    templateKey: string,
  ): InstitutionalDocumentContext {
    if (kind === 'proposal')
      return this.buildProposalContext(payload, templateKey);
    if (kind === 'contract')
      return this.buildContractContext(payload, templateKey);
    if (kind === 'work-order')
      return this.buildWorkOrderContext(payload, templateKey);
    return this.buildServiceReportContext(payload, templateKey);
  }

  documentCode(
    kind: DocumentTemplateKind,
    context: InstitutionalDocumentContext,
  ) {
    if (kind === 'proposal')
      return this.safe(context.proposal?.number, 'proposta');
    if (kind === 'contract')
      return this.safe(context.contract?.number, 'contrato');
    if (kind === 'work-order')
      return this.safe(
        context.workOrder?.number || context.record.number,
        'os',
      );
    return this.safe(
      context.serviceReport?.number || context.record.number,
      'laudo-tecnico',
    );
  }

  private buildProposalContext(
    payload: AnyRecord,
    templateKey: string,
  ): InstitutionalDocumentContext {
    const company = this.company(payload.company);
    const client = this.client(payload.client);
    const proposal = {
      number: this.safe(payload.document?.code),
      date: this.formatDate(payload.document?.issuedAt),
      createdAt: this.formatDate(payload.document?.issuedAt),
      validUntil: this.formatDate(payload.document?.validUntil),
      status: this.safe(payload.document?.statusLabel),
      title: this.safe(
        payload.salesOpportunity?.title ||
          (payload.generator?.name
            ? `Atendimento ${payload.generator.name}`
            : 'Proposta comercial MANITEC'),
      ),
      total: this.formatCurrency(payload.document?.totalValue),
      paymentTerms: this.safe(payload.document?.paymentTerm, '-'),
      deliveryTerms: payload.document?.deliveryLeadTimeDays
        ? `${payload.document.deliveryLeadTimeDays} dia(s)`
        : '-',
      warranty: 'Garantia conforme condicoes comerciais e fabricante.',
      exclusions:
        'Obras civis, infraestrutura externa e itens nao descritos no escopo.',
      notes: this.safe(
        payload.document?.paymentDetails || payload.document?.externalNotes,
        'Sem observacoes adicionais.',
      ),
      freight: this.safe(payload.document?.freight, '-'),
      scope: this.safe(payload.document?.scope, 'Escopo nao informado.'),
    };
    const equipment = this.equipment(payload.generator);
    const items = this.records(payload.items).map(
      (item: AnyRecord, index: number) => ({
        description: this.safe(item.catalogItem?.name, `Item ${index + 1}`),
        sku: this.safe(item.catalogItem?.sku, '-'),
        quantity: this.formatQuantity(item.quantity, item.catalogItem?.unit),
        unitPrice: this.formatCurrency(item.unitPrice),
        total: this.formatCurrency(item.totalPrice),
      }),
    );

    return {
      company,
      client,
      contact: this.contact(payload.client),
      record: {
        type: 'proposal',
        number: proposal.number,
        title: proposal.title,
        status: proposal.status,
        date: proposal.date,
      },
      equipment,
      items,
      commercialTerms: {
        payment: proposal.paymentTerms,
        freight: proposal.freight,
        delivery: proposal.deliveryTerms,
        total: proposal.total,
      },
      technicalScope: {
        description: proposal.scope,
        warranty: proposal.warranty,
        exclusions: proposal.exclusions,
      },
      signatures: this.defaultSignatures(),
      metadata: this.metadata(templateKey, payload.document?.id),
      proposal,
    };
  }

  private buildContractContext(
    payload: AnyRecord,
    templateKey: string,
  ): InstitutionalDocumentContext {
    const company = this.company(payload.company);
    const client = this.client(payload.client);
    const contract = {
      number: this.safe(payload.document?.code),
      title: this.safe(payload.document?.title, 'Contrato de manutencao'),
      status: this.safe(payload.document?.statusLabel),
      date: this.formatDate(payload.document?.issuedAt),
      startDate: this.formatDate(payload.document?.startDate),
      endDate: this.formatDate(payload.document?.endDate),
      recurringAmount: this.formatCurrency(payload.document?.recurringAmount),
      dueDay: this.safe(payload.document?.dueDay, '-'),
      preventiveRecurrence: this.safe(
        payload.document?.preventiveRecurrence,
        '-',
      ),
      responseTime: payload.document?.responseTimeHours
        ? `${payload.document.responseTimeHours}h`
        : '-',
      partsCoverage: this.safe(payload.document?.partsCoverage, '-'),
      notes: this.safe(payload.document?.notes, '-'),
    };
    const equipments = this.records(payload.equipments).map(
      (item: AnyRecord) => ({
        description: this.safe(item.generator?.name, 'Equipamento'),
        serialNumber: this.safe(item.generator?.serialNumber, '-'),
        site: this.safe(item.generator?.currentSite?.name, '-'),
        coverage: item.coverageAmount
          ? this.formatCurrency(item.coverageAmount)
          : contract.recurringAmount,
      }),
    );

    return {
      company,
      client,
      contact: this.contact(payload.client),
      record: {
        type: 'contract',
        number: contract.number,
        title: contract.title,
        status: contract.status,
        date: contract.date,
      },
      equipment: equipments[0] || this.equipment(null),
      items: equipments,
      commercialTerms: {
        recurringAmount: contract.recurringAmount,
        dueDay: contract.dueDay,
        adjustmentIndex: this.safe(payload.document?.adjustmentIndex, '-'),
      },
      technicalScope: {
        preventiveRecurrence: contract.preventiveRecurrence,
        responseTime: contract.responseTime,
        partsCoverage: contract.partsCoverage,
        notes: contract.notes,
      },
      signatures: this.defaultSignatures(),
      metadata: this.metadata(templateKey, payload.document?.id),
      contract,
    };
  }

  private buildWorkOrderContext(
    payload: AnyRecord,
    templateKey: string,
  ): InstitutionalDocumentContext {
    const company = this.company(payload.company);
    const client = this.client(payload.client);
    const workOrder = {
      number: this.safe(payload.document?.id).slice(0, 8).toUpperCase(),
      title: this.safe(payload.document?.title, 'Ordem de servico'),
      status: this.safe(payload.document?.statusLabel),
      type: this.safe(payload.document?.type, '-'),
      priority: this.safe(payload.document?.priority, '-'),
      openedAt: this.formatDateTime(payload.document?.openedAt),
      scheduledTo: this.formatDateTime(payload.document?.scheduledTo),
      startedAt: this.formatDateTime(payload.document?.startedAt),
      finishedAt: this.formatDateTime(payload.document?.finishedAt),
      technician: this.safe(payload.technician?.user?.name, 'Nao alocado'),
      contract: this.safe(payload.contract?.code, 'O.S. avulsa'),
      report: this.safe(payload.document?.customerReport, '-'),
    };
    const materials = this.records(payload.materials).map(
      (item: AnyRecord) => ({
        description: this.safe(item.catalogItem?.name, 'Material'),
        sku: this.safe(item.catalogItem?.sku, '-'),
        quantity: this.formatQuantity(item.quantity, item.catalogItem?.unit),
        unitPrice:
          item.unitCost != null ? this.formatCurrency(item.unitCost) : '-',
        total:
          item.unitCost != null
            ? this.formatCurrency(
                Number(item.unitCost) * Number(item.quantity || 0),
              )
            : '-',
      }),
    );

    return {
      company,
      client,
      contact: this.contact(payload.client),
      record: {
        type: 'work-order',
        number: workOrder.number,
        title: workOrder.title,
        status: workOrder.status,
        date: workOrder.openedAt,
      },
      equipment: this.equipment(payload.generator),
      items: materials,
      commercialTerms: {},
      technicalScope: {
        description: this.safe(payload.document?.description, '-'),
        checklist: payload.checklist || [],
      },
      signatures: {
        customer: this.safe(payload.document?.customerSignatureUrl, '-'),
        technician: workOrder.technician,
      },
      metadata: this.metadata(templateKey, payload.document?.id),
      workOrder,
    };
  }

  private buildServiceReportContext(
    payload: AnyRecord,
    templateKey: string,
  ): InstitutionalDocumentContext {
    const company = this.company(payload.company);
    const client = this.client(payload.client);
    const serviceReport = {
      number: this.safe(payload.code || payload.document?.code),
      title: this.safe(
        payload.title || payload.document?.title,
        'Laudo tecnico',
      ),
      status: this.safe(payload.status || payload.document?.statusLabel),
      startedAt: this.formatDateTime(payload.startedAt),
      finishedAt: this.formatDateTime(payload.finishedAt),
      diagnosis: this.safe(payload.diagnosis, '-'),
      performedServices: this.safe(payload.performedServices, '-'),
      recommendations: this.safe(payload.recommendations, '-'),
      customerNotes: this.safe(payload.customerNotes, '-'),
    };

    return {
      company,
      client,
      contact: this.contact(payload.client),
      record: {
        type: 'service-report',
        number: serviceReport.number,
        title: serviceReport.title,
        status: serviceReport.status,
        date: serviceReport.finishedAt,
      },
      equipment: this.equipment(payload.generator),
      items: payload.evidences || [],
      commercialTerms: {},
      technicalScope: {
        diagnosis: serviceReport.diagnosis,
        performedServices: serviceReport.performedServices,
        recommendations: serviceReport.recommendations,
      },
      signatures: {
        customer: this.safe(payload.signedByName, '-'),
        technician: this.safe(payload.technician?.user?.name, '-'),
      },
      metadata: this.metadata(templateKey, payload.id || payload.document?.id),
      serviceReport,
    };
  }

  private company(company?: AnyRecord | null) {
    return {
      name: this.safe(company?.tradeName || company?.companyName, 'MANITEC'),
      document: this.safe(company?.cnpj, '-'),
      address: this.join([
        company?.address,
        company?.addressNumber,
        company?.district,
        company?.city,
        company?.state,
        company?.zipCode,
      ]),
      phone: this.safe(company?.phone, '-'),
      email: this.safe(company?.email || company?.billingEmail, '-'),
      website: this.safe(company?.website, '-'),
    };
  }

  private client(client?: AnyRecord | null) {
    return {
      name: this.safe(client?.tradeName || client?.companyName, '-'),
      document: this.safe(client?.cnpj, '-'),
      contactName: this.safe(client?.contactName, '-'),
      phone: this.safe(client?.phone, '-'),
      email: this.safe(client?.email, '-'),
      address: this.join([client?.address, client?.city, client?.state]),
    };
  }

  private contact(client?: AnyRecord | null) {
    return {
      name: this.safe(client?.contactName, '-'),
      email: this.safe(client?.email, '-'),
      phone: this.safe(client?.phone, '-'),
    };
  }

  private equipment(generator?: AnyRecord | null) {
    return {
      name: this.safe(generator?.name, 'Nao vinculado'),
      serialNumber: this.safe(generator?.serialNumber, '-'),
      site: this.join([
        generator?.currentSite?.code,
        generator?.currentSite?.name,
      ]),
      generator: {
        model: this.safe(generator?.brand, '-'),
        power: generator?.power ? `${generator.power} kVA` : '-',
      },
    };
  }

  private defaultSignatures() {
    return {
      company: 'MANITEC Operacao Integrada',
      client: 'Assinatura / aceite do cliente',
    };
  }

  private metadata(templateKey: string, documentId?: unknown) {
    return {
      templateKey,
      generatedAt: new Date().toISOString(),
      source: 'server-side',
      documentId: this.safe(documentId, '-'),
      format: 'DOCX',
    };
  }

  private formatCurrency(value?: number | string | null) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value || 0));
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private formatDateTime(value?: Date | string | null) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private formatQuantity(value?: number | string | null, unit?: string | null) {
    const formatted = new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
    return unit ? `${formatted} ${unit}` : formatted;
  }

  private join(values: Array<string | number | null | undefined>) {
    return (
      values
        .filter(
          (value) => value !== null && value !== undefined && value !== '',
        )
        .join(' - ') || '-'
    );
  }

  private safe(value: unknown, fallback = '') {
    if (value === null || value === undefined || value === '') return fallback;
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return fallback;
  }

  private records(value: unknown): AnyRecord[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is AnyRecord =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }
}
