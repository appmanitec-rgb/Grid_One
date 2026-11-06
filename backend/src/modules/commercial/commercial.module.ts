import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
@Module({
  imports: [DatabaseModule],
  controllers: [CommercialController],
  providers: [CommercialService],
})
export class CommercialModule {}
