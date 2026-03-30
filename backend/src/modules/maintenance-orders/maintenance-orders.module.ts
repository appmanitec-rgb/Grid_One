import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MaintenanceOrdersService } from './maintenance-orders.service';
import { MaintenanceOrdersController } from './maintenance-orders.controller';

@Module({
  imports: [ApprovalsModule, AuditLogsModule],
  controllers: [MaintenanceOrdersController],
  providers: [MaintenanceOrdersService],
})
export class MaintenanceOrdersModule {}
