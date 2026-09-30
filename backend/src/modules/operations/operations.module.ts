import { Module } from '@nestjs/common';
import { MaintenanceOrdersModule } from '../maintenance-orders/maintenance-orders.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [MaintenanceOrdersModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
