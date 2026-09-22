import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.status();
  }

  @Get('db')
  @UseGuards(AuthGuard)
  db() {
    return this.healthService.databaseStatus();
  }

  @Get('storage')
  @UseGuards(AuthGuard)
  storage() {
    return this.healthService.storageStatus();
  }
}
