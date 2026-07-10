import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('inbox')
  getInbox(@Req() req: Request, @Query('limit') limit?: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const parsedLimit = limit ? Number(limit) : undefined;

    return this.notificationsService.getInbox(
      userId || '',
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }
}
