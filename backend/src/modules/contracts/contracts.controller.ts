import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContractInvoiceStatus } from '@prisma/client';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Controller('contracts')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('contracts.view')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.create')
  @Post()
  create(@Body() dto: CreateContractDto, @Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.create(dto, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.view')
  @Get()
  findAll(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.findAll(userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.view')
  @Get('invoices/all')
  findAllInvoices(
    @Req() req: Request,
    @Query('status') status?: ContractInvoiceStatus,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.findAllInvoices(status, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('automation/delinquency-sync')
  syncDelinquency() {
    return this.contractsService.syncDelinquencyStatuses();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('orders.create')
  @Post('automation/preventive-run')
  runPreventiveAutomation(@Query('daysAhead') daysAhead?: string) {
    const parsed = daysAhead ? Number(daysAhead) : 45;
    return this.contractsService.runPreventiveAutomation(parsed);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.view')
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.findOne(id, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.update')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.update(id, dto, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.activate')
  @Post(':id/activate')
  activate(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.activate(id, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.update')
  @Post(':id/suspend')
  suspend(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.suspendForDelinquency(id, body?.note, userId);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('orders.create')
  @Post(':id/generate-orders')
  async generateOrders(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('daysAhead') daysAhead?: string,
  ) {
    try {
      const userId = (req['user'] as any)?.sub as string | undefined;
      const parsed = daysAhead ? Number(daysAhead) : 30;
      return await this.contractsService.generateUpcomingPreventiveOrders(
        id,
        parsed,
        userId,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.pay')
  @Patch('invoices/:invoiceId/pay')
  markInvoicePaid(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Body() body: { paidAt?: string },
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.markInvoicePaid(
      invoiceId,
      body?.paidAt,
      userId,
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('contracts.cancel')
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.remove(id, userId);
  }
}
