import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { HrAdminController } from './hr-admin.controller';
import { HrAdminService } from './hr-admin.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [HrAdminController],
  providers: [HrAdminService],
  exports: [HrAdminService],
})
export class HrAdminModule {}
