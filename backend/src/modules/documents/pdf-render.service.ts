import { Injectable } from '@nestjs/common';
import { SimplePdfDocument } from '../service-reports/service-report-pdf.service';

export type PdfRenderInput = {
  title: string;
  html: string;
  templateKey: string;
  metadata: Array<[string, string]>;
};

@Injectable()
export class PdfRenderService {
  renderA4(input: PdfRenderInput) {
    const doc = new SimplePdfDocument();
    doc.title(input.title);
    doc.text('MANITEC Operacao Integrada', {
      size: 16,
      bold: true,
      yGapAfter: 4,
    });
    doc.text(input.title, { size: 18, bold: true, yGapAfter: 8 });
    doc.keyValues([
      ...input.metadata,
      ['Template', input.templateKey],
      ['Formato', 'A4'],
    ]);

    for (const line of this.htmlToLines(input.html)) {
      if (line.startsWith('# ')) {
        doc.sectionTitle(line.slice(2));
      } else if (line.startsWith('## ')) {
        doc.sectionTitle(line.slice(3));
      } else {
        doc.text(line);
      }
    }

    return doc.finish();
  }

  private htmlToLines(html: string) {
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const normalized = withoutScripts
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n## $1\n')
      .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_match, row: string) => {
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
          .map((cell) => this.stripTags(cell[1]).trim())
          .filter(Boolean);
        return cells.length ? `\n${cells.join(' | ')}\n` : '\n';
      })
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|main|li|footer|dt|dd)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

    return this.unescapeHtml(this.stripTags(normalized))
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  private stripTags(value: string) {
    return value.replace(/<[^>]+>/g, ' ');
  }

  private unescapeHtml(value: string) {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}
