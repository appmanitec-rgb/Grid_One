'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiErrorMessage } from '@/lib/api';

const AREAS = [
  ['EQUIPMENT', 'Equipamentos e ordens'], ['CONTRACTS', 'Contratos'],
  ['PROPOSALS', 'Propostas'], ['TICKETS', 'Chamados'],
  ['REQUESTS', 'Solicitacoes'], ['REPORTS', 'Laudos'],
  ['DOCUMENTS', 'Documentos'], ['FINANCIAL', 'Financeiro'],
  ['FEEDBACK', 'Observacoes e feedback'],
] as const;
const ALL = AREAS.map(([key]) => key);
type PortalUser = { id: string; name: string; email: string; isActive: boolean; portalPermissions: string[] };
type PortalFeedback = { id: string; kind: string; message: string; createdAt: string; user: { name: string } };
type Overview = { companyName: string; portalEnabled: boolean; portalLogoDataUrl: string | null; portalUsers: PortalUser[]; portalFeedbacks: PortalFeedback[] };

async function send(path: string, method: string, body?: unknown) {
  const response = await apiFetch(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(await readApiErrorMessage(response, 'Nao foi possivel salvar.'));
  return response.json();
}

function PermissionPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const full = ALL.every((key) => value.includes(key));
  return <div className="space-y-2">
    <label className="flex items-center gap-2 text-sm font-semibold text-blue-800"><input type="checkbox" checked={full} onChange={(event) => onChange(event.target.checked ? [...ALL] : [])} />Acesso total</label>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{AREAS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={value.includes(key)} onChange={(event) => onChange(event.target.checked ? [...value, key] : value.filter((item) => item !== key))} />{label}</label>)}</div>
  </div>;
}

export default function ClientPortalAdminPanel({ clientId }: { clientId: string }) {
  const base = '/clients/' + clientId + '/portal';
  const [overview, setOverview] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<string[]>([...ALL]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activationLink, setActivationLink] = useState('');
  const load = useCallback(async () => {
    try { setOverview(await send('/clients/' + clientId + '/portal', 'GET')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar a central.'); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel concluir.'); }
    finally { setBusy(false); }
  }
  function showLink(token: string) { setActivationLink(window.location.origin + '/cliente/ativar#token=' + token); }
  async function uploadLogo(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256000) { setError('Escolha PNG, JPG ou WebP de ate 250 KB.'); return; }
    const logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      reader.readAsDataURL(file);
    });
    await run(() => send(base, 'PATCH', { logoDataUrl }), 'Logo atualizada.');
  }
  if (!overview) return <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Central do cliente</h2><p className="mt-2 text-sm text-slate-500">{error || 'Carregando...'}</p></section>;
  return <section id="central-cliente" className="space-y-5 rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Acesso externo</p><h2 className="text-xl font-bold text-slate-950">Central do cliente</h2><p className="text-sm font-semibold text-slate-700">{overview.companyName}</p><p className="text-sm text-slate-500">Habilite a central e defina o acesso de cada pessoa deste cliente.</p></div><button disabled={busy} onClick={() => void run(() => send(base, 'PATCH', { enabled: !overview.portalEnabled }), overview.portalEnabled ? 'Central desabilitada.' : 'Central habilitada.')} className={overview.portalEnabled ? 'rounded-lg bg-green-100 px-4 py-2 text-sm font-bold text-green-800' : 'rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700'}>{overview.portalEnabled ? 'Central habilitada' : 'Habilitar central'}</button></div>
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {overview.portalLogoDataUrl ? <img src={overview.portalLogoDataUrl} alt="Logo do cliente" className="h-16 w-32 object-contain" /> : <div className="flex h-16 w-32 items-center justify-center rounded bg-white text-xs text-slate-400">Sem logo</div>}
      <div><label className="block text-sm font-bold text-slate-800">Logo na central</label><p className="mb-2 text-xs text-slate-500">PNG, JPG ou WebP, ate 250 KB.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} className="max-w-full text-xs" /></div>
      {overview.portalLogoDataUrl && <button disabled={busy} className="text-sm font-semibold text-red-700" onClick={() => void run(() => send(base, 'PATCH', { logoDataUrl: null }), 'Logo removida.')}>Remover logo</button>}
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {activationLink && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-blue-900">Link de ativacao valido por 48 horas</p><div className="mt-2 flex flex-wrap gap-2"><input readOnly value={activationLink} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded border border-blue-200 p-2 text-xs" /><button onClick={() => void navigator.clipboard.writeText(activationLink)} className="rounded bg-blue-700 px-3 py-2 text-xs font-bold text-white">Copiar</button></div><p className="mt-1 text-xs text-blue-800">Envie este link ao usuario pelo canal de sua preferencia.</p></div>}
    <div><h3 className="font-bold text-slate-900">Usuarios da central</h3><div className="mt-3 space-y-3">{overview.portalUsers.length ? overview.portalUsers.map((user) => <PortalUserEditor key={user.id} user={user} busy={busy} onSave={(patch) => run(() => send(base + '/users/' + user.id, 'PATCH', patch), 'Usuario atualizado.')} onActivate={() => run(async () => { const result = await send(base + '/users/' + user.id + '/activation', 'POST'); showLink(result.token); }, 'Novo link de ativacao gerado.')} />) : <p className="text-sm text-slate-500">Nenhum usuario cadastrado para este cliente.</p>}</div></div>
    <form className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4" onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await send(base + '/users', 'POST', { name, email, permissions }); showLink(result.activation.token); setName(''); setEmail(''); setPermissions([...ALL]); }, 'Usuario criado. Compartilhe o link de ativacao.'); }}>
      <h3 className="font-bold text-slate-900">Adicionar usuario</h3>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Nome<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" /></label><label className="text-sm font-semibold">E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" /></label></div>
      <PermissionPicker value={permissions} onChange={setPermissions} />
      <button disabled={busy || !overview.portalEnabled} type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Criar usuario e gerar acesso</button>{!overview.portalEnabled && <p className="text-xs text-slate-500">Habilite a central para criar usuarios.</p>}
    </form>
    <div><h3 className="font-bold text-slate-900">Observacoes e feedbacks recebidos</h3><div className="mt-3 space-y-2">{overview.portalFeedbacks.length ? overview.portalFeedbacks.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500"><span>{item.kind === 'FEEDBACK' ? 'Feedback' : 'Observacao'} de {item.user.name}</span><time>{new Date(item.createdAt).toLocaleString('pt-BR')}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.message}</p></div>) : <p className="text-sm text-slate-500">Nenhum registro recebido.</p>}</div></div>
  </section>;
}
function PortalUserEditor({ user, busy, onSave, onActivate }: { user: PortalUser; busy: boolean; onSave: (patch: unknown) => Promise<void>; onActivate: () => Promise<void> }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [permissions, setPermissions] = useState(user.portalPermissions);
  return <div className="rounded-lg border border-slate-200 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Nome<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 text-sm" /></label><label className="text-xs font-bold text-slate-600">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 text-sm" /></label></div><div className="mt-3"><PermissionPicker value={permissions} onChange={setPermissions} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><button disabled={busy} onClick={() => void onSave({ name, email, permissions })} className="rounded bg-slate-900 px-3 py-2 text-xs font-bold text-white">Salvar usuario</button><button disabled={busy} onClick={() => void onActivate()} className="rounded border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800">Gerar novo link</button>{user.isActive && <button disabled={busy} onClick={() => void onSave({ isActive: false })} className="rounded border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Desativar acesso</button>}<span className="text-xs text-slate-500">{user.isActive ? 'Ativo' : 'Pendente ou desativado'}</span></div></div>;
}
