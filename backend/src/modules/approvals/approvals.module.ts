import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [DatabaseModule, AuthModule, AuditLogsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
