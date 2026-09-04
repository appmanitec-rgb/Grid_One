import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { StudioController } from './studio.controller';
import { StudioImportService } from './studio-import.service';
import { StudioService } from './studio.service';
import { StudioUtilizationService } from './studio-utilization.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [StudioController],
  providers: [StudioService, StudioImportService, StudioUtilizationService],
})
export class StudioModule {}
