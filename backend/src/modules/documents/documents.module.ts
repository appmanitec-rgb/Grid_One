import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { DocumentTemplateService } from './document-template.service';
import { DocumentGenerationService } from './document-generation.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { PdfRenderService } from './pdf-render.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { TemplateRendererService } from './template-renderer.service';

@Module({
  imports: [DatabaseModule, FileStorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentGenerationService,
    DocumentTemplateService,
    DocxTemplateRendererService,
    InstitutionalDocumentService,
    TemplateRendererService,
    PdfRenderService,
    ProposalPdfService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
