import { Module } from '@nestjs/common';
import { MaintenanceOrdersService } from './maintenance-orders.service';
import { MaintenanceOrdersController } from './maintenance-orders.controller';

@Module({
  controllers: [MaintenanceOrdersController],
  providers: [MaintenanceOrdersService],
})
export class MaintenanceOrdersModule {}
