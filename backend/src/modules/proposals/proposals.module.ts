import { CommercialScopeGuard } from '../auth/rules/commercial-scope.guard';
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { TechnicalScopesModule } from '../technical-scopes/technical-scopes.module';
import { DatabaseModule } from '../../database/database.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalEditorService } from './proposal-editor.service';
import { ProposalEditorController } from './proposal-editor.controller';

@Module({
  imports: [
    DatabaseModule,
    TechnicalScopesModule,
    ApprovalsModule,
    AuditLogsModule,
    FileStorageModule,
    DocumentsModule,
  ],
  controllers: [ProposalEditorController, ProposalsController],
  providers: [CommercialScopeGuard, ProposalsService, ProposalEditorService],
})
export class ProposalsModule {}
