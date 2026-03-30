import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTelemetryEventDto } from './dto/create-telemetry-event.dto';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.orders')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('overview')
  overview() {
    return this.telemetryService.getOverview();
  }

  @Post('events')
  ingest(@Body() dto: CreateTelemetryEventDto) {
    return this.telemetryService.ingestEvent(dto);
  }
}
