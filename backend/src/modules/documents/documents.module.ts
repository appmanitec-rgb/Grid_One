import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { DocumentTemplateService } from './document-template.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfRenderService } from './pdf-render.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { TemplateRendererService } from './template-renderer.service';

@Module({
  imports: [DatabaseModule, FileStorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentTemplateService,
    TemplateRendererService,
    PdfRenderService,
    ProposalPdfService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
