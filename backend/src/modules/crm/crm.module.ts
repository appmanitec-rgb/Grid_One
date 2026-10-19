import { CommercialScopeGuard } from '../auth/rules/commercial-scope.guard';
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CrmController],
  providers: [CommercialScopeGuard, CrmService],
  exports: [CrmService],
})
export class CrmModule {}
