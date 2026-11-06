export type ProposalPaymentPlan = {
  preset: 'CASH' | '50_50' | '30_70' | 'PREPAID' | 'CUSTOM' | 'CONFIGURED';
  entryType: 'PERCENTAGE' | 'VALUE';
  entryValue: number;
  balanceInstallments: number;
};

export const PAYMENT_PRESETS = [
  { id: 'CASH', label: 'À vista', description: 'Uma parcela, sem entrada antecipada.', entry: 0 },
  { id: '50_50', label: '50/50 · 50% de entrada + 50% de saldo', description: '50% para liberar a operação e 50% em uma parcela.', entry: 50 },
  { id: '30_70', label: '30/70 · 30% de entrada + 70% de saldo', description: '30% para liberar a operação e 70% em uma parcela.', entry: 30 },
  { id: 'PREPAID', label: '100% antecipado', description: 'Pagamento integral antes de liberar a operação.', entry: 100 },
] as const;

export function presetPlan(preset: ProposalPaymentPlan['preset']): ProposalPaymentPlan {
  const entry = PAYMENT_PRESETS.find(item => item.id === preset)?.entry || 0;
  return { preset, entryType: 'PERCENTAGE', entryValue: entry, balanceInstallments: entry === 100 ? 0 : 1 };
}

export function planFromLegacy(input: { paymentPlan?: ProposalPaymentPlan | null; paymentTerm?: string | null; hasDownPayment?: boolean | null; downPaymentAmount?: number | null; installmentCount?: number | null }): ProposalPaymentPlan | null {
  if (input.paymentPlan) return input.paymentPlan;
  if (input.hasDownPayment || (input.installmentCount || 1) > 1) return { preset: 'CUSTOM', entryType: 'VALUE', entryValue: input.downPaymentAmount || 0, balanceInstallments: input.installmentCount || 1 };
  if (!input.paymentTerm) return null;
  const term = input.paymentTerm.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[ _]/g,'');
  if (term === 'AVISTA' || term === 'CASH') return presetPlan('CASH');
  return presetPlan('CONFIGURED');
}

export function paymentComposition(total: number, plan: ProposalPaymentPlan | null) {
  const totalCents = Math.round(total * 100);
  const rawEntry = plan ? plan.entryType === 'PERCENTAGE' ? Math.round(totalCents * plan.entryValue / 100) : Math.round(plan.entryValue * 100) : 0;
  const entryCents = Math.min(totalCents, Math.max(0, rawEntry));
  const balanceCents = Math.max(0,totalCents - entryCents);
  const count = balanceCents > 0 ? Math.min(36, Math.max(1,plan?.balanceInstallments || 1)) : 0;
  const rows: { key: string; label: string; amount: number }[] = [];
  if (entryCents > 0) rows.push({ key: 'DOWN_PAYMENT', label: balanceCents > 0 ? 'Entrada' : 'Pagamento antecipado', amount: entryCents / 100 });
  if (count > 0) {
    const base = Math.floor(balanceCents / count);
    for (let index=1;index<=count;index++) rows.push({key:'BALANCE_'+index,label:'Parcela '+index+' de '+count,amount:(base+(index===count?balanceCents-base*count:0))/100});
  }
  return { entry: entryCents / 100, balance: balanceCents / 100, count, rows };
}
