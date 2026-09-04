import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditDomain } from '@prisma/client';
import { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StudioImportService } from './studio-import.service';
import { StudioService } from './studio.service';
import { StudioHeartbeatDto } from './dto/studio-heartbeat.dto';
import { StudioUtilizationService } from './studio-utilization.service';

type AuthRequest = Request & {
  user?: {
    sub?: string;
    role?: string;
    isSystemMaster?: boolean;
    accessPolicy?: Record<string, any>;
  };
};

@Controller('studio')
@UseGuards(AuthGuard, AccessPolicyGuard)
export class StudioController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly studioService: StudioService,
    private readonly studioImportService: StudioImportService,
    private readonly studioUtilizationService: StudioUtilizationService,
  ) {}

  @Post('utilization/heartbeat')
  heartbeat(
    @Body() body: StudioHeartbeatDto,
    @Req() req: AuthRequest,
  ) {
    return this.studioUtilizationService.heartbeat(req.user ?? {}, body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('utilization')
  @RequireAccessPolicy('studio.access', 'studio.auditView')
  utilization(@Query('days') days?: string) {
    return this.studioUtilizationService.overview(days ? Number(days) : undefined);
  }

  @Get('history')
  @RequireAccessPolicy('studio.access', 'studio.auditView')
  history(
    @Query('domain') domain?: AuditDomain,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogsService.list({
      domain,
      entityType,
      entityId,
      limit: limit ? Number(limit) : 200,
    });
  }

  @Patch('data/:resource/:id')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  updateRecord(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return this.studioService.updateRecord(resource, id, body, req.user ?? {});
  }

  @Post('imports/preview')
  @RequireAccessPolicy('studio.access', 'studio.dataImport')
  previewImport(@Body() body: any, @Req() req: AuthRequest) {
    return this.studioImportService.preview(body, req.user ?? {});
  }

  @Post('imports/:id/execute')
  @RequireAccessPolicy('studio.access', 'studio.dataImport')
  executeImport(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.studioImportService.execute(id, req.user ?? {});
  }

  @Get('imports')
  @RequireAccessPolicy('studio.access', 'studio.auditView')
  listImports() {
    return this.studioImportService.findAll();
  }

  @Get('control-options/:type')
  listControlOptions(@Param('type') type: string) {
    return this.studioService.listControlOptions(type);
  }

  @Post('data/:resource')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  createRecord(
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return this.studioService.createRecord(resource, body, req.user ?? {});
  }

  @Get('imports/:id')
  @RequireAccessPolicy('studio.access', 'studio.auditView')
  findImport(@Param('id') id: string) {
    return this.studioImportService.findOne(id);
  }
}
