"use client";

import { commercialLabel } from '@/lib/commercial-labels';
import type { ControlOption } from '@/lib/control-options';
import { PAYMENT_PRESETS, paymentComposition, presetPlan, type ProposalPaymentPlan } from '@/lib/proposal-payment-plan';

const money = (value: number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function PaymentPlanEditor({ value, onChange, paymentTerm, onTermChange, total, options = [], blockReason }: {
  value: ProposalPaymentPlan | null;
  onChange: (value: ProposalPaymentPlan) => void;
  paymentTerm: string;
  onTermChange: (value: string) => void;
  total: number;
  options?: ControlOption[];
  blockReason?: (option: ControlOption) => string;
}) {
  const composition = paymentComposition(total,value);
  const update = (patch: Partial<ProposalPaymentPlan>) => onChange({ ...(value || presetPlan('CUSTOM')), ...patch });
  const selected = value?.preset === 'CONFIGURED' ? 'option:'+paymentTerm : value?.preset || '';
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-label="Plano de pagamento">
    <label className="block text-sm font-semibold text-slate-900" htmlFor="proposal-payment-condition">Condição de pagamento</label>
    <select id="proposal-payment-condition" value={selected} onChange={event => {
      const next = event.target.value;
      if (!next) return;
      if (next.startsWith('option:')) {onChange(presetPlan('CONFIGURED'));onTermChange(next.slice(7));return;}
      const preset = next as ProposalPaymentPlan['preset'];
      onChange(preset === 'CUSTOM' ? {...(value || presetPlan('CUSTOM')),preset:'CUSTOM',balanceInstallments:Math.max(1,value?.balanceInstallments || 1)} : presetPlan(preset));
      onTermChange(preset === '50_50' ? '50/50' : preset === '30_70' ? '30/70' : preset === 'CASH' ? 'À vista' : preset === 'PREPAID' ? '100% antecipado' : 'Condição especial');
    }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
      <option value="">Selecione a condição</option>
      {PAYMENT_PRESETS.map(preset => {
        const label = preset.id === '50_50' ? '50/50' : preset.id === '30_70' ? '30/70' : preset.id === 'CASH' ? 'À vista' : '100% antecipado';
        const original = options.find(option => commercialLabel(option.name) === label);
        const blocked = original && blockReason ? blockReason(original) : '';
        return <option key={preset.id} value={preset.id} disabled={Boolean(blocked)}>{preset.label}{blocked ? ' · '+blocked : ''}</option>;
      })}
      {options.filter(option => !['À vista','50/50','30/70','100% antecipado'].includes(commercialLabel(option.name))).map(option => <option key={option.id} value={'option:'+option.name} disabled={Boolean(blockReason?.(option))}>{commercialLabel(option.name)}{blockReason?.(option) ? ' · '+blockReason(option) : ''}</option>)}
      {value?.preset === 'CONFIGURED' && paymentTerm && !options.some(option => option.name === paymentTerm) ? <option value={'option:'+paymentTerm}>{commercialLabel(paymentTerm)}</option> : null}
      <option value="CUSTOM">Condição especial · personalizar entrada e parcelas</option>
    </select>
    {value?.preset === 'CUSTOM' ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm text-slate-700 sm:col-span-2 lg:col-span-4">Descrição da condição especial<input aria-label="Descrição da condição especial" value={paymentTerm} onChange={event=>onTermChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" placeholder="Ex.: 40% de entrada e saldo em 3 parcelas" /></label>
      <label className="text-sm text-slate-700">Entrada em<select aria-label="Entrada em" value={value.entryType} onChange={event=>{const entryType=event.target.value as 'PERCENTAGE'|'VALUE';update({entryType,entryValue:entryType==='VALUE'?composition.entry:total>0?Number((composition.entry/total*100).toFixed(4)):0});}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"><option value="PERCENTAGE">Porcentagem (%)</option><option value="VALUE">Valor (R$)</option></select></label>
      <label className="text-sm text-slate-700">{value.entryType==='PERCENTAGE'?'Percentual da entrada':'Valor da entrada'}<input aria-label={value.entryType==='PERCENTAGE'?'Percentual da entrada':'Valor da entrada'} type="number" min="0" max={value.entryType==='PERCENTAGE'?100:undefined} step={value.entryType === "PERCENTAGE" ? "0.0001" : "0.01"} value={value.entryValue} onChange={event=>update({entryValue:Number(event.target.value)})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" /></label>
      <label className="text-sm text-slate-700">Parcelas do saldo<input aria-label="Parcelas do saldo" type="number" min="1" max="36" value={value.balanceInstallments || 1} onChange={event=>update({balanceInstallments:Number(event.target.value)})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" /></label>
      <p className="self-center text-xs leading-5 text-slate-500">Informe 0 na entrada para parcelar o valor inteiro.</p>
    </div> : value ? <p className="mt-3 text-sm text-slate-600">{PAYMENT_PRESETS.find(preset=>preset.id===value.preset)?.description || 'Pagamento em uma parcela conforme a condição escolhida.'}</p> : null}
    {value ? <>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="block text-xs text-slate-500">Entrada{value.entryType==='PERCENTAGE' ? ' · '+value.entryValue+'%' : ''}</span><output aria-label="Entrada calculada" className="mt-1 block font-semibold tabular-nums text-slate-900">{money(composition.entry)}</output></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="block text-xs text-slate-500">Saldo</span><output aria-label="Saldo calculado" className="mt-1 block font-semibold tabular-nums text-slate-900">{money(composition.balance)}</output></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><span className="block text-xs text-slate-500">Parcelas do saldo</span><strong className="mt-1 block text-slate-900">{composition.count || (total > 0 ? 'Sem saldo restante' : value.balanceInstallments)}</strong></div>
      </div>
      <details className="mt-3 text-sm text-slate-700"><summary className="cursor-pointer font-semibold">Ver composição das parcelas</summary><dl className="mt-3 space-y-2">{composition.rows.map(row=><div key={row.key} className="flex justify-between gap-4 rounded-lg bg-white px-3 py-2"><dt>{row.label}</dt><dd className="font-semibold tabular-nums">{money(row.amount)}</dd></div>)}{!composition.rows.length?<p>Os valores serão calculados ao adicionar os itens.</p>:null}</dl></details>
      <p className="mt-3 text-xs leading-5 text-slate-500">O financeiro definirá o vencimento da entrada e de cada parcela após a aprovação do cliente.{value.entryValue>0 ? ' A operação será liberada somente após a confirmação do recebimento integral da entrada.' : ''}</p>
    </> : null}
  </section>;
}
