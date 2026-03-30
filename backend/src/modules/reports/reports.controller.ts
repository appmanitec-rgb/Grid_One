import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  overview(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.reportsService.overview(dateFrom, dateTo);
  }
}
