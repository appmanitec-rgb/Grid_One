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
import { CreateDocumentDeliveryDto } from './dto/create-document-delivery.dto';
import { CreateDocumentEmailDeliveryDto } from './dto/create-document-email-delivery.dto';
import { DeliveriesService } from './deliveries.service';

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string;
  };
};

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @UseGuards(AuthGuard, AccessPolicyGuard)
  @RequireAccessPolicy('pages.dashboard')
  @Post()
  createDelivery(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDocumentDeliveryDto,
  ) {
    return this.deliveriesService.createDelivery(
      dto,
      this.readActorUserId(req),
    );
  }

  @UseGuards(AuthGuard, AccessPolicyGuard)
  @RequireAccessPolicy('pages.dashboard')
  @Post('email')
  createEmailDelivery(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDocumentEmailDeliveryDto,
  ) {
    return this.deliveriesService.createEmailDelivery(
      dto,
      this.readActorUserId(req),
    );
  }

  @UseGuards(AuthGuard, AccessPolicyGuard)
  @RequireAccessPolicy('pages.dashboard')
  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.deliveriesService.getPreferences(this.readActorUserId(req));
  }

  @UseGuards(AuthGuard, AccessPolicyGuard)
  @RequireAccessPolicy('pages.dashboard')
  @Get('history')
  getHistory(@Req() req: AuthenticatedRequest) {
    return this.deliveriesService.getHistory(this.readActorUserId(req));
  }

  @UseGuards(AuthGuard, AccessPolicyGuard)
  @RequireAccessPolicy('pages.dashboard')
  @Post(':id/retry')
  retryDelivery(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.deliveriesService.retryDelivery(id, this.readActorUserId(req));
  }

  @Get('share/:token')
  getSharedDocument(@Param('token') token: string) {
    return this.deliveriesService.getSharedDocument(token);
  }

  private readActorUserId(req: AuthenticatedRequest) {
    return req.user?.sub || '';
  }
}
