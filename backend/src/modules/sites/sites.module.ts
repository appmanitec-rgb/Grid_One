import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
