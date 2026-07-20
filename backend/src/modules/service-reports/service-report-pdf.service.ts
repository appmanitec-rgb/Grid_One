import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as QRCode from 'qrcode';

export type PdfTemplateSection = {
  key: string;
  label?: string;
  enabled?: boolean;
  order?: number;
};

export type ServiceReportPdfEvidence = {
  title?: string | null;
  type?: string | null;
  description?: string | null;
  fileName?: string | null;
  checksumSha256?: string | null;
  customerVisible?: boolean | null;
};

export type ServiceReportPdfChecklistItem = {
  label?: string | null;
  result?: string | null;
  notes?: string | null;
};

export type ServiceReportPdfInput = {
  code: string;
  title: string;
  clientName: string;
  orderTitle: string;
  generatorName: string;
  generatorSerial?: string | null;
  siteName?: string | null;
  technicianName?: string | null;
  diagnosis?: string | null;
  performedServices?: string | null;
  recommendations?: string | null;
  customerNotes?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  signedAt?: Date | string | null;
  signedByName?: string | null;
  signedByDocument?: string | null;
  releasedToCustomerAt?: Date | string | null;
  versionNumber: number;
  documentHash: string;
  validationUrl?: string | null;
  sections: PdfTemplateSection[];
  checklistItems: ServiceReportPdfChecklistItem[];
  evidences: ServiceReportPdfEvidence[];
};

type PdfPage = {
  commands: string[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const LINE_HEIGHT = 14;
const BODY_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 18;
const SECTION_FONT_SIZE = 12;

@Injectable()
export class ServiceReportPdfService {
  generate(input: ServiceReportPdfInput): Buffer {
    const doc = new SimplePdfDocument();
    doc.title(`MANITEC - Laudo ${input.code}`);

    doc.text('MANITEC Operacao Integrada', {
      size: 16,
      bold: true,
      yGapAfter: 4,
    });
    doc.text(`Laudo Tecnico ${input.code}`, {
      size: TITLE_FONT_SIZE,
      bold: true,
      yGapAfter: 4,
    });
    doc.text(input.title, { size: 11, color: 'muted', yGapAfter: 12 });

    const validationText = input.validationUrl
      ? `Validacao: ${input.validationUrl}`
      : 'Validacao: pendente';
    doc.keyValues([
      ['Cliente', input.clientName],
      ['OS', input.orderTitle],
      ['Equipamento', this.join([input.generatorName, input.generatorSerial])],
      ['Local', input.siteName || '-'],
      ['Tecnico', input.technicianName || '-'],
      [
        'Inicio/Fim',
        `${this.formatDate(input.startedAt)} / ${this.formatDate(input.finishedAt)}`,
      ],
      ['Versao', String(input.versionNumber)],
      ['Hash', input.documentHash.slice(0, 24)],
      ['Liberado em', this.formatDate(input.releasedToCustomerAt)],
    ]);

    if (input.validationUrl) {
      doc.qrCode(input.validationUrl, PAGE_WIDTH - MARGIN_X - 116, 656, 104);
    }
    doc.text(validationText, { size: 8, color: 'muted', yGapAfter: 10 });

    for (const section of this.enabledSections(input.sections)) {
      if (section.key === 'identification') continue;
      if (section.key === 'diagnosis') {
        doc.section(section.label || 'Diagnostico', input.diagnosis || '-');
      }
      if (section.key === 'performedServices') {
        doc.section(
          section.label || 'Servicos realizados',
          input.performedServices || '-',
        );
      }
      if (section.key === 'recommendations') {
        doc.section(
          section.label || 'Recomendacoes',
          input.recommendations || '-',
        );
      }
      if (section.key === 'customerNotes') {
        doc.section(
          section.label || 'Observacoes ao cliente',
          input.customerNotes || '-',
        );
      }
      if (section.key === 'checklist') {
        doc.sectionTitle(section.label || 'Checklist');
        if (input.checklistItems.length === 0) {
          doc.text('Nenhum item de checklist registrado.');
        } else {
          input.checklistItems.forEach((item) => {
            doc.text(
              `${item.label || '-'} | ${item.result || '-'} | ${item.notes || '-'}`,
            );
          });
        }
        doc.gap(8);
      }
      if (section.key === 'evidences') {
        doc.sectionTitle(section.label || 'Evidencias liberadas');
        const visible = input.evidences.filter(
          (evidence) => evidence.customerVisible,
        );
        if (visible.length === 0) {
          doc.text('Nenhuma evidencia liberada ao cliente.');
        } else {
          visible.forEach((evidence) => {
            const checksum = evidence.checksumSha256
              ? ` | SHA-256 ${evidence.checksumSha256.slice(0, 16)}`
              : '';
            doc.text(
              `${evidence.title || 'Evidencia'} | ${evidence.type || '-'} | ${evidence.fileName || '-'}${checksum}`,
            );
            if (evidence.description)
              doc.text(evidence.description, { color: 'muted' });
          });
        }
        doc.gap(8);
      }
      if (section.key === 'signature') {
        doc.sectionTitle(section.label || 'Assinatura');
        doc.keyValues([
          ['Responsavel', input.signedByName || '-'],
          ['Documento', input.signedByDocument || '-'],
          ['Assinado em', this.formatDate(input.signedAt)],
        ]);
      }
      if (section.key === 'validation') {
        doc.sectionTitle(section.label || 'Autenticidade');
        doc.text(`Hash SHA-256: ${input.documentHash}`);
        doc.text(validationText);
      }
    }

    return doc.finish();
  }

  private enabledSections(sections: PdfTemplateSection[]) {
    return [...sections]
      .filter((section) => section.enabled !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private join(values: Array<string | null | undefined>) {
    return values.filter(Boolean).join(' / ') || '-';
  }
}

export class SimplePdfDocument {
  private readonly pages: PdfPage[] = [{ commands: [] }];
  private y = PAGE_HEIGHT - MARGIN_TOP;
  private titleText = 'MANITEC';

  title(value: string) {
    this.titleText = value;
  }

  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: 'normal' | 'muted';
      yGapAfter?: number;
    } = {},
  ) {
    const size = options.size ?? BODY_FONT_SIZE;
    const lineHeight = Math.max(LINE_HEIGHT, size + 4);
    const lines = this.wrap(value, size, PAGE_WIDTH - MARGIN_X * 2);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.current.commands.push(
        `${options.color === 'muted' ? '0.38 0.45 0.55 rg' : '0.06 0.09 0.16 rg'}`,
        `BT /${options.bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN_X} ${this.y.toFixed(2)} Td (${this.escapePdf(line)}) Tj ET`,
      );
      this.y -= lineHeight;
    }
    this.y -= options.yGapAfter ?? 2;
  }

  sectionTitle(title: string) {
    this.ensureSpace(28);
    this.current.commands.push(
      '0.90 0.94 0.98 rg',
      `${MARGIN_X - 4} ${(this.y - 15).toFixed(2)} ${PAGE_WIDTH - MARGIN_X * 2 + 8} 23 re f`,
    );
    this.text(title, { size: SECTION_FONT_SIZE, bold: true, yGapAfter: 8 });
  }

  section(title: string, body: string) {
    this.sectionTitle(title);
    this.text(body || '-');
    this.gap(8);
  }

  keyValues(rows: Array<[string, string]>) {
    for (const [label, value] of rows) {
      this.text(`${label}: ${value || '-'}`, { size: 9 });
    }
    this.gap(6);
  }

  gap(size: number) {
    this.y -= size;
  }

  qrCode(value: string, x: number, y: number, size: number) {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const moduleSize = size / qr.modules.size;
    this.current.commands.push('0.06 0.09 0.16 rg');
    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let col = 0; col < qr.modules.size; col += 1) {
        if (!qr.modules.get(row, col)) continue;
        const px = x + col * moduleSize;
        const py = y + (qr.modules.size - row - 1) * moduleSize;
        this.current.commands.push(
          `${px.toFixed(2)} ${py.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re f`,
        );
      }
    }
    this.current.commands.push(
      '0.82 0.88 0.95 RG',
      `${x.toFixed(2)} ${y.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)} re S`,
    );
  }

  finish(): Buffer {
    const objects: string[] = [];
    const addObject = (body: string) => {
      objects.push(body);
      return objects.length;
    };
    const catalogId = addObject('placeholder');
    const pagesId = addObject('placeholder');
    const regularFontId = addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    );
    const boldFontId = addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    );
    const pageRefs: number[] = [];

    for (const page of this.pages) {
      const content = page.commands.join('\n');
      const contentId = addObject(
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      );
      const pageId = addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      pageRefs.push(pageId);
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
    const infoId = addObject(
      `<< /Title (${this.escapePdf(this.titleText)}) /Producer (MANITEC Operacao Integrada) /CreationDate (D:${this.pdfDate()}) >>`,
    );

    const header = '%PDF-1.4\n';
    const chunks = [header];
    const offsets = [0];
    let offset = Buffer.byteLength(header, 'latin1');
    objects.forEach((object, index) => {
      offsets.push(offset);
      const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
      chunks.push(chunk);
      offset += Buffer.byteLength(chunk, 'latin1');
    });
    const xrefOffset = offset;
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    for (let index = 1; index < offsets.length; index += 1) {
      chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
    }
    chunks.push(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${this.idHash()}> <${this.idHash()}>] >>\nstartxref\n${xrefOffset}\n%%EOF`,
    );
    return Buffer.from(chunks.join(''), 'latin1');
  }

  private get current() {
    return this.pages[this.pages.length - 1];
  }

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN_BOTTOM) return;
    this.pages.push({ commands: [] });
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  private wrap(value: string, size: number, width: number) {
    const sanitized = this.toPdfText(value);
    const maxChars = Math.max(24, Math.floor(width / (size * 0.5)));
    const lines: string[] = [];
    for (const paragraph of sanitized.split(/\r?\n/)) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars) {
          if (current) lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      lines.push(current || ' ');
    }
    return lines;
  }

  private toPdfText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code <= 126)
        );
      })
      .join('');
  }

  private escapePdf(value: string) {
    return this.toPdfText(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private pdfDate() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  }

  private idHash() {
    return createHash('md5')
      .update(`${this.titleText}-${Date.now()}`)
      .digest('hex');
  }
}
