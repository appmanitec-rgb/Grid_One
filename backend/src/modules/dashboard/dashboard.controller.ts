import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { DashboardService } from './dashboard.service';
import { ProductValidityDto } from './product-validity.dto';
type DashboardRequest = Request & {
  user: Parameters<DashboardService['overview']>[0];
};
@Controller('dashboard')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get('overview') overview(@Req() req: DashboardRequest) {
    return this.service.overview(req.user);
  }
  @Get('product-options') options(
    @Query('q') q: string = '',
    @Req() req: DashboardRequest,
  ) {
    return this.service.productOptions(q, req.user);
  }
  @Patch('materials/:id/separate') separate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: DashboardRequest,
  ) {
    return this.service.separate(id, req.user);
  }
  @Post('product-validities') validity(
    @Body() dto: ProductValidityDto,
    @Req() req: DashboardRequest,
  ) {
    return this.service.saveValidity(dto, req.user);
  }
  @Patch('product-validities/:id/close') close(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: DashboardRequest,
  ) {
    return this.service.closeValidity(id, req.user);
  }
}
