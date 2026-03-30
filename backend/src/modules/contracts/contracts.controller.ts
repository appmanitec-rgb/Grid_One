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
@RequireAccessPolicy('pages.contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@Body() dto: CreateContractDto, @Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.contractsService.create(dto, userId);
  }

  @UseGuards(AuthGuard)
  @Get()
  findAll() {
    return this.contractsService.findAll();
  }

  @UseGuards(AuthGuard)
  @Get('invoices/all')
  findAllInvoices(@Query('status') status?: ContractInvoiceStatus) {
    return this.contractsService.findAllInvoices(status);
  }

  @UseGuards(AuthGuard)
  @Post('automation/delinquency-sync')
  syncDelinquency() {
    return this.contractsService.syncDelinquencyStatuses();
  }

  @UseGuards(AuthGuard)
  @Post('automation/preventive-run')
  runPreventiveAutomation(@Query('daysAhead') daysAhead?: string) {
    const parsed = daysAhead ? Number(daysAhead) : 45;
    return this.contractsService.runPreventiveAutomation(parsed);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @UseGuards(AuthGuard)
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.contractsService.activate(id);
  }

  @UseGuards(AuthGuard)
  @Post(':id/suspend')
  suspend(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.contractsService.suspendForDelinquency(id, body?.note);
  }

  @UseGuards(AuthGuard)
  @Post(':id/generate-orders')
  async generateOrders(
    @Param('id') id: string,
    @Query('daysAhead') daysAhead?: string,
  ) {
    try {
      const parsed = daysAhead ? Number(daysAhead) : 30;
      return await this.contractsService.generateUpcomingPreventiveOrders(
        id,
        parsed,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(AuthGuard)
  @Patch('invoices/:invoiceId/pay')
  markInvoicePaid(
    @Param('invoiceId') invoiceId: string,
    @Body() body: { paidAt?: string },
  ) {
    return this.contractsService.markInvoicePaid(invoiceId, body?.paidAt);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
