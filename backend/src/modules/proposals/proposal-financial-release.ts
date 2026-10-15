import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function proposalEntryPending(
  tx: Prisma.TransactionClient,
  proposalId: string,
) {
  const source = await tx.proposal.findUnique({
    where: { id: proposalId },
    select: {
      hasDownPayment: true,
      downPaymentAmount: true,
      downPaymentConfirmedAt: true,
    },
  });
  return Boolean(
    source?.hasDownPayment &&
    Number(source.downPaymentAmount || 0) > 0 &&
    !source.downPaymentConfirmedAt,
  );
}

export async function assertProposalFinancialRelease(
  tx: Prisma.TransactionClient,
  proposalId: string,
) {
  if (await proposalEntryPending(tx, proposalId))
    throw new BadRequestException(
      'A proposta aguarda a confirmação da entrada pelo financeiro antes de liberar a operação.',
    );
}
