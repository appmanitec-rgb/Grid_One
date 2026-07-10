import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [DatabaseModule, DocumentsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
