import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { OperationalCostsService } from './operational-costs.service';

@Controller('operational-costs')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('finance.view')
export class OperationalCostsController {
  constructor(private readonly service: OperationalCostsService) {}

  @Get('overview')
  overview(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.service.overview({ from, to, status, clientId, contractId });
  }
}
