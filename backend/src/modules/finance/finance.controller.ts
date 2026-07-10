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
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { FinanceService } from './finance.service';
import {
  CancelAccountsPayableDto,
  CancelAccountsReceivableDto,
  CreateAccountsPayableDto,
  CreateAccountsReceivableDto,
  CreateBankAccountDto,
  CreateCostCenterDto,
  CreateCostCenterEntryDto,
  PayAccountsPayableDto,
  PayAccountsReceivableDto,
  SyncOrderReceivableDto,
  UpdateBankAccountDto,
  UpdateCostCenterDto,
} from './dto/finance.dto';

type AuthenticatedRequest = Request & { user?: { sub?: string } };

@Controller('finance')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('finance.view')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private getActorUserId(req: Request): string | undefined {
    return (req as AuthenticatedRequest).user?.sub;
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('receivables')
  receivables() {
    return this.financeService.listReceivables();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('receivables')
  createReceivable(
    @Body() dto: CreateAccountsReceivableDto,
    @Req() req: Request,
  ) {
    return this.financeService.createReceivable(dto, this.getActorUserId(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.pay')
  @Patch('receivables/:id/pay')
  payReceivable(
    @Param('id') id: string,
    @Body() dto: PayAccountsReceivableDto,
    @Req() req: Request,
  ) {
    return this.financeService.payReceivable(id, dto, this.getActorUserId(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.cancel')
  @Patch('receivables/:id/cancel')
  cancelReceivable(
    @Param('id') id: string,
    @Body() dto: CancelAccountsReceivableDto,
    @Req() req: Request,
  ) {
    return this.financeService.cancelReceivable(
      id,
      dto.reason,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('receivables/cron/overdue-run')
  runReceivableOverdueCron() {
    return this.financeService.runReceivableOverdueCron();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('receivables/sync/contract-invoices')
  syncContractInvoices() {
    return this.financeService.syncReceivablesFromContractInvoices();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('receivables/sync/orders/:orderId')
  syncOrder(
    @Param('orderId') orderId: string,
    @Body() dto: SyncOrderReceivableDto,
    @Req() req: Request,
  ) {
    return this.financeService.createReceivableFromOrder(
      orderId,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('payables')
  payables() {
    return this.financeService.listPayables();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('payables')
  createPayable(@Body() dto: CreateAccountsPayableDto, @Req() req: Request) {
    return this.financeService.createPayable(dto, this.getActorUserId(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.pay')
  @Patch('payables/:id/pay')
  payPayable(
    @Param('id') id: string,
    @Body() dto: PayAccountsPayableDto,
    @Req() req: Request,
  ) {
    return this.financeService.payPayable(id, dto, this.getActorUserId(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.cancel')
  @Patch('payables/:id/cancel')
  cancelPayable(
    @Param('id') id: string,
    @Body() dto: CancelAccountsPayableDto,
    @Req() req: Request,
  ) {
    return this.financeService.cancelPayable(
      id,
      dto.reason,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('payables/cron/overdue-run')
  runPayableOverdueCron() {
    return this.financeService.runPayableOverdueCron();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-accounts')
  bankAccounts() {
    return this.financeService.listBankAccounts();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('bank-accounts')
  createBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.financeService.createBankAccount(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.update')
  @Patch('bank-accounts/:id')
  updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.financeService.updateBankAccount(id, dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('cash-flow/projection')
  cashFlowProjection(@Query('days') days?: string) {
    return this.financeService.cashFlowProjection(days ? Number(days) : 90);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('cost-centers')
  costCenters() {
    return this.financeService.listCostCenters();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('cost-centers')
  createCostCenter(@Body() dto: CreateCostCenterDto) {
    return this.financeService.createCostCenter(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.update')
  @Patch('cost-centers/:id')
  updateCostCenter(@Param('id') id: string, @Body() dto: UpdateCostCenterDto) {
    return this.financeService.updateCostCenter(id, dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('cost-centers/entries')
  createCostCenterEntry(@Body() dto: CreateCostCenterEntryDto) {
    return this.financeService.createCostCenterEntry(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('cost-centers/:id/dre')
  dre(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeService.dreByCostCenter(id, from, to);
  }
}
