import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContractsModule } from '../contracts/contracts.module';
import { FinanceModule } from '../finance/finance.module';
import { AutomationController } from './automation.controller';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AutomationService } from './automation.service';

@Module({
  imports: [DatabaseModule, ContractsModule, FinanceModule],
  controllers: [AutomationController],
  providers: [AutomationSchedulerService, AutomationService],
  exports: [AutomationSchedulerService],
})
export class AutomationModule {}
