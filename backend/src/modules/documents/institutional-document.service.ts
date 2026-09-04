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
  parts?: Array<Record<string, unknown>>;
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
      deliveryLeadTimeDays: this.safe(
        payload.document?.deliveryLeadTimeDays,
        '-',
      ),
      executionLeadTimeDays: this.safe(
        payload.document?.deliveryLeadTimeDays,
        '-',
      ),
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
        kind: this.safe(item.kind, 'OTHER'),
        code: this.safe(item.catalogItem?.sku, `ITEM-${index + 1}`),
        description: this.safe(
          item.description || item.catalogItem?.name,
          `Item ${index + 1}`,
        ),
        sku: this.safe(item.catalogItem?.sku, '-'),
        quantity: this.formatQuantity(item.hours ?? item.quantity),
        unit:
          item.hours != null ? 'h' : this.safe(item.catalogItem?.unit, 'un'),
        unitPrice: this.formatCurrency(item.unitPrice),
        discountPercent: this.formatPercent(item.discountPercent),
        total: this.formatCurrency(item.totalPrice),
      }),
    );
    const parts = items.filter(
      (item) => !String(item.kind).toUpperCase().includes('SERVICE'),
    );
    const services = items.filter((item) =>
      String(item.kind).toUpperCase().includes('SERVICE'),
    );
    proposal.laborTotal = this.formatCurrency(
      this.records(payload.items)
        .filter((item) => String(item.kind).toUpperCase().includes('SERVICE'))
        .reduce((total, item) => total + Number(item.totalPrice || 0), 0),
    );
    proposal.materialsTotal = this.formatCurrency(
      this.records(payload.items)
        .filter((item) => !String(item.kind).toUpperCase().includes('SERVICE'))
        .reduce((total, item) => total + Number(item.totalPrice || 0), 0),
    );
    proposal.discountTotal = this.formatCurrency(
      this.records(payload.items).reduce(
        (total, item) =>
          total +
          Math.max(
            0,
            Number(item.unitPrice || 0) *
              Number(item.hours ?? item.quantity ?? 0) -
              Number(item.totalPrice || 0),
          ),
        Number(payload.document?.discount || 0),
      ),
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
      parts,
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
      services,
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
    const generation = payload.generationOptions || {};
    const createdBy = payload.createdByUser || {};
    const contract = {
      number: this.safe(payload.document?.code),
      title: this.safe(payload.document?.title, 'Contrato de manutencao'),
      status: this.safe(payload.document?.statusLabel),
      date: this.formatDate(payload.document?.issuedAt),
      startDate: this.formatDate(payload.document?.startDate),
      endDate: this.formatDate(payload.document?.endDate),
      recurringAmount: this.formatCurrency(payload.document?.recurringAmount),
      dueDay: this.safe(payload.document?.dueDay, '-'),
      billingPeriod: this.safe(generation.billingPeriod, 'mensalidade'),
      paymentMethod: this.safe(generation.paymentMethod, 'boleto bancário'),
      paymentDetails: this.safe(
        generation.paymentDetails,
        'Os dados de cobrança serão encaminhados ao contato financeiro cadastrado.',
      ),
      billingIssueRule: this.safe(
        generation.billingIssueRule,
        'até o quinto dia útil de cada competência',
      ),
      preventiveRecurrence: this.preventiveRecurrenceLabel(
        payload.document?.preventiveRecurrence,
      ),
      responseTime: payload.document?.responseTimeHours
        ? `${payload.document.responseTimeHours}h`
        : '-',
      partsCoverage: this.partsCoverageLabel(payload.document?.partsCoverage),
      notes: this.safe(payload.document?.notes, '-'),
      validityDescription: `${this.formatDate(
        payload.document?.startDate,
      )} a ${this.formatDate(payload.document?.endDate)}`,
      renewalNotes: this.safe(
        generation.renewalNotes,
        'mediante acordo escrito entre as partes, sem renovação automática',
      ),
      renewalNotice: payload.document?.alertDays
        ? `${payload.document.alertDays} dia(s) antes do termino`
        : '-',
      maintenanceWindow: this.safe(
        generation.maintenanceWindow,
        'dias úteis, em horário comercial, mediante agendamento',
      ),
      correctiveVisitAllowance: this.safe(
        payload.document?.correctiveVisitAllowance,
        '0',
      ),
      correctiveVisitAllowancePeriod: `${this.safe(
        payload.document?.correctiveVisitAllowance,
        '0',
      )} chamado(s) por mês, não cumulativo(s)`,
      preventiveVisitSummary: this.preventiveRecurrenceLabel(
        payload.document?.preventiveRecurrence,
      ),
      emergencyChannel: this.safe(
        generation.emergencyChannel,
        'central de atendimento MANITEC informada ao cliente',
      ),
      fuelManagement: payload.document?.includesFuelManagement
        ? 'incluída conforme rotinas operacionais cadastradas'
        : 'não incluída',
      adjustmentBaseMonth: payload.document?.adjustmentBaseMonth
        ? `mês ${payload.document.adjustmentBaseMonth}`
        : 'aniversário do contrato',
      extraCallPolicy: this.safe(
        generation.extraCallPolicy,
        'serão objeto de orçamento prévio, incluindo mão de obra, peças e deslocamento aplicáveis',
      ),
      cancellationRule: this.safe(
        generation.cancellationRule,
        'mediante comunicação escrita com antecedência mínima de 30 dias',
      ),
      contractorObligations: this.safe(
        generation.contractorObligations,
        [
          'a) disponibilizar profissionais capacitados e identificados;',
          'b) utilizar ferramental e instrumentos adequados;',
          'c) registrar os serviços executados em relatório ou ordem de serviço;',
          'd) comunicar riscos, falhas relevantes e necessidades de intervenção adicional;',
          'e) cumprir as normas técnicas e de segurança aplicáveis ao escopo contratado.',
        ].join('\n'),
      ),
      clientObligations: this.safe(
        generation.clientObligations,
        [
          'a) garantir acesso seguro aos equipamentos e às instalações;',
          'b) disponibilizar responsável para acompanhamento quando necessário;',
          'c) informar alterações, falhas e intervenções realizadas por terceiros;',
          'd) manter condições mínimas de segurança, iluminação e circulação no local;',
          'e) efetuar os pagamentos nos prazos contratados.',
        ].join('\n'),
      ),
      exclusions: this.safe(
        generation.exclusions,
        [
          'Não estão incluídos, salvo previsão expressa: peças e consumíveis;',
          'retífica de motores, rebobinamento de alternadores e reparos estruturais;',
          'obras civis, adequações elétricas externas e alterações de infraestrutura;',
          'danos causados por operação inadequada, sinistros ou intervenção de terceiros;',
          'serviços fora dos equipamentos e locais identificados neste contrato.',
        ].join('\n'),
      ),
      additionalClauses: this.safe(
        generation.additionalClauses,
        this.safe(payload.document?.notes, 'não há condições adicionais'),
      ),
      legalVenue: this.safe(
        generation.legalVenue,
        this.safe(payload.company?.city, 'Indaiatuba/SP'),
      ),
      signaturePlace: this.safe(
        generation.signaturePlace,
        this.safe(payload.company?.city, 'Indaiatuba/SP'),
      ),
      preventiveChecklist:
        generation.includePreventiveChecklist === false
          ? 'O roteiro técnico detalhado não integra esta emissão.'
          : this.preventiveChecklist(),
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
    const contractServices = this.records(payload.sourceProposal?.items).map(
      (item: AnyRecord, index: number) => ({
        description: this.safe(
          item.description || item.catalogItem?.name,
          `Item ${index + 1}`,
        ),
        quantity: this.formatQuantity(item.quantity),
        unit: this.safe(item.catalogItem?.unit, 'un'),
        total: this.formatCurrency(item.totalPrice),
      }),
    );
    if (!contractServices.length) {
      contractServices.push({
        description: contract.title,
        quantity: '1',
        unit: 'contrato',
        total: contract.recurringAmount,
      });
    }

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
      services: contractServices,
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
      consultant: {
        name: this.safe(createdBy.name, 'Responsável MANITEC'),
        email: this.safe(createdBy.email || company.email, '-'),
        phone: this.safe(company.phone, '-'),
        role: 'Responsável pelo contrato',
      },
      signatures: {
        company: company.name,
        companySigner: this.safe(
          generation.companySigner,
          this.safe(createdBy.name, 'Representante autorizado'),
        ),
        client: client.name,
        clientSigner: this.safe(
          generation.clientSigner,
          this.contact(payload.client).name,
        ),
      },
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
      street: this.safe(company?.address, '-'),
      addressNumber: this.safe(company?.addressNumber, '-'),
      district: this.safe(company?.district, '-'),
      zipCode: this.safe(company?.zipCode, '-'),
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
    const primaryAddress = this.primaryClientAddress(client);
    const primaryContact = this.primaryClientContact(client);

    return {
      id: this.safe(client?.id, '-'),
      name: this.safe(client?.tradeName || client?.companyName, '-'),
      companyName: this.safe(client?.companyName, '-'),
      tradeName: this.safe(client?.tradeName, '-'),
      document: this.safe(client?.cnpj, '-'),
      stateRegistration: this.safe(client?.stateRegistration, '-'),
      municipalRegistration: this.safe(client?.municipalRegistration, '-'),
      contactName: this.safe(primaryContact?.name || client?.contactName, '-'),
      phone: this.safe(primaryContact?.phone || client?.phone, '-'),
      email: this.safe(primaryContact?.email || client?.email, '-'),
      street: this.safe(primaryAddress?.street || client?.address, '-'),
      addressNumber: this.safe(primaryAddress?.number, '-'),
      district: this.safe(primaryAddress?.district, '-'),
      zipCode: this.safe(primaryAddress?.zipCode, '-'),
      address: this.join([
        primaryAddress?.street || client?.address,
        primaryAddress?.number,
        primaryAddress?.district,
        primaryAddress?.city || client?.city,
        primaryAddress?.state || client?.state,
        primaryAddress?.zipCode,
      ]),
      city: this.safe(primaryAddress?.city || client?.city, '-'),
      state: this.safe(primaryAddress?.state || client?.state, '-'),
    };
  }

  private contact(client?: AnyRecord | null) {
    const primaryContact = this.primaryClientContact(client);

    return {
      name: this.safe(primaryContact?.name || client?.contactName, '-'),
      email: this.safe(primaryContact?.email || client?.email, '-'),
      phone: this.safe(primaryContact?.phone || client?.phone, '-'),
      mobile: this.safe(primaryContact?.mobile, '-'),
      role: this.safe(primaryContact?.role, '-'),
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
      engineSerialNumber: this.safe(generator?.engineSerialNumber, '-'),
      alternatorManufacturer: this.safe(generator?.alternatorBrand, '-'),
      alternatorModel: this.safe(generator?.alternatorModelName, '-'),
      alternatorSerialNumber: this.safe(generator?.alternatorSerialNumber, '-'),
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

  private preventiveRecurrenceLabel(value: unknown) {
    const labels: Record<string, string> = {
      MONTHLY: 'mensal',
      BIMONTHLY: 'bimestral',
      QUARTERLY: 'trimestral',
      SEMIANNUAL: 'semestral',
      ANNUAL: 'anual',
    };
    const key = this.safe(value, '-');
    return labels[key] || key;
  }

  private partsCoverageLabel(value: unknown) {
    const labels: Record<string, string> = {
      INCLUDED: 'incluídas na mensalidade, nos limites expressamente descritos',
      BILLED_SEPARATELY: 'faturadas separadamente após orçamento e aprovação',
    };
    const key = this.safe(value, '-');
    return labels[key] || key;
  }

  private preventiveChecklist() {
    return [
      'MOTOR E COMBUSTÍVEL',
      'Verificar níveis, vazamentos, mangueiras, tubulações, filtros e condições do tanque de serviço.',
      'Verificar óleo lubrificante, respiro do cárter, juntas, bujões e indicação de troca conforme fabricante.',
      'ARREFECIMENTO',
      'Verificar nível e condição do fluido, radiador ou intercambiador, mangueiras, conexões, bomba d’água, ventilador e correias.',
      'GERADOR E SISTEMA ELÉTRICO',
      'Verificar conservação, limpeza, ventilação, temperatura, vibração, acoplamento e aperto de terminais de força e comando.',
      'PARTIDA, BATERIAS E COMANDO',
      'Verificar baterias, carregador, cabos, terminais, motor de partida, sensores, alarmes e funcionamento do painel de comando.',
      'TESTES E REGISTROS',
      'Realizar teste funcional compatível com as condições do local, registrar horímetro, anomalias, recomendações e evidências do atendimento.',
      'A execução de atividades que exijam desligamento, carga, insumos ou recursos especiais dependerá de autorização e condições seguras no local.',
    ].join('\n');
  }

  private metadata(templateKey: string, documentId?: unknown) {
    return {
      templateKey,
      generatedAt: new Date().toISOString(),
      source: 'server-side',
      documentId: this.safe(documentId, '-'),
      sourceId: this.safe(documentId, '-'),
      format: 'DOCX',
    };
  }

  private formatCurrency(value?: number | string | null) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value || 0));
  }

  private formatPercent(value?: number | string | null) {
    return `${new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 2,
    }).format(Number(value || 0))}%`;
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

  private primaryClientAddress(client?: AnyRecord | null) {
    const addresses = this.records(client?.addresses);
    return (
      addresses.find((address) => address.type === 'BILLING') ||
      addresses.find((address) => address.type === 'INSTALLATION') ||
      addresses[0] ||
      null
    );
  }

  private primaryClientContact(client?: AnyRecord | null) {
    const contacts = this.records(client?.contacts);
    return (
      contacts.find((contact) => contact.status === 'ACTIVE') ||
      contacts[0] ||
      null
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
