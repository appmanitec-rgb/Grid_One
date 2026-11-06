import { ProcurementService } from './procurement.service';
import { ProcurementController } from './procurement.controller';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule, FileStorageModule],
  controllers: [PurchaseOrdersController, ProcurementController],
  providers: [PurchaseOrdersService, ProcurementService],
  exports: [PurchaseOrdersService, ProcurementService],
})
export class PurchaseOrdersModule {}
