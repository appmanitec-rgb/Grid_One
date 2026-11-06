import { BadRequestException } from '@nestjs/common';

export type ProposalPaymentPlan = {
  preset: 'CASH' | '50_50' | '30_70' | 'PREPAID' | 'CUSTOM' | 'CONFIGURED';
  entryType: 'PERCENTAGE' | 'VALUE';
  entryValue: number;
  balanceInstallments: number;
};

export const PAYMENT_PRESET_LABELS = {
  CASH: 'À vista',
  '50_50': '50/50',
  '30_70': '30/70',
  PREPAID: '100% antecipado',
};

export function paymentPresetLabel(plan?: ProposalPaymentPlan | null) {
  return plan
    ? PAYMENT_PRESET_LABELS[plan.preset as keyof typeof PAYMENT_PRESET_LABELS]
    : undefined;
}

export function resolvePaymentPlan(input: ProposalPaymentPlan, total: number) {
  const plan = { ...input };
  if (
    !['CASH', '50_50', '30_70', 'PREPAID', 'CUSTOM', 'CONFIGURED'].includes(
      plan.preset,
    )
  )
    throw new BadRequestException('Condição de pagamento inválida.');
  if (plan.preset === '50_50' || plan.preset === '30_70') {
    plan.entryType = 'PERCENTAGE';
    plan.entryValue = plan.preset === '50_50' ? 50 : 30;
    plan.balanceInstallments = 1;
  } else if (plan.preset === 'PREPAID') {
    plan.entryType = 'PERCENTAGE';
    plan.entryValue = 100;
    plan.balanceInstallments = 0;
  } else if (plan.preset === 'CASH' || plan.preset === 'CONFIGURED') {
    plan.entryType = 'PERCENTAGE';
    plan.entryValue = 0;
    plan.balanceInstallments = 1;
  }
  if (
    !['PERCENTAGE', 'VALUE'].includes(plan.entryType) ||
    !Number.isFinite(plan.entryValue) ||
    plan.entryValue < 0
  )
    throw new BadRequestException('Entrada inválida.');
  if (plan.entryType === 'PERCENTAGE' && plan.entryValue > 100)
    throw new BadRequestException('A entrada não pode superar 100%.');
  const totalCents = Math.round(total * 100);
  const entryCents =
    plan.entryType === 'PERCENTAGE'
      ? Math.round((totalCents * plan.entryValue) / 100)
      : Math.round(plan.entryValue * 100);
  if (entryCents > totalCents)
    throw new BadRequestException(
      'A entrada não pode superar o total da proposta.',
    );
  if (plan.entryValue > 0 && entryCents === 0)
    throw new BadRequestException(
      'O valor de entrada deve ser de pelo menos um centavo.',
    );
  const balanceCents = totalCents - entryCents;
  if (
    balanceCents > 0 &&
    (!Number.isInteger(plan.balanceInstallments) ||
      plan.balanceInstallments < 1 ||
      plan.balanceInstallments > 36 ||
      balanceCents < plan.balanceInstallments)
  )
    throw new BadRequestException(
      'Informe de 1 a 36 parcelas, com valor de pelo menos um centavo.',
    );
  if (balanceCents === 0) plan.balanceInstallments = 0;
  const schedule = buildPaymentSchedule(
    total,
    entryCents / 100,
    plan.balanceInstallments,
  );
  return {
    plan,
    schedule,
    hasDownPayment: entryCents > 0,
    downPaymentAmount: entryCents / 100,
    installmentCount: Math.max(1, plan.balanceInstallments),
  };
}

export function buildPaymentSchedule(
  total: number,
  entry: number,
  installments: number,
) {
  const totalCents = Math.round(total * 100),
    entryCents = Math.round(entry * 100);
  const balance = totalCents - entryCents;
  const schedule: {
    key: string;
    stage: 'DOWN_PAYMENT' | 'BALANCE';
    number: number;
    label: string;
    amount: number;
  }[] = [];
  if (entryCents > 0)
    schedule.push({
      key: 'DOWN_PAYMENT',
      stage: 'DOWN_PAYMENT',
      number: 0,
      label: entryCents === totalCents ? 'Pagamento antecipado' : 'Entrada',
      amount: entryCents / 100,
    });
  if (balance > 0) {
    const count = Math.max(1, installments);
    const base = Math.floor(balance / count);
    for (let number = 1; number <= count; number++)
      schedule.push({
        key: 'BALANCE_' + number,
        stage: 'BALANCE',
        number,
        label: 'Parcela ' + number + ' de ' + count,
        amount: (base + (number === count ? balance - base * count : 0)) / 100,
      });
  }
  return schedule;
}
