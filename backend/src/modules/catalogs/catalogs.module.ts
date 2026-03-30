import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule], // 🔴 ADICIONE ESTA LINHA
  controllers: [CatalogsController],
  providers: [CatalogsService],
})
export class CatalogsModule {}
