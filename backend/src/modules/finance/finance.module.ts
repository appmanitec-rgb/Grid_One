import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BankCollectionController } from './bank-collection.controller';
import { BankCollectionService } from './bank-collection.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [FinanceController, BankCollectionController],
  providers: [FinanceService, BankCollectionService],
  exports: [FinanceService],
})
export class FinanceModule {}
