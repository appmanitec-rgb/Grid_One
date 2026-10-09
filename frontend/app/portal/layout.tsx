'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SessionHeartbeat from '../SessionHeartbeat';
import { clearAuthSession, decodeJwtPayload, ensureValidSession, getStoredAccessToken } from '@/lib/auth-session';
import { customerPortalGet } from '@/lib/customer-portal';

const NAV_ITEMS = [
  { href: '/portal/dashboard', label: 'Resumo', permission: null },
  { href: '/portal/equipamentos', label: 'Equipamentos', permission: 'EQUIPMENT' },
  { href: '/portal/contratos', label: 'Contratos', permission: 'CONTRACTS' },
  { href: '/portal/propostas', label: 'Propostas', permission: 'PROPOSALS' },
  { href: '/portal/chamados', label: 'Chamados', permission: 'TICKETS' },
  { href: '/portal/solicitacoes', label: 'Solicitacoes', permission: 'REQUESTS' },
  { href: '/portal/laudos', label: 'Laudos', permission: 'REPORTS' },
  { href: '/portal/documentos', label: 'Documentos', permission: 'DOCUMENTS' },
  { href: '/portal/financeiro', label: 'Financeiro', permission: 'FINANCIAL' },
  { href: '/portal/feedback', label: 'Observacoes e feedback', permission: 'FEEDBACK' },
];

type PortalMe = {
  user: { name: string; portalPermissions: string[] };
  client: { companyName: string; tradeName?: string | null; portalLogoDataUrl?: string | null };
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const hasSession = await ensureValidSession();
      const token = getStoredAccessToken();
      if (cancelled) return;
      if (!hasSession || !token) { clearAuthSession(); router.replace('/cliente/entrar'); return; }
      const payload = decodeJwtPayload<{ role?: string }>(token);
      if (payload?.role !== 'CLIENT') { router.replace('/dashboard'); return; }
      try {
        const profile = await customerPortalGet<PortalMe>('/me');
        if (!cancelled) setMe(profile);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar a central.');
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    const item = NAV_ITEMS.find((entry) => pathname === entry.href || pathname.startsWith(entry.href + '/'));
    if (item?.permission && !me.user.portalPermissions.includes(item.permission)) router.replace('/portal/dashboard');
  }, [me, pathname, router]);

  function handleLogout() { clearAuthSession(); router.replace('/cliente/entrar'); }

  if (!me) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-6xl rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm">{error || 'Carregando portal...'}</div></main>;

  return <div className="min-h-screen bg-[#f3f7fb] text-slate-900">
    <SessionHeartbeat source="CLIENT_PORTAL" />
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        {me.client.portalLogoDataUrl && <img src={me.client.portalLogoDataUrl} alt={'Logo de ' + me.client.companyName} className="h-12 w-24 rounded bg-white object-contain" />}
        <div><Link href="/portal/dashboard" className="text-lg font-extrabold text-slate-950">MANITEC Portal</Link><p className="text-sm font-medium text-slate-500">{me.client.tradeName || me.client.companyName}</p></div>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1">{NAV_ITEMS.filter((item) => !item.permission || me.user.portalPermissions.includes(item.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return <Link key={item.href} href={item.href} className={active ? 'whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white' : 'whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700'}>{item.label}</Link>;
      })}</nav>
      <button type="button" onClick={handleLogout} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-700">Sair</button>
    </div></header>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
  </div>;
}
