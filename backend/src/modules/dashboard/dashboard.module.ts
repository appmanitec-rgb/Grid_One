import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
@Module({
  imports: [AuditLogsModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
