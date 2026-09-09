import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { CommercialSizingService } from './commercial-sizing.service';
import { RecommendCommercialGeneratorDto } from './dto/commercial-sizing.dto';

@Controller('commercial-sizing')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('proposals.create')
export class CommercialSizingController {
  constructor(
    private readonly commercialSizingService: CommercialSizingService,
  ) {}

  @Post('recommendations')
  recommend(@Body() dto: RecommendCommercialGeneratorDto) {
    return this.commercialSizingService.recommend(dto);
  }

  @Get('catalog')
  catalog(@Query('q') query?: string) {
    return this.commercialSizingService.listCommercialCatalog(query);
  }
}
