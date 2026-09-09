import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommercialSizingController } from './commercial-sizing.controller';
import { CommercialSizingService } from './commercial-sizing.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommercialSizingController],
  providers: [CommercialSizingService],
  exports: [CommercialSizingService],
})
export class CommercialSizingModule {}
