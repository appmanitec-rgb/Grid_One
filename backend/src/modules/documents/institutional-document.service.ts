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
  consultant?: Record<string, unknown>;
  manager?: Record<string, unknown>;
  service?: Record<string, unknown>;
  terms?: Record<string, unknown>;
  commercial?: Record<string, unknown>;
  approval?: Record<string, unknown>;
  scopeItems?: Array<Record<string, unknown>>;
  deliverables?: Array<Record<string, unknown>>;
  exclusions?: Array<Record<string, unknown>>;
  services?: Array<Record<string, unknown>>;
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
      paymentMethod: this.safe(payload.document?.paymentDetails, '-'),
      deliveryTerms: payload.document?.deliveryLeadTimeDays
        ? `${payload.document.deliveryLeadTimeDays} dia(s)`
        : '-',
      deliveryTerm: payload.document?.deliveryLeadTimeDays
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
      summary: this.safe(
        payload.document?.scope,
        'Proposta comercial para fornecimento e/ou servicos MANITEC.',
      ),
      laborTotal: this.formatCurrency(payload.document?.totalValue),
      expensesTotal: this.formatCurrency(0),
      materialsTotal: this.formatCurrency(0),
      discountTotal: this.formatCurrency(0),
      taxes: 'Inclusos conforme regime fiscal aplicavel.',
      validationCode: this.safe(payload.document?.id, '-'),
      validationUrl: '-',
    };
    const equipment = this.equipment(payload.generator);
    const items = this.records(payload.items).map(
      (item: AnyRecord, index: number) => ({
        code: this.safe(item.catalogItem?.sku, `ITEM-${index + 1}`),
        description: this.safe(item.catalogItem?.name, `Item ${index + 1}`),
        sku: this.safe(item.catalogItem?.sku, '-'),
        quantity: this.formatQuantity(item.quantity),
        unit: this.safe(item.catalogItem?.unit, 'un'),
        unitPrice: this.formatCurrency(item.unitPrice),
        total: this.formatCurrency(item.totalPrice),
      }),
    );
    const seller = payload.seller || payload.user || {};
    const scopeItems = this.textItems(
      proposal.scope,
      'Escopo tecnico informado.',
    );
    const exclusions = this.textItems(
      proposal.exclusions,
      'Sem exclusoes adicionais.',
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
      consultant: {
        name: this.safe(seller.name, 'Consultor MANITEC'),
        email: this.safe(seller.email || company.email, '-'),
        phone: this.safe(seller.phone || company.phone, '-'),
        role: 'Consultor comercial',
      },
      manager: {
        name: this.safe(
          seller.manager?.name || payload.company?.contactName,
          'Gestao MANITEC',
        ),
        email: this.safe(seller.manager?.email || company.email, '-'),
        role: this.safe(
          seller.manager?.department || payload.company?.contactRole,
          'Gestor responsavel',
        ),
      },
      service: {
        description: proposal.scope,
        notes: proposal.notes,
      },
      terms: {
        standards:
          'Execucao conforme normas tecnicas aplicaveis, procedimentos internos MANITEC e requisitos do cliente.',
        delivery: proposal.deliveryTerms,
        warranty: proposal.warranty,
        contractorObligations:
          'A MANITEC executara os servicos descritos no escopo aprovado e registrara evidencias quando aplicavel.',
        clientObligations:
          'O cliente devera garantir acesso, condicoes de seguranca e informacoes necessarias para execucao.',
        default:
          'Condicoes comerciais validas conforme prazo da proposta e sujeitas a aprovacao cadastral quando aplicavel.',
        cancellation:
          'Cancelamentos ou alteracoes devem ser formalizados antes da execucao dos servicos.',
        additional: proposal.notes,
      },
      commercial: {
        notes: proposal.notes,
      },
      approval: {
        clientSignerName: this.safe(payload.client?.contactName, '-'),
        clientSignerRole: 'Responsavel pelo aceite',
        date: proposal.date,
      },
      scopeItems,
      deliverables: [
        { description: 'Documento institucional da proposta.' },
        { description: 'Registro dos itens e condicoes comerciais aprovadas.' },
      ],
      exclusions,
      services: items,
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
      stateRegistration: this.safe(company?.stateRegistration, '-'),
      municipalRegistration: this.safe(company?.municipalRegistration, '-'),
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
      city: this.safe(company?.city, '-'),
      state: this.safe(company?.state, '-'),
      billingPartsName: this.safe(
        company?.tradeName || company?.companyName,
        'MANITEC',
      ),
      billingPartsDocument: this.safe(company?.cnpj, '-'),
      billingServicesName: this.safe(
        company?.tradeName || company?.companyName,
        'MANITEC',
      ),
      billingServicesDocument: this.safe(company?.cnpj, '-'),
    };
  }

  private client(client?: AnyRecord | null) {
    return {
      name: this.safe(client?.tradeName || client?.companyName, '-'),
      document: this.safe(client?.cnpj, '-'),
      stateRegistration: this.safe(client?.stateRegistration, '-'),
      municipalRegistration: this.safe(client?.municipalRegistration, '-'),
      contactName: this.safe(client?.contactName, '-'),
      phone: this.safe(client?.phone, '-'),
      email: this.safe(client?.email, '-'),
      address: this.join([client?.address, client?.city, client?.state]),
      city: this.safe(client?.city, '-'),
      state: this.safe(client?.state, '-'),
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
      serial: this.safe(generator?.serialNumber, '-'),
      type: this.safe(
        generator?.model?.category || generator?.application,
        '-',
      ),
      manufacturer: this.safe(generator?.brand || generator?.model?.brand, '-'),
      engineManufacturer: this.safe(generator?.engineBrand, '-'),
      engineModel: this.safe(generator?.engineModelName, '-'),
      alternatorManufacturer: this.safe(generator?.alternatorBrand, '-'),
      alternatorModel: this.safe(generator?.alternatorModelName, '-'),
      power: generator?.power ? `${generator.power} kVA` : '-',
      hourMeter:
        generator?.hourMeter === null || generator?.hourMeter === undefined
          ? '-'
          : `${generator.hourMeter} h`,
      voltage: this.safe(
        generator?.voltage || generator?.alternatorVoltage,
        '-',
      ),
      site: this.join([
        generator?.currentSite?.code,
        generator?.currentSite?.name,
      ]),
      generator: {
        model: this.safe(
          generator?.model?.name ||
            generator?.engineModelName ||
            generator?.brand,
          '-',
        ),
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

  private textItems(value: unknown, fallback: string) {
    const text = this.safe(value, fallback);
    return text
      .split(/\r?\n|;/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((description) => ({ description }));
  }
}
