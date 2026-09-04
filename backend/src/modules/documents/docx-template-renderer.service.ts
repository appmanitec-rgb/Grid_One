import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
import {
  InstitutionalTemplateDefinition,
  LoadedInstitutionalDocumentTemplate,
} from './document-template.service';

type RenderContext = Record<string, unknown>;

export type GeneratedDocxDocument = {
  buffer: Buffer;
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  checksumSha256: string;
  templateKey: string;
  templateVersion: string;
  fileName: string;
};

type DocxFile = {
  path: string;
  content: Buffer;
};

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
const WORD_TEXT_XML_PATTERN = /^word\/(?:document|header\d+|footer\d+)\.xml$/;

@Injectable()
export class DocxTemplateRendererService {
  private readonly legacyVariables: Array<[string, string]> = [
    ['!pecasrelatorio.dataset', ''],
    ['!servicosrel.dataset', ''],
    ['!dadosequipamentosjoin.dataset', ''],
    ['!prodcontratopxjoin.dataset', ''],
    ['!orcamentositens2.orcamento', '{{proposal.number}}'],
    ['!contratospx.CONTRATO', '{{contract.number}}'],
    ['^dataorc', '{{proposal.date}}'],
    ['^datacon', '{{contract.date}}'],
    ['^nomeempresa', '{{company.name}}'],
    ['^codag', '{{company.document}}'],
    ['^cnpjcpf.cnpj', '{{company.document}}'],
    ['^inscrrg', '{{company.stateRegistration}}'],
    ['^incrmuncli', '{{company.municipalRegistration}}'],
    ['^endereco1', '{{company.street}}'],
    ['^endereco', '{{company.street}}'],
    ['^nummanitec', '{{company.addressNumber}}'],
    ['^cidade1', '{{company.city}}'],
    ['^bairro1', '{{company.district}}'],
    ['^uf1', '{{company.state}}'],
    ['^cep1', '{{company.zipCode}}'],
    ['^nomeconsultor', '{{consultant.name}}'],
    ['^consulcel', '{{consultant.phone}}'],
    ['!orcamentositens2.respequipemailrel', '{{consultant.email}}'],
    ['!contratospx.respemailrel', '{{consultant.email}}'],
    ['!PESSOALDP.EMAILREL', '{{consultant.email}}'],
    ['!contatosjoin.NOME', '{{contact.name}}'],
    ['!contatosjoin.TEL.phone', '{{contact.phone}}'],
    ['!contatosjoin.EMAIL', '{{contact.email}}'],
    ['!pessoal.NOME', '{{consultant.name}}'],
    ['!pessoal.TELREL.phone', '{{consultant.phone}}'],
    ['^codct', '{{client.id}}'],
    ['!ORCAMENTOSITENS2.CLI3NOME', '{{client.name}}'],
    ['!contratospx.agentesNOME', '{{client.name}}'],
    ['!AGENTES.FANTASIA', '{{client.tradeName}}'],
    ['^ctcnpj', '{{client.document}}'],
    ['^inscrct', '{{client.stateRegistration}}'],
    ['^inscrmunct', '{{client.municipalRegistration}}'],
    ['^enderecoct', '{{client.street}}'],
    ['^numeroct', '{{client.addressNumber}}'],
    ['^cidadect', '{{client.city}}'],
    ['^bairroct', '{{client.district}}'],
    ['^ufct', '{{client.state}}'],
    ['^cepct', '{{client.zipCode}}'],
    ['^contatoct', '{{contact.name}}'],
    ['!contatosequip.TEL', '{{contact.phone}}'],
    ['!contatos.TEL', '{{contact.phone}}'],
    ['^celularct', '{{contact.mobile}}'],
    ['!contatosequip.CARGO', '{{contact.role}}'],
    ['!contatos.CARGO', '{{contact.role}}'],
    ['!contatosequip.EMAIL', '{{contact.email}}'],
    ['!contatos.EMAIL', '{{contact.email}}'],
    ['!itensequip.CODIGO', '{{equipment.name}}'],
    ['^tipoequip', '{{equipment.type}}'],
    ['^fabrequip', '{{equipment.manufacturer}}'],
    ['^fabrmotor', '{{equipment.engineManufacturer}}'],
    ['^fabrhorimetro', '{{equipment.hourMeter}}'],
    ['^fabrpot', '{{equipment.power}}'],
    ['!EQUIPAMENTOS.SERIE', '{{equipment.serialNumber}}'],
    ['^fabrnumserie', '{{equipment.engineSerialNumber}}'],
    ['!ORCITENSESCOPO.EXECUTARTITULO', '{{proposal.title}}'],
    ['^servexecutar', '{{proposal.scope}}'],
    ['!ORCAMENTOSITENS2.EXCFORNECIMENTO', '{{technicalScope.exclusions}}'],
    ['!ORCAMENTOSITENS2.OBS', '{{proposal.notes}}'],
    ['!ORCAMENTOSITENS2.INICIOORCREL', '{{proposal.deliveryLeadTimeDays}}'],
    ['!ORCAMENTOSITENS2.VALIDADEORCREL', '{{proposal.executionLeadTimeDays}}'],
    ['!ORCAMENTOSITENS2.PRAZOENTREGAREL', '{{proposal.deliveryLeadTimeDays}}'],
    ['!orcamentositens2.respnomeentrega', '{{contact.name}}'],
    ['^totalmaoobraserv', '{{proposal.laborTotal}}'],
    ['^totaldespesasrel', '{{proposal.expensesTotal}}'],
    ['^totalprodrel', '{{proposal.materialsTotal}}'],
    ['^textodescserv', 'Desconto servicos'],
    ['^totaldescservrel', '{{proposal.discountTotal}}'],
    ['^textodescprod', 'Desconto materiais'],
    ['^totaldescprodrel', '{{proposal.discountTotal}}'],
    ['!orcamentositens2.totalproposta.r$', '{{proposal.total}}'],
    ['!orcamentositens2.totalproposta.r', '{{proposal.total}}'],
    ['!ORCAMENTOSITENS2.CONDPAG', '{{proposal.paymentTerms}}'],
    ['^formapagamento', '{{proposal.paymentMethod}}'],
    ['!ORCAMENTOSITENS2.VALIDADE', '{{proposal.validUntil}}'],
    ['!ORCAMENTOSITENS2.PRAZOEXEC', '{{proposal.deliveryTerm}}'],
    ['^freteobs', '{{proposal.freight}}'],
    ['^impostosobs', '{{proposal.taxes}}'],
    ['!contratospx.anodata', '{{contract.billingPeriod}}'],
    ['!CONTRATOSPX.valordesconto.R$', '{{contract.recurringAmount}}'],
    ['!PRODCONTRATOPX.TEXTOUM', '{{contract.partsCoverage}}'],
    ['!prodcontratopx.TEXTOdois', '{{contract.partsCoverage}}'],
    ['!contitens.totalpecas.r$', '{{contract.recurringAmount}}'],
    ['!prodcontratopx.TEXTOtres', '{{contract.notes}}'],
    ['!contratospx.meiopagamentodescricao', '{{contract.paymentMethod}}'],
    ['!CONTRATOSPX.VENCIMENTOPAGAMENTO', '{{contract.dueDay}}'],
    [
      '!CONTRATOSPX.VIGENCIACONTRATODESCRICAO',
      '{{contract.validityDescription}}',
    ],
    ['!CONTRATOSPX.RENOVACAOVIGENCIADESCRICAO', '{{contract.renewalNotes}}'],
    [
      '!CONTRATOSPX.INDICEREAJUSTEDESCRICAO',
      '{{commercialTerms.adjustmentIndex}}',
    ],
    [
      '!CONTRATOSPX.COMUNICACAORENOVACAODESCRICAO',
      '{{contract.renewalNotice}}',
    ],
    [
      '!CONTRATOSPX.SERVICOSIMPOSTOSLOOKUPDESCRICAOLOOKUP',
      '{{contract.maintenanceWindow}}',
    ],
    [
      '!CONTRATOSPX.MANUTENCAOPREVENTIVADESCRICAO',
      '{{contract.preventiveRecurrence}}',
    ],
    ['!CONTRATOSPX.NUMCHAMADO', '{{contract.correctiveVisitAllowance}}'],
    [
      '!CONTRATOSPX.CHAMADOSDATADESCRICAO',
      '{{contract.correctiveVisitAllowancePeriod}}',
    ],
    ['!CONTRATOSPX.NUMRESUMO', '{{contract.preventiveVisitSummary}}'],
    ['!CONTRATOSPX.OBS', '{{contract.notes}}'],
    ['!CONTRATOSPX.PRAZOEMERGENCIAL', '{{contract.responseTime}}'],
    ['!chamadosextrastabela.HTC.R$', '-'],
    ['!chamadosextrastabela.HTPC.R$', '-'],
    ['!chamadosextrastabela.SDf.R$', '-'],
    ['!chamadosextrastabela.INDEVIDOS.R$', '-'],
    ['!chamadosextrastabela.EXTRAS.R$', '-'],
  ];

  render(input: {
    template: LoadedInstitutionalDocumentTemplate;
    context: RenderContext;
    fileName: string;
  }): GeneratedDocxDocument {
    this.validateRequiredFields(input.template, input.context);
    const documentXml = this.renderDocumentXml(
      input.template.definition,
      input.context,
    );
    const useDocxTemplate = input.template.schema.useDocxTemplate !== false;
    const buffer =
      useDocxTemplate &&
      input.template.docxTemplatePath &&
      existsSync(input.template.docxTemplatePath)
        ? this.renderDocxTemplateFile(
            input.template.docxTemplatePath,
            input.context,
          )
        : this.buildDocxArchive({
            documentXml,
            title: this.renderText(
              input.template.definition.title,
              input.context,
            ),
          });

    return {
      buffer,
      mimeType: DOCX_MIME,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
      templateKey: input.template.key,
      templateVersion: input.template.version,
      fileName: input.fileName,
    };
  }

  renderDocumentXml(
    definition: InstitutionalTemplateDefinition,
    context: RenderContext,
  ) {
    const parts: string[] = [];
    parts.push(this.documentBrand());
    parts.push(
      this.paragraph(this.renderText(definition.title, context), 'Title'),
    );
    if (definition.subtitle) {
      parts.push(this.paragraph(this.renderText(definition.subtitle, context)));
    }

    for (const section of definition.sections) {
      if (section.pageBreakBefore) parts.push(this.pageBreak());
      if (section.heading) {
        parts.push(
          this.paragraph(this.renderText(section.heading, context), 'Heading'),
        );
      }
      for (const paragraph of section.paragraphs || []) {
        const rendered = this.renderText(paragraph, context).trim();
        if (rendered) parts.push(this.paragraph(rendered));
      }
      if (section.table) {
        parts.push(this.table(section.table, context));
      }
    }

    if (definition.footer?.length) {
      parts.push(this.paragraph('Controle documental', 'Heading'));
      for (const footerLine of definition.footer) {
        parts.push(
          this.paragraph(this.renderText(footerLine, context), 'Muted'),
        );
      }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join('\n    ')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1020" w:bottom="1276" w:left="1020" w:header="567" w:footer="567" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  private renderDocxTemplateFile(
    path: string,
    context: RenderContext,
  ) {
    const files = this.unzip(readFileSync(path)).map((file) => {
      if (!WORD_TEXT_XML_PATTERN.test(file.path)) return file;

      const sourceXml = file.content.toString('utf8');
      const preparedXml = this.renderLegacyTemplateMarkers(sourceXml);

      const rendered = this.renderXmlTemplate(preparedXml, context);

      return {
        ...file,
        content: Buffer.from(rendered, 'utf8'),
      };
    });
    const unresolved = this.findUnresolvedTemplateMarkers(files);
    const unresolvedLegacy = this.findUnresolvedLegacyMarkers(files);

    if (unresolved.length || unresolvedLegacy.length) {
      throw new BadRequestException(
        [
          'Template Word possui campos nao resolvidos:',
          [...unresolved, ...unresolvedLegacy].slice(0, 12).join(', '),
          'Revise o mapeamento do modelo antes de disponibilizar o documento.',
        ].join(' '),
      );
    }

    return this.zip(files);
  }

  private renderLegacyTemplateMarkers(xml: string) {
    return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) =>
      this.renderLegacyParagraph(paragraph),
    );
  }

  private renderLegacyParagraph(paragraph: string) {
    const text = this.extractWordParagraphText(paragraph);
    if (!this.hasLegacyMarker(text)) return paragraph;
    const normalized = text.toLocaleLowerCase('pt-BR');

    if (normalized.includes('!pecasrelatorio.dataset')) {
      return this.legacyProposalItemsTable('parts');
    }

    if (normalized.includes('!servicosrel.dataset')) {
      return this.legacyProposalItemsTable('services');
    }

    if (normalized.includes('!dadosequipamentosjoin.dataset')) {
      return this.legacyContractEquipmentsTable();
    }

    if (normalized.includes('!prodcontratopxjoin.dataset')) {
      return this.legacyContractProductsTable();
    }

    return this.replaceLegacyVariablesInRuns(paragraph);
  }

  private hasLegacyMarker(text: string) {
    const normalized = text.toLocaleLowerCase('pt-BR');
    return this.legacyVariables.some(([marker]) =>
      normalized.includes(marker.toLocaleLowerCase('pt-BR')),
    );
  }

  private replaceLegacyVariablesInRuns(paragraph: string) {
    const textNodePattern = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
    const matches = [...paragraph.matchAll(textNodePattern)];
    if (!matches.length) return paragraph;

    const values = matches.map((match) => this.decodeXmlText(match[2]));
    const mappings = [...this.legacyVariables].sort(
      ([left], [right]) => right.length - left.length,
    );

    for (const [marker, replacement] of mappings) {
      const normalizedMarker = marker.toLocaleLowerCase('pt-BR');

      while (true) {
        const combined = values.join('');
        const markerStart = combined
          .toLocaleLowerCase('pt-BR')
          .indexOf(normalizedMarker);
        if (markerStart < 0) break;

        const markerEnd = markerStart + marker.length;
        let cursor = 0;
        let firstNode = -1;
        let lastNode = -1;
        let firstOffset = 0;
        let lastOffset = 0;

        for (let index = 0; index < values.length; index += 1) {
          const nodeEnd = cursor + values[index].length;
          if (firstNode < 0 && markerStart < nodeEnd) {
            firstNode = index;
            firstOffset = markerStart - cursor;
          }
          if (markerEnd <= nodeEnd) {
            lastNode = index;
            lastOffset = markerEnd - cursor;
            break;
          }
          cursor = nodeEnd;
        }

        if (firstNode < 0 || lastNode < 0) break;
        if (firstNode === lastNode) {
          values[firstNode] =
            values[firstNode].slice(0, firstOffset) +
            replacement +
            values[firstNode].slice(lastOffset);
          continue;
        }

        values[firstNode] =
          values[firstNode].slice(0, firstOffset) + replacement;
        for (let index = firstNode + 1; index < lastNode; index += 1) {
          values[index] = '';
        }
        values[lastNode] = values[lastNode].slice(lastOffset);
      }
    }

    let textNodeIndex = 0;
    return paragraph.replace(
      textNodePattern,
      (_match, opening: string, _value: string, closing: string) => {
        const value = values[textNodeIndex] || '';
        textNodeIndex += 1;
        return `${opening}${this.escapeXml(value)}${closing}`;
      },
    );
  }

  private extractWordParagraphText(paragraph: string) {
    return this.decodeXmlText(
      paragraph
        .replace(/<w:tab\b[^>]*\/>/g, ' ')
        .replace(/<w:br\b[^>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, ''),
    );
  }

  private legacyProposalItemsTable(rowsPath: 'parts' | 'services') {
    return this.wrapTable([
      this.tableRow(['Descricao', 'SKU', 'Qtd.', 'Unitario', 'Total'], true),
      `{{#${rowsPath}}}${this.tableRow([
        '{{description}}',
        '{{sku}}',
        '{{quantity}}',
        '{{unitPrice}}',
        '{{total}}',
      ])}{{/${rowsPath}}}`,
    ]);
  }

  private legacyContractEquipmentsTable() {
    return this.wrapTable([
      this.tableRow(['Equipamento', 'Serie', 'Local', 'Cobertura'], true),
      `{{#items}}${this.tableRow([
        '{{description}}',
        '{{serialNumber}}',
        '{{site}}',
        '{{coverage}}',
      ])}{{/items}}`,
    ]);
  }

  private legacyContractProductsTable() {
    return this.wrapTable([
      this.tableRow(['Descricao', 'Qtd.', 'Unidade', 'Valor'], true),
      `{{#services}}${this.tableRow([
        '{{description}}',
        '{{quantity}}',
        '{{unit}}',
        '{{total}}',
      ])}{{/services}}`,
    ]);
  }

  private renderProfessionalProposalDocument(
    sourceXml: string,
    context: RenderContext,
  ) {
    const bodyMatch = sourceXml.match(
      /^([\s\S]*?<w:body>)([\s\S]*)(<\/w:body>[\s\S]*)$/,
    );
    if (!bodyMatch) {
      throw new BadRequestException(
        'Modelo de proposta sem corpo Word reconhecivel.',
      );
    }

    const [, prefix, body, suffix] = bodyMatch;
    const firstTable = body.indexOf('<w:tbl');
    const sections = [...body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)];
    const finalSection = sections.at(-1)?.[0];
    if (firstTable < 0 || !finalSection) {
      throw new BadRequestException(
        'Modelo de proposta sem divisao de capa ou secao principal.',
      );
    }

    const cover = body.slice(0, firstTable);
    return `${prefix}${cover}${this.professionalProposalBody(
      context,
    )}${finalSection}${suffix}`;
  }

  private professionalProposalBody(context: RenderContext) {
    const value = (path: string, fallback = '-') => {
      const resolved = this.stringify(this.resolvePath(path, context)).trim();
      return resolved || fallback;
    };
    const parts = this.professionalRecords(context, 'parts');
    const services = this.professionalRecords(context, 'services');

    return [
      this.professionalTitle('Proposta comercial'),
      this.professionalParagraph(value('proposal.title'), {
        size: 24,
        color: '334E68',
        after: 120,
      }),
      this.professionalMetaLine([
        ['Proposta', value('proposal.number')],
        ['Emissão', value('proposal.date')],
        ['Validade', value('proposal.validUntil')],
      ]),
      this.professionalSectionHeading('Resumo executivo'),
      this.professionalParagraph(
        `A ${value('company.name', 'MANITEC')} apresenta a ${value(
          'client.name',
        )} esta proposta para ${value(
          'proposal.summary',
          value('proposal.scope', 'fornecimento e serviços técnicos'),
        )}.`,
        { after: 180 },
      ),
      this.professionalInfoRows([
        ['Cliente', value('client.name')],
        ['CNPJ / CPF', value('client.document')],
        ['Responsável', value('contact.name')],
        [
          'Contato',
          [value('contact.phone'), value('contact.email')]
            .filter((item) => item !== '-')
            .join(' | ') || '-',
        ],
        ['Equipamento', value('equipment.name')],
        ['Série', value('equipment.serialNumber')],
      ]),
      this.professionalInvestmentBand([
        ['Investimento total', value('proposal.total')],
        ['Pagamento', value('proposal.paymentTerms')],
        ['Prazo previsto', value('proposal.deliveryTerms')],
      ]),
      this.professionalParagraph(
        `Responsável comercial: ${value('consultant.name')} | ${value(
          'consultant.email',
        )} | ${value('consultant.phone')}`,
        { size: 18, color: '627D98', before: 160 },
      ),

      this.pageBreak(),
      this.professionalTitle('Escopo e composição'),
      this.professionalSectionHeading('Objetivo e escopo'),
      this.professionalParagraph(
        value('proposal.scope', 'Escopo não informado.'),
        {
          after: 180,
        },
      ),
      this.professionalSectionHeading('Equipamento de referência'),
      this.professionalInfoRows([
        ['Equipamento', value('equipment.name')],
        ['Tipo', value('equipment.type')],
        ['Fabricante', value('equipment.manufacturer')],
        ['Motor', value('equipment.engineManufacturer')],
        ['Potência', value('equipment.power')],
        ['Horímetro', value('equipment.hourMeter')],
      ]),
      this.professionalItemsSection('Peças e materiais', parts),
      this.professionalItemsSection('Serviços', services),

      this.pageBreak(),
      this.professionalTitle('Condições de fornecimento'),
      this.professionalSectionHeading('Prazos, garantia e critérios técnicos'),
      this.professionalLabeledParagraph(
        'Prazo de entrega e execução',
        value('proposal.deliveryTerms'),
      ),
      this.professionalLabeledParagraph(
        'Garantia',
        value('technicalScope.warranty'),
      ),
      this.professionalLabeledParagraph(
        'Normas e segurança',
        value('terms.standards'),
      ),
      this.professionalSectionHeading('Responsabilidades'),
      this.professionalLabeledParagraph(
        'MANITEC',
        value('terms.contractorObligations'),
      ),
      this.professionalLabeledParagraph(
        'Cliente',
        value('terms.clientObligations'),
      ),
      this.professionalSectionHeading('Limites do fornecimento'),
      this.professionalLabeledParagraph(
        'Exclusões',
        value('technicalScope.exclusions'),
      ),
      this.professionalLabeledParagraph(
        'Observações',
        value('proposal.notes', 'Sem observações adicionais.'),
      ),

      this.pageBreak(),
      this.professionalTitle('Condições comerciais e aceite'),
      this.professionalSectionHeading('Composição do investimento'),
      this.professionalTotalsTable([
        ['Serviços e mão de obra', value('proposal.laborTotal')],
        ['Materiais e peças', value('proposal.materialsTotal')],
        ['Despesas', value('proposal.expensesTotal')],
        ['Descontos', value('proposal.discountTotal')],
        ['Valor total da proposta', value('proposal.total')],
      ]),
      this.professionalSectionHeading('Condições comerciais'),
      this.professionalInfoRows([
        ['Condição de pagamento', value('proposal.paymentTerms')],
        ['Forma de pagamento', value('proposal.paymentMethod')],
        ['Validade', value('proposal.validUntil')],
        ['Prazo', value('proposal.deliveryTerms')],
        ['Frete', value('proposal.freight')],
        ['Impostos', value('proposal.taxes')],
      ]),
      this.professionalParagraph(value('terms.default'), {
        size: 18,
        color: '486581',
        before: 120,
        after: 140,
      }),
      this.professionalSectionHeading('Aceite'),
      this.professionalParagraph(
        'A aprovação desta proposta confirma a ciência e o aceite do escopo, dos valores, dos prazos e das condições comerciais apresentados.',
        { after: 300 },
      ),
      this.professionalSignatureTable([
        [value('approval.clientSignerName', value('contact.name')), 'Cliente'],
        [value('consultant.name'), 'MANITEC'],
      ]),
      this.professionalParagraph(
        `${value('company.city', 'Indaiatuba')}, ${value('approval.date', value('proposal.date'))}`,
        { align: 'right', size: 18, before: 180 },
      ),
    ].join('');
  }

  private professionalRecords(context: RenderContext, path: string) {
    const records = this.resolvePath(path, context);
    return Array.isArray(records)
      ? records.filter(
          (record): record is Record<string, unknown> =>
            Boolean(record) && typeof record === 'object',
        )
      : [];
  }

  private professionalTitle(value: string) {
    return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="500" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="8" w:color="0B4F8A"/></w:pBdr></w:pPr>${this.professionalRun(
      value,
      { bold: true, size: 34, color: '102A43' },
    )}</w:p>`;
  }

  private professionalSectionHeading(value: string) {
    return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="90"/></w:pPr>${this.professionalRun(
      value.toLocaleUpperCase('pt-BR'),
      { bold: true, size: 18, color: '0B4F8A' },
    )}</w:p>`;
  }

  private professionalParagraph(
    value: string,
    options: {
      bold?: boolean;
      size?: number;
      color?: string;
      before?: number;
      after?: number;
      align?: 'left' | 'center' | 'right';
    } = {},
  ) {
    const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : '';
    return `<w:p><w:pPr><w:spacing w:before="${
      options.before || 0
    }" w:after="${options.after ?? 100}" w:line="276" w:lineRule="auto"/>${alignment}</w:pPr>${this.professionalTextRuns(
      value,
      options,
    )}</w:p>`;
  }

  private professionalLabeledParagraph(label: string, value: string) {
    return `<w:p><w:pPr><w:keepNext/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>${this.professionalRun(
      `${label}: `,
      { bold: true, size: 20, color: '243B53' },
    )}${this.professionalTextRuns(value, { size: 20 })}</w:p>`;
  }

  private professionalMetaLine(items: Array<[string, string]>) {
    return this.professionalSimpleTable(
      items.map(([label, itemValue]) =>
        this.professionalCell(
          `${this.professionalRun(`${label.toUpperCase()}:  `, {
            bold: true,
            size: 15,
            color: '627D98',
          })}${this.professionalRun(itemValue, {
            bold: true,
            size: 20,
            color: '243B53',
          })}`,
          { width: Math.floor(5000 / items.length), borderBottom: true },
        ),
      ),
      { before: 0, after: 180 },
    );
  }

  private professionalInfoRows(items: Array<[string, string]>) {
    const rows: string[] = [];
    for (let index = 0; index < items.length; index += 2) {
      const pair = items.slice(index, index + 2);
      while (pair.length < 2) pair.push(['', '']);
      rows.push(
        `<w:tr>${pair
          .map(([label, itemValue]) =>
            this.professionalCell(
              `${this.professionalRun(`${label.toUpperCase()}:  `, {
                bold: true,
                size: 14,
                color: '627D98',
              })}${this.professionalRun(itemValue, {
                size: 20,
                color: '243B53',
              })}`,
              { width: 2500, borderBottom: true },
            ),
          )
          .join('')}</w:tr>`,
      );
    }
    return this.professionalTable(rows.join(''), { after: 140 });
  }

  private professionalInvestmentBand(items: Array<[string, string]>) {
    return this.professionalSimpleTable(
      items.map(([label, itemValue], index) =>
        this.professionalCell(
          `${this.professionalRun(`${label.toUpperCase()}:  `, {
            bold: true,
            size: 14,
            color: '627D98',
          })}${this.professionalRun(itemValue, {
            bold: true,
            size: index === 0 ? 28 : 20,
            color: index === 0 ? '0B4F8A' : '243B53',
          })}`,
          {
            width: index === 0 ? 2000 : 1500,
            borderTop: true,
            borderBottom: true,
          },
        ),
      ),
      { before: 100, after: 80 },
    );
  }

  private professionalItemsSection(
    title: string,
    records: Array<Record<string, unknown>>,
  ) {
    const heading = this.professionalSectionHeading(title);
    if (!records.length) {
      return `${heading}${this.professionalParagraph(
        'Nenhum item informado nesta categoria.',
        { size: 18, color: '829AB1' },
      )}`;
    }

    const header = this.professionalItemsRow(
      ['Descrição', 'SKU', 'Qtd.', 'Unitário', 'Total'],
      true,
    );
    const rows = records
      .map((record) =>
        this.professionalItemsRow([
          this.stringify(record.description),
          this.stringify(record.sku),
          this.stringify(record.quantity),
          this.stringify(record.unitPrice),
          this.stringify(record.total),
        ]),
      )
      .join('');
    return `${heading}${this.professionalTable(`${header}${rows}`, {
      after: 120,
    })}`;
  }

  private professionalItemsRow(values: string[], header = false) {
    const widths = [2100, 800, 500, 800, 800];
    return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${values
      .map((itemValue, index) =>
        this.professionalCell(
          this.professionalRun(itemValue || '-', {
            bold: header,
            size: header ? 16 : 18,
            color: header ? 'FFFFFF' : '243B53',
          }),
          {
            width: widths[index],
            fill: header ? '163A5F' : undefined,
            borderBottom: true,
          },
        ),
      )
      .join('')}</w:tr>`;
  }

  private professionalTotalsTable(items: Array<[string, string]>) {
    const rows = items
      .map(([label, itemValue], index) => {
        const total = index === items.length - 1;
        return `<w:tr>${this.professionalCell(
          this.professionalRun(label, {
            bold: total,
            size: total ? 21 : 19,
            color: total ? 'FFFFFF' : '243B53',
          }),
          {
            width: 3500,
            fill: total ? '163A5F' : undefined,
            borderBottom: true,
          },
        )}${this.professionalCell(
          this.professionalRun(itemValue, {
            bold: true,
            size: total ? 23 : 19,
            color: total ? 'FFFFFF' : '0B4F8A',
          }),
          {
            width: 1500,
            fill: total ? '163A5F' : undefined,
            borderBottom: true,
            align: 'right',
          },
        )}</w:tr>`;
      })
      .join('');
    return this.professionalTable(rows, { after: 140 });
  }

  private professionalSignatureTable(items: Array<[string, string]>) {
    const cells = items
      .map(([name, role]) =>
        this.professionalCell(
          `${this.professionalRun(name, {
            bold: true,
            size: 19,
            color: '243B53',
          })}<w:r><w:br/></w:r>${this.professionalRun(role, {
            size: 16,
            color: '627D98',
          })}`,
          { width: 2500, borderTop: true },
        ),
      )
      .join('');
    return this.professionalTable(`<w:tr>${cells}</w:tr>`, { after: 80 });
  }

  private professionalSimpleTable(
    cells: string[],
    spacing: { before?: number; after?: number } = {},
  ) {
    return this.professionalTable(`<w:tr>${cells.join('')}</w:tr>`, spacing);
  }

  private professionalTable(
    rows: string,
    _spacing: { before?: number; after?: number } = {},
  ) {
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${rows}</w:tbl>`;
  }

  private professionalCell(
    content: string,
    options: {
      width: number;
      fill?: string;
      borderTop?: boolean;
      borderBottom?: boolean;
      align?: 'left' | 'center' | 'right';
    },
  ) {
    const borders =
      options.borderTop || options.borderBottom
        ? `<w:tcBorders>${
            options.borderTop
              ? '<w:top w:val="single" w:sz="8" w:space="0" w:color="9FB3C8"/>'
              : ''
          }${
            options.borderBottom
              ? '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>'
              : ''
          }</w:tcBorders>`
        : '';
    const fill = options.fill
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>`
      : '';
    const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${options.width}" w:type="pct"/>${fill}${borders}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/>${alignment}</w:pPr>${content}</w:p></w:tc>`;
  }

  private professionalTextRuns(
    value: string,
    options: { bold?: boolean; size?: number; color?: string } = {},
  ) {
    return value
      .split(/\r?\n/)
      .map(
        (line, index) =>
          `${index > 0 ? '<w:r><w:br/></w:r>' : ''}${this.professionalRun(
            line,
            options,
          )}`,
      )
      .join('');
  }

  private professionalRun(
    value: string,
    options: { bold?: boolean; size?: number; color?: string } = {},
  ) {
    return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${
      options.bold ? '<w:b/><w:bCs/>' : ''
    }${options.color ? `<w:color w:val="${options.color}"/>` : ''}<w:sz w:val="${
      options.size || 20
    }"/><w:szCs w:val="${options.size || 20}"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(
      value,
    )}</w:t></w:r>`;
  }

  private validateRequiredFields(
    template: LoadedInstitutionalDocumentTemplate,
    context: RenderContext,
  ) {
    const required = Array.isArray(template.schema.required)
      ? template.schema.required
      : [];
    const missing = required
      .map((field) => String(field))
      .filter((field) => {
        const value = this.resolvePath(field, context);
        if (Array.isArray(value)) return false;
        return value === undefined || value === null || value === '';
      });

    if (missing.length) {
      throw new BadRequestException(
        `Template institucional ${template.key} sem variaveis obrigatorias: ${missing.join(', ')}.`,
      );
    }
  }

  private table(
    table: NonNullable<
      InstitutionalTemplateDefinition['sections'][number]['table']
    >,
    context: RenderContext,
  ) {
    const rows = this.resolvePath(table.rowsPath, context);
    const records = Array.isArray(rows) ? rows : [];
    const header = this.tableRow(
      table.columns.map((column) => column.header),
      true,
    );

    if (!records.length) {
      return this.wrapTable([
        header,
        this.tableRow([
          table.emptyText || 'Nenhum registro informado para esta secao.',
        ]),
      ]);
    }

    return this.wrapTable([
      header,
      ...records.map((record) =>
        this.tableRow(
          table.columns.map((column) =>
            this.stringify(this.resolvePath(column.path, record)),
          ),
        ),
      ),
    ]);
  }

  private wrapTable(rows: string[]) {
    return `<w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="ManitecTable"/>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblLayout w:type="autofit"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/>
        </w:tblBorders>
      </w:tblPr>
      ${rows.join('\n      ')}
    </w:tbl>`;
  }

  private tableRow(values: string[], bold = false) {
    const rowProperties = bold ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${rowProperties}${values
      .map(
        (value) =>
          `<w:tc><w:tcPr>${
            bold ? '<w:shd w:val="clear" w:color="auto" w:fill="16324F"/>' : ''
          }<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${this.run(
            value,
            bold,
            bold ? 'FFFFFF' : undefined,
          )}</w:p></w:tc>`,
      )
      .join('')}</w:tr>`;
  }

  private paragraph(
    value: string,
    style?: 'Brand' | 'Title' | 'Heading' | 'Muted',
  ) {
    const styleXml = style
      ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
      : '<w:pPr><w:pStyle w:val="BodyText"/></w:pPr>';
    return `<w:p>${styleXml}${this.renderTextRuns(value)}</w:p>`;
  }

  private documentBrand() {
    return `<w:tbl>
      <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:bottom w:val="single" w:sz="24" w:space="0" w:color="2563EB"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3400" w:type="pct"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Brand"/><w:spacing w:after="100"/></w:pPr>${this.run('MANITEC', true, '16324F')}</w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1600" w:type="pct"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="100"/></w:pPr>${this.run('OPERACAO INTEGRADA', true, '64748B')}</w:p></w:tc>
      </w:tr>
    </w:tbl>`;
  }

  private pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  private renderTextRuns(value: string) {
    const lines = value.split(/\r?\n/);
    return lines
      .map((line, index) => `${index > 0 ? '<w:br/>' : ''}${this.run(line)}`)
      .join('');
  }

  private run(value: string, bold = false, color?: string) {
    const properties = [
      bold ? '<w:b/>' : '',
      color ? `<w:color w:val="${color}"/>` : '',
    ].join('');
    const runProps = properties ? `<w:rPr>${properties}</w:rPr>` : '';
    return `<w:r>${runProps}<w:t xml:space="preserve">${this.escapeXml(value)}</w:t></w:r>`;
  }

  private renderText(template: string, context: RenderContext) {
    return this.renderVariables(
      this.renderLoops(template, context, false),
      context,
      false,
    );
  }

  private renderXmlTemplate(template: string, context: RenderContext) {
    return this.renderVariables(
      this.renderLoops(template, context, true),
      context,
      true,
    );
  }

  private renderLoops(
    template: string,
    context: RenderContext,
    escapeValues: boolean,
  ) {
    return template.replace(
      /{{#\s*([\w.]+)\s*}}([\s\S]*?){{\/\s*\1\s*}}/g,
      (_match, path: string, block: string) => {
        const value = this.resolvePath(path, context);
        if (!Array.isArray(value)) return '';
        return value
          .map((item) =>
            this.renderVariables(
              block,
              {
                ...context,
                ...(item && typeof item === 'object'
                  ? (item as Record<string, unknown>)
                  : { this: item }),
              },
              escapeValues,
            ),
          )
          .join('');
      },
    );
  }

  private renderVariables(
    template: string,
    context: RenderContext,
    escapeValues: boolean,
  ) {
    return template.replace(
      /{{\s*([\w.[\]]+(?:\.[\w.[\]]+)*)\s*}}/g,
      (_match, path: string) => {
        const value = this.stringify(this.resolvePath(path, context));
        return escapeValues ? this.escapeXml(value) : value;
      },
    );
  }

  private resolvePath(path: string, context: unknown) {
    const normalized = path.replace(/\[(\d+)\]/g, '.$1');
    return normalized.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, context);
  }

  private stringify(value: unknown) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private decodeXmlText(value: string) {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  private buildDocxArchive(input: { documentXml: string; title: string }) {
    const files: DocxFile[] = [
      {
        path: '[Content_Types].xml',
        content: Buffer.from(this.contentTypesXml(), 'utf8'),
      },
      {
        path: '_rels/.rels',
        content: Buffer.from(this.rootRelationshipsXml(), 'utf8'),
      },
      {
        path: 'docProps/app.xml',
        content: Buffer.from(this.appPropertiesXml(), 'utf8'),
      },
      {
        path: 'docProps/core.xml',
        content: Buffer.from(this.corePropertiesXml(input.title), 'utf8'),
      },
      {
        path: 'word/document.xml',
        content: Buffer.from(input.documentXml, 'utf8'),
      },
      {
        path: 'word/styles.xml',
        content: Buffer.from(this.stylesXml(), 'utf8'),
      },
      {
        path: 'word/settings.xml',
        content: Buffer.from(this.settingsXml(), 'utf8'),
      },
      {
        path: 'word/_rels/document.xml.rels',
        content: Buffer.from(this.documentRelationshipsXml(), 'utf8'),
      },
      {
        path: 'word/footer1.xml',
        content: Buffer.from(this.footerXml(), 'utf8'),
      },
    ];

    return this.zip(files);
  }

  private unzip(buffer: Buffer): DocxFile[] {
    const endOffset = this.findEndOfCentralDirectory(buffer);
    const totalEntries = buffer.readUInt16LE(endOffset + 10);
    let offset = buffer.readUInt32LE(endOffset + 16);
    const files: DocxFile[] = [];

    for (let index = 0; index < totalEntries; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) {
        throw new BadRequestException(
          'DOCX invalido: diretorio ZIP corrompido.',
        );
      }

      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const fileName = buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString('utf8');

      offset += 46 + fileNameLength + extraLength + commentLength;
      if (fileName.endsWith('/')) continue;

      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new BadRequestException('DOCX invalido: arquivo ZIP corrompido.');
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      files.push({
        path: fileName,
        content: this.inflateZipEntry(method, compressed),
      });
    }

    return files;
  }

  private findEndOfCentralDirectory(buffer: Buffer) {
    const minimumOffset = Math.max(0, buffer.length - 65_557);

    for (
      let offset = buffer.length - 22;
      offset >= minimumOffset;
      offset -= 1
    ) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }

    throw new BadRequestException('DOCX invalido: fim do ZIP nao encontrado.');
  }

  private inflateZipEntry(method: number, compressed: Buffer) {
    if (method === 0) return compressed;
    if (method === 8) return inflateRawSync(compressed);

    throw new BadRequestException(
      `DOCX usa metodo ZIP nao suportado: ${method}.`,
    );
  }

  private findUnresolvedTemplateMarkers(files: DocxFile[]) {
    const markers = new Set<string>();

    for (const file of files) {
      if (!WORD_TEXT_XML_PATTERN.test(file.path)) continue;
      const matches =
        file.content
          .toString('utf8')
          .match(/{{[#/]?\s*[\w.[\]]+(?:\.[\w.[\]]+)*\s*}}/g) || [];
      for (const match of matches) markers.add(match);
    }

    return [...markers];
  }

  private findUnresolvedLegacyMarkers(files: DocxFile[]) {
    const markers = new Set<string>();

    for (const file of files) {
      if (!WORD_TEXT_XML_PATTERN.test(file.path)) continue;
      const xml = file.content.toString('utf8');
      const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

      for (const paragraph of paragraphs) {
        const text =
          this.extractWordParagraphText(paragraph).toLocaleLowerCase('pt-BR');
        for (const [marker] of this.legacyVariables) {
          if (text.includes(marker.toLocaleLowerCase('pt-BR'))) {
            markers.add(marker);
          }
        }
      }
    }

    return [...markers];
  }

  private zip(files: DocxFile[]) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
      const name = Buffer.from(file.path, 'utf8');
      const crc = this.crc32(file.content);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(this.dosTime(), 10);
      local.writeUInt16LE(this.dosDate(), 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(file.content.length, 18);
      local.writeUInt32LE(file.content.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      localParts.push(local, name, file.content);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(this.dosTime(), 12);
      central.writeUInt16LE(this.dosDate(), 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(file.content.length, 20);
      central.writeUInt32LE(file.content.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      centralParts.push(central, name);

      offset += local.length + name.length + file.content.length;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce(
      (sum, part) => sum + part.length,
      0,
    );
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, end]);
  }

  private crc32(buffer: Buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private readonly crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });

  private dosTime() {
    const now = new Date();
    return (
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      Math.floor(now.getSeconds() / 2)
    );
  }

  private dosDate() {
    const now = new Date();
    return (
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()
    );
  }

  private contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  private rootRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  private documentRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;
  }

  private footerXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pStyle w:val="Muted"/><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="8" w:color="D9E2EC"/></w:pBdr></w:pPr>
    <w:r><w:t>MANITEC Operacao Integrada | Pagina </w:t></w:r>
    <w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>
  </w:p>
</w:ftr>`;
  }

  private appPropertiesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>MANITEC Operacao Integrada</Application>
</Properties>`;
  }

  private corePropertiesXml(title: string) {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${this.escapeXml(title)}</dc:title>
  <dc:creator>MANITEC Operacao Integrada</dc:creator>
  <cp:lastModifiedBy>MANITEC Operacao Integrada</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  }

  private stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:color w:val="172033"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Brand"><w:name w:val="Brand"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="16324F"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="38"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading"><w:name w:val="Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="5" w:color="BFDBFE"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="16324F"/><w:sz w:val="25"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Muted"><w:name w:val="Muted"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="64748B"/><w:sz w:val="17"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="ManitecTable"><w:name w:val="Manitec Table"/><w:tblPr><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  }

  private settingsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="708"/>
  <w:updateFields w:val="true"/>
</w:settings>`;
  }
}
