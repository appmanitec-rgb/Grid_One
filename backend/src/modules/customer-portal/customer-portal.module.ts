import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ServiceReportsModule } from '../service-reports/service-reports.module';
import { TicketsModule } from '../tickets/tickets.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({
  imports: [
    DatabaseModule,
    AuditLogsModule,
    TicketsModule,
    ServiceReportsModule,
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
