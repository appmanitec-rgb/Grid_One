import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DocumentTemplateService } from './document-template.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { VisualDocumentController } from './visual-document.controller';
import { VisualDocumentService } from './visual-document.service';

@Module({
  imports: [DatabaseModule],
  controllers: [VisualDocumentController],
  providers: [
    VisualDocumentService,
    DocumentTemplateService,
    InstitutionalDocumentService,
  ],
  exports: [VisualDocumentService],
})
export class VisualDocumentModule {}
