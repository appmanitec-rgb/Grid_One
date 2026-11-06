"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiErrorMessage } from '@/lib/api';
import { SectionCard, StatusBanner, DataPill } from '../../components/DashboardPageKit';

type PendingPayment = {
  id: string; code: string; client: { companyName: string }; paymentTerm?: string;
  totalValue: number; downPaymentAmount?: number; entryReceived: number;
  needsScheduling: boolean; receivableIds: string[];
  schedule: { key: string; label: string; stage: string; amount: number }[];
};
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function ProposalPaymentsQueue({ refreshKey, onUpdated }: { refreshKey: string; onUpdated: () => Promise<void> }) {
  const [pending,setPending]=useState<PendingPayment[]>([]);
  const [dates,setDates]=useState<Record<string,string[]>>({});
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    try {
      const response=await apiFetch('/finance/receivables/proposals/pending',{cache:'no-store'});
      if(!response.ok)throw new Error(await readApiErrorMessage(response,'Não foi possível carregar as propostas no financeiro.'));
      const data=await response.json();setPending(Array.isArray(data)?data:[]);
    } catch(issue){setError(issue instanceof Error?issue.message:'Falha ao carregar propostas.');}
  },[]);
  useEffect(()=>{void load();},[load,refreshKey]);
  async function schedule(proposal:PendingPayment){
    const dueDates=dates[proposal.id] || [];
    if(proposal.schedule.some((_,index)=>!dueDates[index])){setError('Defina um vencimento para a entrada e para cada parcela.');return;}
    setBusy(proposal.id);setError('');
    try{
      const response=await apiFetch('/finance/receivables/proposals/'+proposal.id+'/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dueDates:dueDates.map(date=>date+'T12:00:00.000Z')})});
      if(!response.ok)throw new Error(await readApiErrorMessage(response,'Não foi possível gerar as parcelas.'));
      await onUpdated();await load();
    }catch(issue){setError(issue instanceof Error?issue.message:'Falha ao gerar parcelas.');}finally{setBusy('');}
  }
  if(!pending.length&&!error)return null;
  return <SectionCard title="Propostas no financeiro" description="Defina os vencimentos e confirme o recebimento da entrada para liberar a operação.">
    {error?<StatusBanner tone="rose">{error}</StatusBanner>:null}
    <div className="space-y-4">{pending.map(proposal=><article key={proposal.id} aria-label={'Pagamento da proposta '+proposal.code} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={'/dashboard/proposals/'+proposal.id} className="text-sm font-semibold text-blue-700">Proposta {proposal.code} ↗</Link><h3 className="mt-1 font-semibold text-slate-900">{proposal.client.companyName}</h3><p className="mt-1 text-xs text-slate-600">{proposal.paymentTerm} · Total {money(proposal.totalValue)}</p></div><DataPill tone="amber">{proposal.needsScheduling?'Definir vencimentos':'Aguardando entrada'}</DataPill></div>
      {proposal.needsScheduling?<>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{proposal.schedule.map((line,index)=><label key={line.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700"><span className="flex justify-between gap-2"><strong>{line.label}</strong><span className="tabular-nums">{money(line.amount)}</span></span><span className="mt-2 block text-xs text-slate-500">Vencimento</span><input aria-label={'Vencimento de '+line.label+' · '+proposal.code} type="date" value={dates[proposal.id]?.[index]||''} onChange={event=>setDates(current=>{const next=[...(current[proposal.id]||[])];next[index]=event.target.value;return {...current,[proposal.id]:next};})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>)}</div>
        <button type="button" onClick={()=>void schedule(proposal)} disabled={busy===proposal.id} className="mt-4 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy===proposal.id?'Gerando...':'Gerar parcelas da proposta'}</button>
      </>:<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>Entrada prevista: <strong>{money(Number(proposal.downPaymentAmount||0))}</strong> · Recebido: <strong>{money(proposal.entryReceived)}</strong></p><p className="mt-1 text-xs">Registre o recebimento no título da entrada abaixo. A confirmação integral libera a O.S. automaticamente; para contratos e geradores, libera a ação de operação na proposta.</p></div>}
    </article>)}</div>
  </SectionCard>;
}
