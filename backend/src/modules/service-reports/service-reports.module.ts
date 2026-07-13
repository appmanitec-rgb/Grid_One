import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { ServiceReportsController } from './service-reports.controller';
import { ServiceReportsPublicController } from './service-reports-public.controller';
import { ServiceReportsService } from './service-reports.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule, FileStorageModule],
  controllers: [ServiceReportsController, ServiceReportsPublicController],
  providers: [ServiceReportsService],
  exports: [ServiceReportsService],
})
export class ServiceReportsModule {}
