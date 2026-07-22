import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
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

@Injectable()
export class DocxTemplateRendererService {
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
    const buffer = this.buildDocxArchive({
      documentXml,
      title: this.renderText(input.template.definition.title, input.context),
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
    parts.push(this.paragraph('MANITEC Operacao Integrada', 'Brand'));
    parts.push(
      this.paragraph(this.renderText(definition.title, context), 'Title'),
    );
    if (definition.subtitle) {
      parts.push(this.paragraph(this.renderText(definition.subtitle, context)));
    }

    for (const section of definition.sections) {
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${parts.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
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
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
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
    return `<w:tr>${values
      .map((value) => `<w:tc><w:p>${this.run(value, bold)}</w:p></w:tc>`)
      .join('')}</w:tr>`;
  }

  private paragraph(
    value: string,
    style?: 'Brand' | 'Title' | 'Heading' | 'Muted',
  ) {
    const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
    return `<w:p>${styleXml}${this.renderTextRuns(value)}</w:p>`;
  }

  private renderTextRuns(value: string) {
    const lines = value.split(/\r?\n/);
    return lines
      .map((line, index) => `${index > 0 ? '<w:br/>' : ''}${this.run(line)}`)
      .join('');
  }

  private run(value: string, bold = false) {
    const runProps = bold ? '<w:rPr><w:b/></w:rPr>' : '';
    return `<w:r>${runProps}<w:t xml:space="preserve">${this.escapeXml(value)}</w:t></w:r>`;
  }

  private renderText(template: string, context: RenderContext) {
    return this.renderVariables(this.renderLoops(template, context), context);
  }

  private renderLoops(template: string, context: RenderContext) {
    return template.replace(
      /{{#\s*([\w.]+)\s*}}([\s\S]*?){{\/\s*\1\s*}}/g,
      (_match, path: string, block: string) => {
        const value = this.resolvePath(path, context);
        if (!Array.isArray(value)) return '';
        return value
          .map((item) =>
            this.renderVariables(block, {
              ...context,
              ...(item && typeof item === 'object'
                ? (item as Record<string, unknown>)
                : { this: item }),
            }),
          )
          .join('');
      },
    );
  }

  private renderVariables(template: string, context: RenderContext) {
    return template.replace(
      /{{\s*([\w.[\]]+(?:\.[\w.[\]]+)*)\s*}}/g,
      (_match, path: string) => this.stringify(this.resolvePath(path, context)),
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
    ];

    return this.zip(files);
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
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Brand"><w:name w:val="Brand"/><w:rPr><w:b/><w:color w:val="16324F"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="34"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading"><w:name w:val="Heading"/><w:rPr><w:b/><w:color w:val="16324F"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Muted"><w:name w:val="Muted"/><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;
  }

  private settingsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="708"/>
</w:settings>`;
  }
}
