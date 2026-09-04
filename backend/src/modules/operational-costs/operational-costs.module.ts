import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OperationalCostsController } from './operational-costs.controller';
import { OperationalCostsService } from './operational-costs.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OperationalCostsController],
  providers: [OperationalCostsService],
})
export class OperationalCostsModule {}
