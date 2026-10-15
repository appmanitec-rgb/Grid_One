import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AccountsReceivableStatus,
  AuditDomain,
  Prisma,
  ProposalStatus,
} from '@prisma/client';
import { buildPaymentSchedule } from '../proposals/proposal-payment-plan';

export function scheduleForProposal(proposal: {
  totalValue: number;
  hasDownPayment: boolean;
  downPaymentAmount: number | null;
  installmentCount: number | null;
}) {
  return buildPaymentSchedule(
    proposal.totalValue,
    proposal.hasDownPayment ? Number(proposal.downPaymentAmount || 0) : 0,
    proposal.installmentCount || 1,
  );
}

export async function scheduleProposalReceivables(
  tx: Prisma.TransactionClient,
  id: string,
  dueDates: string[],
  actorUserId?: string,
) {
  await tx.$queryRaw`SELECT id FROM proposals WHERE id = ${id} FOR UPDATE`;
  const proposal = await tx.proposal.findUnique({
    where: { id },
    include: {
      executionOrder: { select: { id: true, costCenterId: true } },
      salesOrder: { select: { id: true } },
      generatedContract: {
        select: { id: true, startDate: true, costCenterId: true },
      },
    },
  });
  if (!proposal) throw new NotFoundException('Proposta não encontrada.');
  if (proposal.status !== ProposalStatus.WON)
    throw new BadRequestException(
      'Os vencimentos só podem ser definidos após a aprovação do cliente.',
    );
  if (!proposal.paymentPlan && !proposal.hasDownPayment)
    throw new BadRequestException(
      'Esta proposta utiliza o faturamento operacional existente.',
    );
  const existing = await tx.accountsReceivable.findMany({
    where: { sourceProposalId: id },
  });
  if (existing.length) {
    if (
      existing.some((row) => row.status === AccountsReceivableStatus.CANCELED)
    )
      throw new BadRequestException(
        'Há parcelas canceladas. Revise a cobrança existente antes de emitir novos títulos.',
      );
    return { created: false, receivables: existing };
  }
  const schedule = scheduleForProposal(proposal);
  if (!schedule.length || schedule.some((row) => row.amount <= 0))
    throw new BadRequestException(
      'A proposta não possui valores válidos para faturar.',
    );
  if (dueDates.length !== schedule.length)
    throw new BadRequestException(
      'Defina um vencimento para a entrada e para cada parcela.',
    );
  const parsed = dueDates.map(
    (date) =>
      new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T12:00:00.000Z' : date,
      ),
  );
  if (
    parsed.some((date) => Number.isNaN(date.getTime())) ||
    parsed.some((date, index) => index > 0 && date < parsed[index - 1])
  )
    throw new BadRequestException(
      'Informe datas válidas em ordem cronológica.',
    );
  const receivables: Awaited<
    ReturnType<typeof tx.accountsReceivable.create>
  >[] = [];
  for (const [index, line] of schedule.entries()) {
    const row = await tx.accountsReceivable.create({
      data: {
        sourceProposalId: id,
        proposalPaymentStage: line.stage,
        proposalPaymentKey: id + ':' + line.key,
        contractId: proposal.generatedContract?.id,
        clientId: proposal.clientId,
        maintenanceOrderId: proposal.executionOrder?.id,
        salesOrderId: proposal.salesOrder?.id,
        costCenterId:
          proposal.generatedContract?.costCenterId ||
          proposal.executionOrder?.costCenterId,
        description: 'Proposta ' + proposal.code + ' · ' + line.label,
        competenceDate: proposal.generatedContract?.startDate || new Date(),
        dueDate: parsed[index],
        grossAmount: line.amount,
        netAmount: line.amount,
        installmentNumber: line.number || undefined,
        installmentCount: proposal.installmentCount || 1,
      },
    });
    receivables.push(row);
  }
  if (proposal.generatedContract)
    await tx.contractInvoice.updateMany({
      where: {
        contractId: proposal.generatedContract.id,
        competenceDate: proposal.generatedContract.startDate,
      },
      data: { dueDate: parsed[parsed.length - 1] },
    });
  await tx.financialAuditLog.create({
    data: {
      module: 'FINANCE',
      entityType: 'PROPOSAL',
      entityId: id,
      action: 'SCHEDULE_PROPOSAL_PAYMENTS',
      actorUserId,
      payload: { dueDates, amounts: schedule.map((line) => line.amount) },
    },
  });
  await tx.systemAuditLog.create({
    data: {
      domain: AuditDomain.FINANCE,
      entityType: 'PROPOSAL',
      entityId: id,
      action: 'SCHEDULE_PROPOSAL_PAYMENTS',
      actorUserId,
      afterPayload: { dueDates, amounts: schedule.map((line) => line.amount) },
    },
  });
  return { created: true, receivables };
}
