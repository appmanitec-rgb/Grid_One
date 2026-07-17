import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [DatabaseModule, FileStorageModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
