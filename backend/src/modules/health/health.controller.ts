import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.status();
  }

  @Get('db')
  db() {
    return this.healthService.databaseStatus();
  }

  @Get('storage')
  storage() {
    return this.healthService.storageStatus();
  }
}
