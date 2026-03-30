import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Controller('automation')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('users.manage')
export class AutomationController {
  constructor(
    private readonly automationSchedulerService: AutomationSchedulerService,
  ) {}

  @Get('status')
  getStatus() {
    return this.automationSchedulerService.getStatus();
  }

  @Get('runs')
  listRuns(@Query('take') take?: string) {
    const parsedTake = take ? Number(take) : 30;
    const normalized = Number.isFinite(parsedTake)
      ? Math.min(Math.max(Math.floor(parsedTake), 1), 100)
      : 30;
    return this.automationSchedulerService.listRuns(normalized);
  }

  @Post('run/full')
  triggerFull(@Req() req: Request) {
    return this.automationSchedulerService.triggerFullAutomation(
      this.extractUserId(req),
    );
  }

  @Post('run/light')
  triggerLight(@Req() req: Request) {
    return this.automationSchedulerService.triggerLightAutomation(
      this.extractUserId(req),
    );
  }

  private extractUserId(req: Request) {
    const authUser = req['user'] as any;
    return authUser?.sub as string | undefined;
  }
}
