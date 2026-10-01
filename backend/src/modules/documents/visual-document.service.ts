import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VisualDocumentKind,
  VisualDocumentTemplateVersion,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { SimplePdfDocument } from '../service-reports/service-report-pdf.service';
import { DocumentTemplateService } from './document-template.service';
import { InstitutionalDocumentService } from './institutional-document.service';

export type VisualSegment =
  | { type: 'text'; text: string }
  | { type: 'field'; fieldId: string };
export type VisualBlock = {
  id: string;
  type: 'paragraph' | 'heading' | 'spacer';
  segments: VisualSegment[];
  fontSize: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  spaceAfter: number;
};
export type RenderedVisualBlock = Omit<VisualBlock, 'segments'> & {
  text: string;
  runs: Array<{ text: string; isField: boolean }>;
};

const ALL_KINDS = Object.values(VisualDocumentKind);
const PROPOSAL = [VisualDocumentKind.PROPOSAL];
const CONTRACT = [VisualDocumentKind.CONTRACT];
const REPORT = [VisualDocumentKind.SERVICE_REPORT];
const BUILTIN_FIELDS = [
  {
    key: 'client_name',
    label: 'Nome do Cliente',
    category: 'Cliente',
    kinds: ALL_KINDS,
    sourcePath: 'client.name',
  },
  {
    key: 'client_address',
    label: 'Endereço do Cliente',
    category: 'Cliente',
    kinds: ALL_KINDS,
    sourcePath: 'client.address',
  },
  {
    key: 'client_document',
    label: 'CNPJ ou CPF do Cliente',
    category: 'Cliente',
    kinds: ALL_KINDS,
    sourcePath: 'client.document',
  },
  {
    key: 'client_contact',
    label: 'Contato do Cliente',
    category: 'Cliente',
    kinds: ALL_KINDS,
    sourcePath: 'contact.name',
  },
  {
    key: 'company_name',
    label: 'Nome da MANITEC',
    category: 'Empresa',
    kinds: ALL_KINDS,
    sourcePath: 'company.name',
  },
  {
    key: 'today',
    label: 'Data Atual',
    category: 'Datas',
    kinds: ALL_KINDS,
    sourcePath: '__today__',
  },
  {
    key: 'equipment_name',
    label: 'Equipamento',
    category: 'Serviço',
    kinds: ALL_KINDS,
    sourcePath: 'equipment.name',
  },
  {
    key: 'equipment_serial',
    label: 'Número de Série',
    category: 'Serviço',
    kinds: ALL_KINDS,
    sourcePath: 'equipment.serialNumber',
  },
  {
    key: 'proposal_number',
    label: 'Número da Proposta',
    category: 'Proposta',
    kinds: PROPOSAL,
    sourcePath: 'proposal.number',
  },
  {
    key: 'proposal_date',
    label: 'Data da Proposta',
    category: 'Datas',
    kinds: PROPOSAL,
    sourcePath: 'proposal.date',
  },
  {
    key: 'proposal_validity',
    label: 'Validade da Proposta',
    category: 'Datas',
    kinds: PROPOSAL,
    sourcePath: 'proposal.validUntil',
  },
  {
    key: 'proposal_scope',
    label: 'Descrição do Serviço',
    category: 'Serviço',
    kinds: PROPOSAL,
    sourcePath: 'proposal.scope',
  },
  {
    key: 'proposal_items',
    label: 'Lista de Itens e Serviços',
    category: 'Serviço',
    kinds: PROPOSAL,
    sourcePath: '__proposal_items__',
  },
  {
    key: 'proposal_total',
    label: 'Valor Total',
    category: 'Financeiro',
    kinds: PROPOSAL,
    sourcePath: 'proposal.total',
  },
  {
    key: 'proposal_payment',
    label: 'Condições de Pagamento',
    category: 'Financeiro',
    kinds: PROPOSAL,
    sourcePath: 'proposal.paymentTerms',
  },
  {
    key: 'proposal_payment_data',
    label: 'Dados para Pagamento',
    category: 'Financeiro',
    kinds: PROPOSAL,
    sourcePath: 'proposal.paymentMethod',
  },
  {
    key: 'seller_name',
    label: 'Nome do Vendedor',
    category: 'Equipe',
    kinds: PROPOSAL,
    sourcePath: 'consultant.name',
  },
  {
    key: 'contract_number',
    label: 'Número do Contrato',
    category: 'Contrato',
    kinds: CONTRACT,
    sourcePath: 'contract.number',
  },
  {
    key: 'contract_title',
    label: 'Título do Contrato',
    category: 'Contrato',
    kinds: CONTRACT,
    sourcePath: 'contract.title',
  },
  {
    key: 'contract_start',
    label: 'Início do Contrato',
    category: 'Datas',
    kinds: CONTRACT,
    sourcePath: 'contract.startDate',
  },
  {
    key: 'contract_end',
    label: 'Fim do Contrato',
    category: 'Datas',
    kinds: CONTRACT,
    sourcePath: 'contract.endDate',
  },
  {
    key: 'contract_amount',
    label: 'Valor do Contrato',
    category: 'Financeiro',
    kinds: CONTRACT,
    sourcePath: 'contract.recurringAmount',
  },
  {
    key: 'contract_payment',
    label: 'Forma de Pagamento',
    category: 'Financeiro',
    kinds: CONTRACT,
    sourcePath: 'contract.paymentMethod',
  },
  {
    key: 'contract_services',
    label: 'Serviços Contratados',
    category: 'Serviço',
    kinds: CONTRACT,
    sourcePath: 'contract.notes',
  },
  {
    key: 'contract_equipments',
    label: 'Equipamentos do Contrato',
    category: 'Serviço',
    kinds: CONTRACT,
    sourcePath: '__contract_items__',
  },
  {
    key: 'report_number',
    label: 'Número do Relatório',
    category: 'Relatório',
    kinds: REPORT,
    sourcePath: 'serviceReport.number',
  },
  {
    key: 'report_title',
    label: 'Título do Relatório',
    category: 'Relatório',
    kinds: REPORT,
    sourcePath: 'serviceReport.title',
  },
  {
    key: 'report_diagnosis',
    label: 'Diagnóstico',
    category: 'Serviço',
    kinds: REPORT,
    sourcePath: 'serviceReport.diagnosis',
  },
  {
    key: 'report_work',
    label: 'Serviços Realizados',
    category: 'Serviço',
    kinds: REPORT,
    sourcePath: 'serviceReport.performedServices',
  },
  {
    key: 'report_checklist',
    label: 'Checklist do Atendimento',
    category: 'Serviço',
    kinds: REPORT,
    sourcePath: '__report_checklist__',
  },
  {
    key: 'report_evidence',
    label: 'Evidências do Relatório',
    category: 'Relatório',
    kinds: REPORT,
    sourcePath: '__report_evidence__',
  },
  {
    key: 'report_recommendations',
    label: 'Recomendações',
    category: 'Serviço',
    kinds: REPORT,
    sourcePath: 'serviceReport.recommendations',
  },
  {
    key: 'report_start',
    label: 'Início do Atendimento',
    category: 'Datas',
    kinds: REPORT,
    sourcePath: 'serviceReport.startedAt',
  },
  {
    key: 'report_end',
    label: 'Fim do Atendimento',
    category: 'Datas',
    kinds: REPORT,
    sourcePath: 'serviceReport.finishedAt',
  },
  {
    key: 'technician_name',
    label: 'Nome do Técnico',
    category: 'Equipe',
    kinds: REPORT,
    sourcePath: 'signatures.technician',
  },
] as const;

type VersionWithMapping = VisualDocumentTemplateVersion & {
  fieldsMapping: Array<{
    fieldId: string;
    sourcePath: string | null;
    fixedValue: string | null;
  }>;
};

@Injectable()
export class VisualDocumentService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly templates: DocumentTemplateService,
    private readonly institutional: InstitutionalDocumentService,
  ) {}

  async listFields(kind?: VisualDocumentKind) {
    await this.ensureBuiltins();
    return this.prisma.visualDocumentField.findMany({
      where: kind ? { kinds: { has: kind } } : undefined,
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        label: true,
        category: true,
        kinds: true,
        isSystem: true,
      },
    });
  }

  async createField(input: {
    label?: string;
    category?: string;
    kind?: VisualDocumentKind;
    sourceFieldId?: string;
    fixedValue?: string;
  }) {
    const label = input.label?.trim();
    if (
      !label ||
      label.length > 80 ||
      !input.kind ||
      !ALL_KINDS.includes(input.kind)
    ) {
      throw new BadRequestException('Informe o nome e o tipo do campo.');
    }
    const source = input.sourceFieldId
      ? await this.prisma.visualDocumentField.findUnique({
          where: { id: input.sourceFieldId },
        })
      : null;
    if (source && !source.kinds.includes(input.kind)) {
      throw new BadRequestException(
        'O dado escolhido não pertence a este documento.',
      );
    }
    const fixedValue = input.fixedValue?.trim();
    if ((!source && !fixedValue) || (source && fixedValue)) {
      throw new BadRequestException(
        'Escolha um dado existente ou informe um texto fixo.',
      );
    }
    if (fixedValue && (fixedValue.length > 500 || fixedValue.includes('{{'))) {
      throw new BadRequestException(
        'O texto fixo deve ter até 500 caracteres.',
      );
    }
    return this.prisma.visualDocumentField.create({
      data: {
        key: `custom_${randomUUID().replace(/-/g, '')}`,
        label,
        category: input.category?.trim().slice(0, 40) || 'Personalizados',
        kinds: [input.kind],
        sourcePath: source?.sourcePath,
        fixedValue: fixedValue || source?.fixedValue || null,
      },
      select: {
        id: true,
        label: true,
        category: true,
        kinds: true,
        isSystem: true,
      },
    });
  }

  async listTemplates(kind?: VisualDocumentKind) {
    return this.prisma.visualDocumentTemplate.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ kind: 'asc' }, { isActive: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        kind: true,
        name: true,
        description: true,
        isActive: true,
        currentVersion: true,
        publishedVersion: true,
        updatedAt: true,
      },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.visualDocumentTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            blocks: true,
            changeSummary: true,
            createdAt: true,
            createdByUserId: true,
          },
        },
      },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado.');
    return template;
  }

  async createTemplate(
    input: {
      kind?: VisualDocumentKind;
      name?: string;
      description?: string;
      blocks?: unknown;
    },
    actorId?: string,
  ) {
    const kind = this.requireKind(input.kind);
    const name = this.requireName(input.name);
    const { blocks, mappings } = await this.prepareBlocks(kind, input.blocks);
    const created = await this.prisma.visualDocumentTemplate.create({
      data: {
        kind,
        name,
        description: input.description?.trim().slice(0, 300) || null,
        createdByUserId: actorId,
        versions: {
          create: {
            versionNumber: 1,
            blocks: blocks as unknown as Prisma.InputJsonValue,
            createdByUserId: actorId,
            fieldsMapping: { create: mappings },
          },
        },
      },
    });
    return this.getTemplate(created.id);
  }

  async saveTemplate(
    id: string,
    input: {
      name?: string;
      description?: string;
      blocks?: unknown;
      expectedVersion?: number;
      changeSummary?: string;
    },
    actorId?: string,
  ) {
    const template = await this.prisma.visualDocumentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado.');
    if (input.expectedVersion !== template.currentVersion) {
      throw new ConflictException(
        'Este modelo mudou em outra sessão. Recarregue antes de salvar.',
      );
    }
    const { blocks, mappings } = await this.prepareBlocks(
      template.kind,
      input.blocks,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.visualDocumentTemplateVersion.create({
        data: {
          templateId: id,
          versionNumber: template.currentVersion + 1,
          blocks: blocks as unknown as Prisma.InputJsonValue,
          changeSummary: input.changeSummary?.trim().slice(0, 200) || null,
          createdByUserId: actorId,
          fieldsMapping: { create: mappings },
        },
      });
      await tx.visualDocumentTemplate.update({
        where: { id },
        data: {
          name: this.requireName(input.name),
          description: input.description?.trim().slice(0, 300) || null,
          currentVersion: { increment: 1 },
        },
      });
    });
    return this.getTemplate(id);
  }

  async duplicateTemplate(id: string, actorId?: string) {
    const source = await this.getTemplate(id);
    return this.createTemplate(
      {
        kind: source.kind,
        name: `${source.name} (cópia)`,
        description: source.description || undefined,
        blocks: source.versions[0].blocks,
      },
      actorId,
    );
  }

  async restoreVersion(id: string, versionNumber: number, actorId?: string) {
    const template = await this.getTemplate(id);
    const version = template.versions.find(
      (entry) => entry.versionNumber === versionNumber,
    );
    if (!version) throw new NotFoundException('Versão não encontrada.');
    return this.saveTemplate(
      id,
      {
        name: template.name,
        description: template.description || undefined,
        blocks: version.blocks,
        expectedVersion: template.currentVersion,
        changeSummary: `Restaurada da versão ${versionNumber}`,
      },
      actorId,
    );
  }

  async publishTemplate(id: string) {
    const template = await this.prisma.visualDocumentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.visualDocumentTemplate.updateMany({
        where: { kind: template.kind, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
      await tx.visualDocumentTemplate.update({
        where: { id },
        data: { isActive: true, publishedVersion: template.currentVersion },
      });
    });
    return this.getTemplate(id);
  }

  async deactivateTemplate(id: string) {
    const template = await this.prisma.visualDocumentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado.');
    await this.prisma.visualDocumentTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return this.getTemplate(id);
  }

  async sampleRecords(kind: VisualDocumentKind) {
    this.requireKind(kind);
    if (kind === VisualDocumentKind.PROPOSAL) {
      const rows = await this.prisma.proposal.findMany({
        take: 12,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          code: true,
          client: { select: { companyName: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.code} · ${row.client.companyName}`,
      }));
    }
    if (kind === VisualDocumentKind.CONTRACT) {
      const rows = await this.prisma.serviceContract.findMany({
        take: 12,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          code: true,
          client: { select: { companyName: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.code} · ${row.client.companyName}`,
      }));
    }
    const rows = await this.prisma.serviceReport.findMany({
      take: 12,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        code: true,
        client: { select: { companyName: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      label: `${row.code} · ${row.client.companyName}`,
    }));
  }

  async preview(input: {
    kind?: VisualDocumentKind;
    blocks?: unknown;
    recordId?: string;
  }) {
    const kind = this.requireKind(input.kind);
    const { blocks, mappings } = await this.prepareBlocks(kind, input.blocks);
    const context = input.recordId
      ? await this.realContext(kind, input.recordId)
      : this.sampleContext(kind);
    const rendered = this.renderBlocks(blocks, mappings, context);
    return {
      html: this.html(rendered),
      isSample: !input.recordId,
      blocks: rendered,
    };
  }

  async getPublished(kind: VisualDocumentKind) {
    const template = await this.prisma.visualDocumentTemplate.findFirst({
      where: { kind, isActive: true, publishedVersion: { not: null } },
    });
    if (!template?.publishedVersion) return null;
    const version = await this.prisma.visualDocumentTemplateVersion.findUnique({
      where: {
        templateId_versionNumber: {
          templateId: template.id,
          versionNumber: template.publishedVersion,
        },
      },
      include: {
        fieldsMapping: {
          select: { fieldId: true, sourcePath: true, fixedValue: true },
        },
      },
    });
    return version
      ? { template, version: version as VersionWithMapping }
      : null;
  }

  async renderPublished(
    kind: VisualDocumentKind,
    payload: Record<string, unknown>,
  ) {
    const published = await this.getPublished(kind);
    if (!published) return null;
    const context = this.institutional.buildContext(
      this.institutionalKind(kind),
      payload,
      `visual/${published.template.id}`,
    ) as unknown as Record<string, unknown>;
    if (kind === VisualDocumentKind.SERVICE_REPORT) {
      context.checklistItems = payload.checklistItems || [];
    }
    const blocks = this.renderBlocks(
      published.version.blocks as VisualBlock[],
      published.version.fieldsMapping,
      context,
    );
    return {
      blocks,
      html: this.html(blocks),
      context,
      templateKey: `visual/${published.template.id}`,
      templateVersion: `v${published.version.versionNumber}`,
      name: published.template.name,
    };
  }

  async renderPublishedReportPdf(
    payload: Record<string, unknown>,
    validationUrl?: string | null,
  ) {
    const rendered = await this.renderPublished(
      VisualDocumentKind.SERVICE_REPORT,
      payload,
    );
    return rendered
      ? {
          buffer: this.pdf(rendered.name, rendered.blocks, validationUrl),
          templateKey: rendered.templateKey,
          templateVersion: rendered.templateVersion,
        }
      : null;
  }

  pdf(
    title: string,
    blocks: RenderedVisualBlock[],
    validationUrl?: string | null,
  ) {
    const doc = new SimplePdfDocument();
    doc.title(title);
    doc.text('MANITEC Operação Integrada', {
      size: 15,
      bold: true,
      yGapAfter: 14,
    });
    for (const block of blocks) {
      if (block.type === 'spacer') {
        doc.gap(Math.min(48, block.spaceAfter));
        continue;
      }
      doc.text(block.text || ' ', {
        size: block.fontSize,
        bold: block.bold || block.type === 'heading',
        yGapAfter: block.spaceAfter,
        align: block.align,
      });
    }
    if (validationUrl) {
      doc.pageBreak();
      doc.text('Validação do relatório', {
        size: 16,
        bold: true,
        yGapAfter: 14,
      });
      doc.text(validationUrl, { size: 9, yGapAfter: 20 });
      doc.qrCode(validationUrl, 48, 540, 120);
    }
    return doc.finish();
  }

  private async ensureBuiltins() {
    await this.prisma.visualDocumentField.createMany({
      data: BUILTIN_FIELDS.map((field) => ({
        id: `builtin-${field.key}`,
        key: field.key,
        label: field.label,
        category: field.category,
        kinds: [...field.kinds],
        sourcePath: field.sourcePath,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  private async prepareBlocks(kind: VisualDocumentKind, value: unknown) {
    await this.ensureBuiltins();
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
      throw new BadRequestException('Adicione de 1 a 100 blocos ao documento.');
    }
    const blocks: VisualBlock[] = value.map((candidate: unknown, index) => {
      const block = candidate as Partial<VisualBlock>;
      if (
        !block ||
        !['paragraph', 'heading', 'spacer'].includes(String(block.type))
      )
        throw new BadRequestException(`Bloco ${index + 1} inválido.`);
      const segments = block.type === 'spacer' ? [] : block.segments;
      if (!Array.isArray(segments) || segments.length > 100)
        throw new BadRequestException(
          `Conteúdo do bloco ${index + 1} inválido.`,
        );
      const normalizedSegments: VisualSegment[] = segments.map((entry) => {
        if (entry?.type === 'field' && typeof entry.fieldId === 'string')
          return { type: 'field', fieldId: entry.fieldId };
        if (
          entry?.type === 'text' &&
          typeof entry.text === 'string' &&
          entry.text.length <= 5000 &&
          !entry.text.includes('{{') &&
          !entry.text.includes('}}')
        )
          return { type: 'text', text: entry.text };
        throw new BadRequestException(
          'Use texto comum e os campos da biblioteca.',
        );
      });
      const fontSize = Number(
        block.fontSize ?? (block.type === 'heading' ? 18 : 11),
      );
      const spaceAfter = Number(block.spaceAfter ?? 8);
      if (
        !Number.isInteger(fontSize) ||
        fontSize < 8 ||
        fontSize > 32 ||
        !Number.isInteger(spaceAfter) ||
        spaceAfter < 0 ||
        spaceAfter > 48
      )
        throw new BadRequestException(
          'Tamanho ou espaçamento fora do permitido.',
        );
      return {
        id:
          typeof block.id === 'string' && block.id.length < 80
            ? block.id
            : randomUUID(),
        type: block.type!,
        segments: normalizedSegments,
        fontSize,
        bold: Boolean(block.bold),
        align: ['left', 'center', 'right'].includes(String(block.align))
          ? block.align!
          : 'left',
        spaceAfter,
      };
    });
    const ids = [
      ...new Set(
        blocks.flatMap((block) =>
          block.segments
            .filter(
              (segment): segment is Extract<VisualSegment, { type: 'field' }> =>
                segment.type === 'field',
            )
            .map((segment) => segment.fieldId),
        ),
      ),
    ];
    const fields = ids.length
      ? await this.prisma.visualDocumentField.findMany({
          where: { id: { in: ids }, kinds: { has: kind } },
        })
      : [];
    if (fields.length !== ids.length)
      throw new BadRequestException(
        'Um dos campos escolhidos não está disponível para este documento.',
      );
    return {
      blocks,
      mappings: fields.map((field) => ({
        fieldId: field.id,
        sourcePath: field.sourcePath,
        fixedValue: field.fixedValue,
      })),
    };
  }

  private renderBlocks(
    blocks: VisualBlock[],
    mappings: Array<{
      fieldId: string;
      sourcePath: string | null;
      fixedValue: string | null;
    }>,
    context: Record<string, unknown>,
  ): RenderedVisualBlock[] {
    const byId = new Map(mappings.map((mapping) => [mapping.fieldId, mapping]));
    return blocks.map((block) => {
      const runs = block.segments.map((segment) => ({
        text:
          segment.type === 'text'
            ? segment.text
            : this.fieldValue(byId.get(segment.fieldId), context),
        isField: segment.type === 'field',
      }));
      return { ...block, runs, text: runs.map((run) => run.text).join('') };
    });
  }

  private fieldValue(
    mapping:
      | { sourcePath: string | null; fixedValue: string | null }
      | undefined,
    context: Record<string, unknown>,
  ) {
    if (!mapping) return '';
    if (mapping.fixedValue !== null) return mapping.fixedValue;
    if (mapping.sourcePath === '__today__')
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }).format(new Date());
    if (
      mapping.sourcePath?.startsWith('__') &&
      mapping.sourcePath !== '__today__'
    ) {
      const entries =
        mapping.sourcePath === '__report_checklist__'
          ? context.checklistItems
          : context.items;
      if (!Array.isArray(entries)) return '';
      return entries
        .map((entry: Record<string, unknown>, index: number) => {
          if (mapping.sourcePath === '__report_checklist__')
            return `${index + 1}. ${this.scalar(entry.label, '-')}: ${this.scalar(entry.result, '-')}${entry.notes ? ` · ${this.scalar(entry.notes)}` : ''}`;
          if (mapping.sourcePath === '__report_evidence__')
            return `${index + 1}. ${this.scalar(entry.title || entry.fileName, 'Evidência')}${entry.description ? ` · ${this.scalar(entry.description)}` : ''}`;
          return `${index + 1}. ${this.scalar(entry.description || entry.name, 'Item')}${entry.quantity ? ` · ${this.scalar(entry.quantity)}` : ''}${entry.total ? ` · ${this.scalar(entry.total)}` : ''}`;
        })
        .join('\n');
    }
    const result = mapping.sourcePath
      ?.split('.')
      .reduce<unknown>(
        (value, key) =>
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined,
        context,
      );
    return this.scalar(result);
  }

  private scalar(value: unknown, fallback = ''): string {
    return typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
      ? String(value)
      : fallback;
  }

  private html(blocks: RenderedVisualBlock[]) {
    const escape = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const body = blocks
      .map((block) => {
        if (block.type === 'spacer')
          return `<div style="height:${block.spaceAfter}px"></div>`;
        const content = block.runs
          .map((run) => escape(run.text).replace(/\n/g, '<br>'))
          .join('');
        const tag = block.type === 'heading' ? 'h2' : 'p';
        return `<${tag} style="font-size:${block.fontSize}px;font-weight:${block.bold || block.type === 'heading' ? 700 : 400};text-align:${block.align};margin:0 0 ${block.spaceAfter}px;white-space:pre-wrap">${content || '&nbsp;'}</${tag}>`;
      })
      .join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033;margin:0}.paper{max-width:794px;margin:0 auto;background:white;min-height:1123px;padding:58px 64px;box-sizing:border-box;box-shadow:0 12px 35px #0f172a20}.brand{font-weight:800;color:#16324f;font-size:17px;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:28px}@media print{.paper{box-shadow:none;margin:0;max-width:none}}</style></head><body><article class="paper"><div class="brand">MANITEC · OPERAÇÃO INTEGRADA</div>${body}</article></body></html>`;
  }

  private sampleContext(kind: VisualDocumentKind) {
    return this.templates.loadInstitutional(this.institutionalKind(kind))
      .sampleData;
  }

  private async realContext(kind: VisualDocumentKind, id: string) {
    const company =
      (await this.prisma.companySettings.findFirst({
        where: { isPrimary: true },
      })) || (await this.prisma.companySettings.findFirst());
    let payload: Record<string, unknown>;
    if (kind === VisualDocumentKind.PROPOSAL) {
      const row = await this.prisma.proposal.findUnique({
        where: { id },
        include: {
          client: true,
          generator: true,
          user: true,
          items: { include: { catalogItem: true } },
        },
      });
      if (!row)
        throw new NotFoundException('Proposta não encontrada para a prévia.');
      payload = {
        company,
        client: row.client,
        generator: row.generator,
        seller: row.user,
        items: row.items,
        document: { ...row, issuedAt: row.updatedAt },
      };
    } else if (kind === VisualDocumentKind.CONTRACT) {
      const row = await this.prisma.serviceContract.findUnique({
        where: { id },
        include: {
          client: true,
          createdByUser: true,
          equipments: {
            include: { generator: { include: { currentSite: true } } },
          },
        },
      });
      if (!row)
        throw new NotFoundException('Contrato não encontrado para a prévia.');
      payload = {
        company,
        client: row.client,
        createdByUser: row.createdByUser,
        equipments: row.equipments,
        document: { ...row, issuedAt: row.updatedAt },
      };
    } else {
      const row = await this.prisma.serviceReport.findUnique({
        where: { id },
        include: {
          client: true,
          generator: true,
          technician: { include: { user: true } },
          checklistItems: { orderBy: { sortOrder: 'asc' } },
          evidences: { where: { deletedAt: null, customerVisible: true } },
        },
      });
      if (!row)
        throw new NotFoundException('Relatório não encontrado para a prévia.');
      payload = {
        ...row,
        company,
        client: row.client,
        generator: row.generator,
        technician: row.technician,
      };
    }
    const context = this.institutional.buildContext(
      this.institutionalKind(kind),
      payload,
      'visual/preview',
    ) as unknown as Record<string, unknown>;
    if (kind === VisualDocumentKind.SERVICE_REPORT)
      context.checklistItems = payload.checklistItems || [];
    return context;
  }

  private institutionalKind(kind: VisualDocumentKind) {
    return kind === VisualDocumentKind.PROPOSAL
      ? ('proposal' as const)
      : kind === VisualDocumentKind.CONTRACT
        ? ('contract' as const)
        : ('service-report' as const);
  }

  private requireKind(value?: VisualDocumentKind) {
    if (!value || !ALL_KINDS.includes(value))
      throw new BadRequestException('Tipo de documento inválido.');
    return value;
  }

  private requireName(value?: string) {
    const name = value?.trim();
    if (!name || name.length > 120)
      throw new BadRequestException('Informe um nome de até 120 caracteres.');
    return name;
  }
}
