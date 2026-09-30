import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DowntimeStatus, WarrantyStatus } from '@prisma/client';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  AddOperationAttachmentDto,
  CreateDowntimeDto,
  CreateWarrantyDto,
  ListCasesQueryDto,
  UpdateDowntimeDto,
  UpdateWarrantyDto,
} from './dto/operation-cases.dto';
import { OperationsService } from './operations.service';

type Actor = {
  sub: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: { orders?: { finish?: boolean; cancel?: boolean } };
};

@Controller('operations')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('orders.view')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('options')
  options(@Req() req: Request) {
    return this.operations.options(this.actor(req).sub);
  }

  @Get('downtimes')
  listDowntimes(@Req() req: Request, @Query() query: ListCasesQueryDto) {
    return this.operations.listDowntimes(query, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.create')
  @Post('downtimes')
  createDowntime(@Req() req: Request, @Body() dto: CreateDowntimeDto) {
    return this.operations.createDowntime(dto, this.actor(req).sub);
  }

  @Get('downtimes/:id')
  getDowntime(@Req() req: Request, @Param('id') id: string) {
    return this.operations.getDowntime(id, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Patch('downtimes/:id')
  updateDowntime(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateDowntimeDto,
  ) {
    this.assertClosingPermission(req, dto.status);
    return this.operations.updateDowntime(id, dto, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.create')
  @Post('downtimes/:id/open-order')
  openOrder(@Req() req: Request, @Param('id') id: string) {
    return this.operations.openCorrectiveOrder(id, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Post('downtimes/:id/attachments')
  addDowntimeAttachment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddOperationAttachmentDto,
  ) {
    return this.operations.addAttachment(
      'downtime',
      id,
      dto,
      this.actor(req).sub,
    );
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Delete('downtimes/:id/attachments/:attachmentId')
  removeDowntimeAttachment(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.operations.removeAttachment(
      'downtime',
      id,
      attachmentId,
      this.actor(req).sub,
    );
  }

  @Get('warranties')
  listWarranties(@Req() req: Request, @Query() query: ListCasesQueryDto) {
    return this.operations.listWarranties(query, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.create')
  @Post('warranties')
  createWarranty(@Req() req: Request, @Body() dto: CreateWarrantyDto) {
    return this.operations.createWarranty(dto, this.actor(req).sub);
  }

  @Get('warranties/:id')
  getWarranty(@Req() req: Request, @Param('id') id: string) {
    return this.operations.getWarranty(id, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Patch('warranties/:id')
  updateWarranty(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateWarrantyDto,
  ) {
    this.assertClosingPermission(req, dto.status);
    return this.operations.updateWarranty(id, dto, this.actor(req).sub);
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Post('warranties/:id/attachments')
  addWarrantyAttachment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddOperationAttachmentDto,
  ) {
    return this.operations.addAttachment(
      'warranty',
      id,
      dto,
      this.actor(req).sub,
    );
  }

  @RequireAccessPolicy('orders.view', 'orders.update')
  @Delete('warranties/:id/attachments/:attachmentId')
  removeWarrantyAttachment(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.operations.removeAttachment(
      'warranty',
      id,
      attachmentId,
      this.actor(req).sub,
    );
  }

  private actor(req: Request) {
    return req['user'] as Actor;
  }

  private assertClosingPermission(
    req: Request,
    status?: DowntimeStatus | WarrantyStatus,
  ) {
    const action =
      status === 'CANCELED'
        ? 'cancel'
        : status === DowntimeStatus.RESTORED ||
            status === DowntimeStatus.CLOSED ||
            status === WarrantyStatus.RESOLVED
          ? 'finish'
          : null;
    if (!action) return;
    const actor = this.actor(req);
    if (
      actor.isSystemMaster ||
      actor.role === 'ADMIN' ||
      actor.accessPolicy?.orders?.[action] === true
    )
      return;
    throw new ForbiddenException(
      'Seu perfil nao possui permissao para concluir ou cancelar este caso.',
    );
  }
}
