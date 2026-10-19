import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('reports.view')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  overview(
    @Req() req: { user: { sub: string } },
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportsService.overview(dateFrom, dateTo, req.user.sub);
  }
}
