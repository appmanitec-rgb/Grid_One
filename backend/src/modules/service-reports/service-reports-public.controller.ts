import { Controller, Get, Param } from '@nestjs/common';
import { ServiceReportsService } from './service-reports.service';

@Controller('public/service-reports')
export class ServiceReportsPublicController {
  constructor(private readonly serviceReportsService: ServiceReportsService) {}

  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.serviceReportsService.verifyPublicReport(token);
  }

  @Get('share/:token')
  share(@Param('token') token: string) {
    return this.serviceReportsService.getPublicSharedReport(token);
  }
}
