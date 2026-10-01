import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { DocumentTemplateService } from './document-template.service';
import { DocumentGenerationService } from './document-generation.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocxToPdfService } from './docx-to-pdf.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { PdfRenderService } from './pdf-render.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { TemplateRendererService } from './template-renderer.service';
import { VisualDocumentModule } from './visual-document.module';

@Module({
  imports: [DatabaseModule, FileStorageModule, VisualDocumentModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentGenerationService,
    DocumentTemplateService,
    DocxToPdfService,
    DocxTemplateRendererService,
    InstitutionalDocumentService,
    TemplateRendererService,
    PdfRenderService,
    ProposalPdfService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
