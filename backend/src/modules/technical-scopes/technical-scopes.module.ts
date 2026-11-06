import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TechnicalScopesController } from './technical-scopes.controller';
import { TechnicalScopesService } from './technical-scopes.service';
@Module({
  imports: [DatabaseModule],
  controllers: [TechnicalScopesController],
  providers: [TechnicalScopesService],
  exports: [TechnicalScopesService],
})
export class TechnicalScopesModule {}
