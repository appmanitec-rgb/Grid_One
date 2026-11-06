import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockLocationsController } from './stock-locations.controller';
import { StockLocationsService } from './stock-locations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InventoryController, StockLocationsController],
  providers: [InventoryService, StockLocationsService],
  exports: [InventoryService],
})
export class InventoryModule {}
