import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { TechnicalScopesService } from './technical-scopes.service';
import {
  UpsertTechnicalFamilyDto,
  UpsertTechnicalProcedureDto,
  UpsertCatalogTechnicalProfileDto,
} from './technical-scope.dto';
function actorId(req: Request): string {
  return (req['user'] as { sub: string }).sub;
}
@Controller('catalogs/technical-scope')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('catalog.view')
export class TechnicalScopesController {
  constructor(private readonly service: TechnicalScopesService) {}
  @Get('library') library(@Req() req: Request) {
    return this.service.library(actorId(req));
  }
  @Post('seed') @RequireAccessPolicy('catalog.update') seed(
    @Req() req: Request,
  ) {
    return this.service.seed(actorId(req));
  }
  @Put('families/:code') @RequireAccessPolicy('catalog.update') family(
    @Param('code') code: string,
    @Body() dto: UpsertTechnicalFamilyDto,
    @Req() req: Request,
  ) {
    return this.service.upsertFamily(code, dto, actorId(req));
  }
  @Put('procedures/:code') @RequireAccessPolicy('catalog.update') procedure(
    @Param('code') code: string,
    @Body() dto: UpsertTechnicalProcedureDto,
    @Req() req: Request,
  ) {
    return this.service.upsertProcedure(code, dto, actorId(req));
  }
  @Put('profiles/:catalogItemId')
  @RequireAccessPolicy('catalog.update')
  profile(
    @Param('catalogItemId', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCatalogTechnicalProfileDto,
    @Req() req: Request,
  ) {
    return this.service.upsertProfile(id, dto, actorId(req));
  }
}
