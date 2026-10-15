import {
  AccountsReceivableStatus,
  AuditDomain,
  Prisma,
  ProposalStatus,
} from '@prisma/client';
import { createApprovedProposalOrder } from './proposal-work-order';

export {
  proposalEntryPending,
  assertProposalFinancialRelease,
} from './proposal-financial-release';

export async function syncProposalEntryConfirmation(
  tx: Prisma.TransactionClient,
  proposalId: string,
  actorUserId?: string,
) {
  await tx.$queryRaw`SELECT id FROM proposals WHERE id = ${proposalId} FOR UPDATE`;
  const proposal = await tx.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal?.hasDownPayment) return;
  const receipts = await tx.accountsReceivable.findMany({
    where: {
      sourceProposalId: proposalId,
      proposalPaymentStage: 'DOWN_PAYMENT',
      status: { not: AccountsReceivableStatus.CANCELED },
    },
    select: { paidAmount: true, netAmount: true },
  });
  const receivedCents = receipts.reduce(
    (sum, row) =>
      sum +
      Math.min(
        Math.round(row.paidAmount * 100),
        Math.round(row.netAmount * 100),
      ),
    0,
  );
  const requiredCents = Math.round(
    Number(proposal.downPaymentAmount || 0) * 100,
  );
  const cleared = requiredCents > 0 && receivedCents >= requiredCents;
  if (cleared === Boolean(proposal.downPaymentConfirmedAt)) return;
  const now = new Date();
  await tx.proposal.update({
    where: { id: proposalId },
    data: {
      downPaymentConfirmedAt: cleared ? now : null,
      downPaymentConfirmedById: cleared ? actorUserId : null,
    },
  });
  const action = cleared ? 'CONFIRM_DOWN_PAYMENT' : 'REVERSE_DOWN_PAYMENT';
  await tx.proposalMovement.create({
    data: {
      proposalId,
      actorUserId,
      action,
      fromStatus: proposal.status,
      toStatus: proposal.status,
      note: cleared
        ? 'Entrada recebida integralmente e confirmada pelo financeiro. Operação liberada.'
        : 'Recebimento da entrada estornado. Novas ações operacionais aguardam confirmação financeira.',
    },
  });
  await tx.systemAuditLog.create({
    data: {
      domain: AuditDomain.FINANCE,
      entityType: 'PROPOSAL',
      entityId: proposalId,
      action,
      actorUserId,
      afterPayload: {
        receivedAmount: receivedCents / 100,
        requiredAmount: requiredCents / 100,
      },
    },
  });
  if (cleared && proposal.status === ProposalStatus.WON) {
    const order = await createApprovedProposalOrder(tx, proposal);
    const salesOrder = order
      ? null
      : await tx.salesOrder.findUnique({
          where: { proposalId },
          select: { id: true },
        });
    if (order || salesOrder)
      await tx.accountsReceivable.updateMany({
        where: { sourceProposalId: proposalId },
        data: { maintenanceOrderId: order?.id, salesOrderId: salesOrder?.id },
      });
  }
}
