import {
  assertProposalFinancialRelease,
  proposalEntryPending,
} from './proposal-financial-release';
import type { Prisma } from '@prisma/client';

describe('liberação financeira da proposta', () => {
  const tx = (hasDownPayment: boolean, confirmed: Date | null) =>
    ({
      proposal: {
        findUnique: jest.fn().mockResolvedValue({
          hasDownPayment,
          downPaymentAmount: 500,
          downPaymentConfirmedAt: confirmed,
        }),
      },
    }) as unknown as Prisma.TransactionClient;
  it('bloqueia a operação enquanto a entrada não foi confirmada', async () => {
    expect(await proposalEntryPending(tx(true, null), 'proposal')).toBe(true);
    await expect(
      assertProposalFinancialRelease(tx(true, null), 'proposal'),
    ).rejects.toThrow('confirmação da entrada');
  });
  it('libera a operação depois da confirmação financeira', async () =>
    await expect(
      assertProposalFinancialRelease(tx(true, new Date()), 'proposal'),
    ).resolves.toBeUndefined());
  it('mantém a operação sem entrada no fluxo normal', async () =>
    await expect(
      assertProposalFinancialRelease(tx(false, null), 'proposal'),
    ).resolves.toBeUndefined());
});
