import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { VisualDocumentKind } from '@prisma/client';
import { DocxToPdfService } from './docx-to-pdf.service';
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
import { VisualDocumentService } from './visual-document.service';

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

export type GeneratedInstitutionalPdf = {
  buffer: Buffer;
  fileName: string;
  mimeType: 'application/pdf';
  checksumSha256: string;
  templateKey: string;
  templateVersion: string;
  sourceDocxChecksumSha256: string;
  context: InstitutionalDocumentContext;
  template: LoadedInstitutionalDocumentTemplate;
};

@Injectable()
export class DocumentGenerationService {
  constructor(
    private readonly templates: DocumentTemplateService,
    private readonly institutionalDocuments: InstitutionalDocumentService,
    private readonly docxRenderer: DocxTemplateRendererService,
    private readonly docxToPdf: DocxToPdfService,
    @Optional() private readonly visualDocuments?: VisualDocumentService,
  ) {}

  async generateDocx(
    kind: DocumentTemplateKind,
    payload: Record<string, unknown>,
  ): Promise<GeneratedInstitutionalDocument> {
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
    const visualKind =
      kind === 'proposal'
        ? VisualDocumentKind.PROPOSAL
        : kind === 'contract'
          ? VisualDocumentKind.CONTRACT
          : kind === 'service-report'
            ? VisualDocumentKind.SERVICE_REPORT
            : null;
    const visual = visualKind
      ? await this.visualDocuments?.renderPublished(visualKind, payload)
      : null;
    if (visual) {
      const rendered = this.docxRenderer.renderVisual({
        title: visual.name,
        blocks: visual.blocks,
        templateKey: visual.templateKey,
        templateVersion: visual.templateVersion,
        fileName: `${this.safeFileSegment(kind)}-${this.safeFileSegment(documentCode)}.docx`,
      });
      return { ...rendered, context, template };
    }
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
    return this.docxToPdf.status();
  }

  async generatePdfFromDocx(
    kind: DocumentTemplateKind,
    payload: Record<string, unknown>,
  ): Promise<GeneratedInstitutionalPdf> {
    const docx = await this.generateDocx(kind, payload);
    const pdfBuffer = await this.docxToPdf.convertDocxToPdf({
      buffer: docx.buffer,
      fileName: docx.fileName,
    });

    return {
      buffer: pdfBuffer,
      fileName: docx.fileName.replace(/\.docx$/i, '.pdf'),
      mimeType: 'application/pdf',
      checksumSha256: createHash('sha256').update(pdfBuffer).digest('hex'),
      templateKey: docx.templateKey,
      templateVersion: docx.templateVersion,
      sourceDocxChecksumSha256: docx.checksumSha256,
      context: docx.context,
      template: docx.template,
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
