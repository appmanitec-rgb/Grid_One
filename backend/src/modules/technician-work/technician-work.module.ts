import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TechnicianWorkController } from './technician-work.controller';
import { TechnicianWorkService } from './technician-work.service';

@Module({
  imports: [AuditLogsModule, TicketsModule],
  controllers: [TechnicianWorkController],
  providers: [TechnicianWorkService],
  exports: [TechnicianWorkService],
})
export class TechnicianWorkModule {}
