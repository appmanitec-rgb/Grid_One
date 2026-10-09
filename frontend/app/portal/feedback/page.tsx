'use client';
import { useEffect, useState } from 'react';
import { customerPortalGet, customerPortalPost, formatPortalDate } from '@/lib/customer-portal';

type Entry = { id: string; kind: string; message: string; createdAt: string; user: { name: string } };

export default function PortalFeedbackPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<'OBSERVATION' | 'FEEDBACK'>('OBSERVATION');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { setEntries(await customerPortalGet<Entry[]>('/feedback')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar.'); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await customerPortalPost('/feedback', { kind, message });
      setMessage('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao enviar.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <header><p className="text-sm font-bold uppercase tracking-wide text-blue-700">Comunica??o</p><h1 className="text-2xl font-extrabold text-slate-950">Observa??es e feedback</h1><p className="text-sm text-slate-500">Compartilhe uma observa??o sobre o atendimento ou uma sugest?o para a Manitec.</p></header>
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-bold text-slate-700">Tipo<select value={kind} onChange={(event) => setKind(event.target.value as 'OBSERVATION' | 'FEEDBACK')} className="mt-1 block w-full rounded-lg border border-slate-300 p-3"><option value="OBSERVATION">Observa??o</option><option value="FEEDBACK">Feedback ou sugest?o</option></select></label>
      <label className="block text-sm font-bold text-slate-700">Mensagem<textarea required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" placeholder="Escreva sua mensagem..." /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy || !message.trim()} className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Enviar mensagem</button>
    </form>
    <section className="space-y-3"><h2 className="font-bold text-slate-900">Mensagens anteriores</h2>{entries.length ? entries.map((entry) => <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500"><span>{entry.kind === 'FEEDBACK' ? 'Feedback' : 'Observa??o'} de {entry.user.name}</span><time>{formatPortalDate(entry.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{entry.message}</p></article>) : <p className="text-sm text-slate-500">Nenhuma mensagem enviada ainda.</p>}</section>
  </div>;
}
