import { Injectable } from '@nestjs/common';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import {
  DocumentTemplateKind,
  LoadedInstitutionalDocumentTemplate,
} from './document-template.service';
import {
  InstitutionalDocumentContext,
  InstitutionalDocumentService,
} from './institutional-document.service';
import { DocumentTemplateService } from './document-template.service';

export type GeneratedInstitutionalDocument = {
  buffer: Buffer;
  fileName: string;
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  checksumSha256: string;
  templateKey: string;
  templateVersion: string;
  context: InstitutionalDocumentContext;
  template: LoadedInstitutionalDocumentTemplate;
};

@Injectable()
export class DocumentGenerationService {
  constructor(
    private readonly templates: DocumentTemplateService,
    private readonly institutionalDocuments: InstitutionalDocumentService,
    private readonly docxRenderer: DocxTemplateRendererService,
  ) {}

  generateDocx(
    kind: DocumentTemplateKind,
    payload: Record<string, unknown>,
  ): GeneratedInstitutionalDocument {
    const template = this.templates.loadInstitutional(kind);
    const context = this.institutionalDocuments.buildContext(
      kind,
      payload,
      template.key,
    );
    const documentCode = this.institutionalDocuments.documentCode(
      kind,
      context,
    );
    const rendered = this.docxRenderer.render({
      template,
      context,
      fileName: `${this.safeFileSegment(kind)}-${this.safeFileSegment(
        documentCode,
      )}.docx`,
    });

    return {
      ...rendered,
      context,
      template,
    };
  }

  pdfFromDocxStatus() {
    return {
      available: false,
      reason:
        'Conversao DOCX para PDF por LibreOffice/headless nao esta configurada neste ambiente. O PDF atual do Ciclo 19 permanece como fallback server-side temporario.',
    };
  }

  private safeFileSegment(value: string) {
    return (value || 'documento')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
