import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [DatabaseModule, ApprovalsModule, AuditLogsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class ProposalsModule {}

