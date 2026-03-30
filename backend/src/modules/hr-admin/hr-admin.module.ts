import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { HrAdminController } from './hr-admin.controller';
import { HrAdminService } from './hr-admin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [HrAdminController],
  providers: [HrAdminService],
  exports: [HrAdminService],
})
export class HrAdminModule {}
