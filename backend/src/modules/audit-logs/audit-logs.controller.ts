import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditDomain } from '@prisma/client';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('audit.read')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  list(
    @Query('domain') domain?: AuditDomain,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogsService.list({
      domain,
      entityType,
      entityId,
      actorUserId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
