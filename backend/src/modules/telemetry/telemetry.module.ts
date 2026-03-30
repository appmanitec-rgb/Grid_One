import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
