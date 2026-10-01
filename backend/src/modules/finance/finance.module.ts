import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BankCollectionController } from './bank-collection.controller';
import { BankCollectionService } from './bank-collection.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [
    FinanceController,
    BankCollectionController,
    FiscalDocumentsController,
  ],
  providers: [FinanceService, BankCollectionService, FiscalDocumentsService],
  exports: [FinanceService],
})
export class FinanceModule {}
