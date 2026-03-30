import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('pending')
  listPending(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string;
    return this.approvalsService.listPending(userId);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: DecideApprovalDto,
  ) {
    const userId = (req['user'] as any)?.sub as string;
    return this.approvalsService.approve(id, userId, dto.decisionNote);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: DecideApprovalDto,
  ) {
    const userId = (req['user'] as any)?.sub as string;
    return this.approvalsService.reject(id, userId, dto.decisionNote);
  }
}
