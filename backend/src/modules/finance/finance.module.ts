import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
