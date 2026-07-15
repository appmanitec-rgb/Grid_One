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
  AutoMatchBankStatementDto,
  BankMovementQueryDto,
  CancelAccountsPayableDto,
  CancelAccountsReceivableDto,
  CloseFinancialPeriodDto,
  CreateAccountsPayableDto,
  CreateAccountsReceivableDto,
  CreateBankAdjustmentDto,
  CreateBankAccountDto,
  CreateCostCenterDto,
  CreateCostCenterEntryDto,
  CreateReconciliationIssueDto,
  IgnoreBankStatementEntryDto,
  ImportBankStatementDto,
  MatchBankStatementEntryDto,
  PayAccountsPayableDto,
  PayAccountsReceivableDto,
  ReconcileBankMovementDto,
  ReconciliationReportQueryDto,
  ReopenFinancialPeriodDto,
  ResolveReconciliationIssueDto,
  ReversePayablePaymentDto,
  ReverseReceivablePaymentDto,
  SyncOrderReceivableDto,
  UnmatchBankStatementEntryDto,
  UnreconcileBankMovementDto,
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
  @Patch('receivables/:id/payments/:paymentId/reverse')
  reverseReceivablePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReverseReceivablePaymentDto,
    @Req() req: Request,
  ) {
    return this.financeService.reverseReceivablePayment(
      id,
      paymentId,
      dto,
      this.getActorUserId(req),
    );
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
  @Patch('payables/:id/payments/:paymentId/reverse')
  reversePayablePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReversePayablePaymentDto,
    @Req() req: Request,
  ) {
    return this.financeService.reversePayablePayment(
      id,
      paymentId,
      dto,
      this.getActorUserId(req),
    );
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
  @Get('bank-accounts/:id/balance-audit')
  balanceAudit(@Param('id') id: string) {
    return this.financeService.auditBankAccountBalance(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-accounts/:id/statements/import')
  importBankStatement(
    @Param('id') id: string,
    @Body() dto: ImportBankStatementDto,
    @Req() req: Request,
  ) {
    return this.financeService.importBankStatement(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-accounts/:id/statements')
  bankStatements(@Param('id') id: string) {
    return this.financeService.listBankStatements(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-statements/:id')
  bankStatement(@Param('id') id: string) {
    return this.financeService.getBankStatement(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-statements/:id/entries')
  bankStatementEntries(@Param('id') id: string) {
    return this.financeService.listBankStatementEntries(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-statement-entries/:id/suggestions')
  bankStatementEntrySuggestions(
    @Param('id') id: string,
    @Query() query: AutoMatchBankStatementDto,
  ) {
    return this.financeService.suggestBankStatementEntryMatches(id, query);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-statements/:id/auto-match')
  autoMatchBankStatement(
    @Param('id') id: string,
    @Body() dto: AutoMatchBankStatementDto,
    @Req() req: Request,
  ) {
    return this.financeService.autoMatchBankStatement(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-statement-entries/:id/match')
  matchBankStatementEntry(
    @Param('id') id: string,
    @Body() dto: MatchBankStatementEntryDto,
    @Req() req: Request,
  ) {
    return this.financeService.matchBankStatementEntry(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-statement-entries/:id/unmatch')
  unmatchBankStatementEntry(
    @Param('id') id: string,
    @Body() dto: UnmatchBankStatementEntryDto,
    @Req() req: Request,
  ) {
    return this.financeService.unmatchBankStatementEntry(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-statement-entries/:id/ignore')
  ignoreBankStatementEntry(
    @Param('id') id: string,
    @Body() dto: IgnoreBankStatementEntryDto,
    @Req() req: Request,
  ) {
    return this.financeService.ignoreBankStatementEntry(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Post('bank-statement-entries/:id/adjustment')
  createBankAdjustment(
    @Param('id') id: string,
    @Body() dto: CreateBankAdjustmentDto,
    @Req() req: Request,
  ) {
    return this.financeService.createBankAdjustmentFromStatementEntry(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.create')
  @Post('reconciliation/issues')
  createReconciliationIssue(
    @Body() dto: CreateReconciliationIssueDto,
    @Req() req: Request,
  ) {
    return this.financeService.createReconciliationIssue(
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Patch('reconciliation/issues/:id/resolve')
  resolveReconciliationIssue(
    @Param('id') id: string,
    @Body() dto: ResolveReconciliationIssueDto,
    @Req() req: Request,
  ) {
    return this.financeService.resolveReconciliationIssue(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('reconciliation/report')
  reconciliationReport(@Query() query: ReconciliationReportQueryDto) {
    return this.financeService.reconciliationReport(query);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('bank-movements')
  bankMovements(@Query() query: BankMovementQueryDto) {
    return this.financeService.listBankMovements(query);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Patch('bank-movements/:id/reconcile')
  reconcileBankMovement(
    @Param('id') id: string,
    @Body() dto: ReconcileBankMovementDto,
    @Req() req: Request,
  ) {
    return this.financeService.reconcileBankMovement(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.reconcile')
  @Patch('bank-movements/:id/unreconcile')
  unreconcileBankMovement(
    @Param('id') id: string,
    @Body() dto: UnreconcileBankMovementDto,
    @Req() req: Request,
  ) {
    return this.financeService.unreconcileBankMovement(
      id,
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.update')
  @Patch('bank-movements/:id')
  updateBankMovement(@Param('id') id: string) {
    return this.financeService.updateBankMovement(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('finance.view')
  @Get('period-closings')
  periodClosings() {
    return this.financeService.listPeriodClosings();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('settings.admin')
  @Post('period-closings/close')
  closeFinancialPeriod(
    @Body() dto: CloseFinancialPeriodDto,
    @Req() req: Request,
  ) {
    return this.financeService.closeFinancialPeriod(
      dto,
      this.getActorUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('settings.admin')
  @Patch('period-closings/:id/reopen')
  reopenFinancialPeriod(
    @Param('id') id: string,
    @Body() dto: ReopenFinancialPeriodDto,
    @Req() req: Request,
  ) {
    return this.financeService.reopenFinancialPeriod(
      id,
      dto,
      this.getActorUserId(req),
    );
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
