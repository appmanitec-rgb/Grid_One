import { Injectable } from '@nestjs/common';
import { DocumentTemplateService } from './document-template.service';
import { PdfRenderService } from './pdf-render.service';
import { TemplateRendererService } from './template-renderer.service';

export type ProposalPdfInput = {
  company: {
    companyName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    addressNumber?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    website?: string | null;
  };
  document: {
    id?: string;
    code: string;
    statusLabel: string;
    type: string;
    totalValue: number;
    validUntil?: string | null;
    issuedAt: string;
    scope?: string | null;
    freight?: string | null;
    paymentTerm?: string | null;
    deliveryLeadTimeDays?: number | null;
    paymentDetails?: string | null;
    hasDownPayment?: boolean | null;
    downPaymentAmount?: number | null;
    installmentCount?: number | null;
    installmentIntervalDays?: number | null;
    firstDueDate?: string | null;
    externalNotes?: string | null;
  };
  client: {
    id?: string;
    companyName: string;
    tradeName?: string | null;
    cnpj?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  generator?: {
    name: string;
    brand?: string | null;
    serialNumber?: string | null;
    power?: number | null;
    currentSite?: { name?: string | null; code?: string | null } | null;
  } | null;
  seller?: { name?: string | null; email?: string | null } | null;
  salesOpportunity?: { title?: string | null; stage?: string | null } | null;
  items: Array<{
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    catalogItem?: {
      name?: string | null;
      sku?: string | null;
      unit?: string | null;
    } | null;
  }>;
};

export type GeneratedProposalPdf = {
  buffer: Buffer;
  html: string;
  templateKey: string;
  templateVersion: string;
  templateSchema: Record<string, unknown>;
  fileName: string;
};

@Injectable()
export class ProposalPdfService {
  constructor(
    private readonly templates: DocumentTemplateService,
    private readonly renderer: TemplateRendererService,
    private readonly pdfRender: PdfRenderService,
  ) {}

  generate(input: ProposalPdfInput): GeneratedProposalPdf {
    const template = this.templates.load('proposal');
    const context = this.buildContext(input, template.key);
    const bodyHtml = this.renderer.render(template.html, context);
    const html = this.wrapHtml(bodyHtml, template.css);
    const title = `Proposta Comercial ${input.document.code}`;
    const buffer = this.pdfRender.renderA4({
      title,
      html,
      templateKey: template.key,
      metadata: [
        ['Documento', input.document.code],
        ['Cliente', context.client.name],
        ['Emissao', context.proposal.createdAt],
        ['Validade', context.proposal.validUntil],
        ['Total', context.proposal.total],
      ],
    });

    return {
      buffer,
      html,
      templateKey: template.key,
      templateVersion: template.version,
      templateSchema: template.schema,
      fileName: `proposta-${this.safeFileSegment(input.document.code)}.pdf`,
    };
  }

  renderHtml(input: ProposalPdfInput) {
    const template = this.templates.load('proposal');
    const context = this.buildContext(input, template.key);
    return {
      html: this.wrapHtml(
        this.renderer.render(template.html, context),
        template.css,
      ),
      templateKey: template.key,
      templateVersion: template.version,
    };
  }

  private buildContext(input: ProposalPdfInput, templateKey: string) {
    return {
      template: {
        key: templateKey,
      },
      company: {
        name: input.company.tradeName || input.company.companyName || 'MANITEC',
        document: input.company.cnpj || '-',
        address: this.join([
          input.company.address,
          input.company.addressNumber,
          input.company.district,
          input.company.city,
          input.company.state,
          input.company.zipCode,
        ]),
        contact: this.join([
          input.company.email,
          input.company.phone,
          input.company.website,
        ]),
      },
      proposal: {
        number: input.document.code,
        title: this.proposalTitle(input),
        createdAt: this.formatDate(input.document.issuedAt),
        validUntil: this.formatDate(input.document.validUntil),
        total: this.formatCurrency(input.document.totalValue),
        paymentTerms: input.document.paymentTerm || '-',
        deliveryTerms: input.document.deliveryLeadTimeDays
          ? `${input.document.deliveryLeadTimeDays} dia(s)`
          : '-',
        warranty: 'Garantia conforme condicoes comerciais e fabricante.',
        exclusions:
          'Obras civis, infraestrutura externa e itens nao descritos no escopo.',
        notes:
          input.document.paymentDetails ||
          input.document.externalNotes ||
          'Sem observacoes adicionais.',
        freight: input.document.freight || '-',
        scope: input.document.scope || 'Escopo nao informado.',
      },
      client: {
        name: input.client.tradeName || input.client.companyName,
        document: input.client.cnpj || '-',
        contactName: input.client.contactName || '-',
        email: input.client.email || input.client.phone || '-',
        address: this.join([
          input.client.address,
          input.client.city,
          input.client.state,
        ]),
      },
      salesperson: {
        name: input.seller?.name || '-',
        email: input.seller?.email || '-',
      },
      equipment: {
        name: input.generator?.name || 'Nao vinculado',
        serialNumber: input.generator?.serialNumber || '-',
        site: this.join([
          input.generator?.currentSite?.code,
          input.generator?.currentSite?.name,
        ]),
      },
      items: input.items.map((item, index) => ({
        description: item.catalogItem?.name || `Item ${index + 1}`,
        quantity: this.formatQuantity(item.quantity, item.catalogItem?.unit),
        unitPrice: this.formatCurrency(item.unitPrice),
        total: this.formatCurrency(item.totalPrice),
      })),
    };
  }

  private proposalTitle(input: ProposalPdfInput) {
    if (input.salesOpportunity?.title) return input.salesOpportunity.title;
    if (input.generator?.name) return `Atendimento ${input.generator.name}`;
    return 'Proposta comercial MANITEC';
  }

  private wrapHtml(body: string, css: string) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
  }

  private formatCurrency(value?: number | null) {
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

  private formatQuantity(value: number, unit?: string | null) {
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

  private safeFileSegment(value: string) {
    return (value || 'proposta')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
