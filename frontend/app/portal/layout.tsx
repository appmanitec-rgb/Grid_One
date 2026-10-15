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
  { href: '/portal/solicitacoes', label: 'Solicitações', permission: 'REQUESTS' },
  { href: '/portal/laudos', label: 'Laudos', permission: 'REPORTS' },
  { href: '/portal/documentos', label: 'Documentos', permission: 'DOCUMENTS' },
  { href: '/portal/financeiro', label: 'Financeiro', permission: 'FINANCIAL' },
  { href: '/portal/feedback', label: 'Observações e feedback', permission: 'FEEDBACK' },
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

  return <div className="portal-shell min-h-screen bg-[#f3f7fb] text-slate-900">
    <SessionHeartbeat source="CLIENT_PORTAL" />
    <a href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Ir para o conteúdo</a>
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {me.client.portalLogoDataUrl && <img src={me.client.portalLogoDataUrl} alt={'Logo de ' + me.client.companyName} className="h-11 w-20 shrink-0 rounded-lg bg-white object-contain" />}
            <div className="min-w-0"><Link href="/portal/dashboard" className="text-base font-extrabold text-slate-950">Manitec · Central do cliente</Link><p className="mt-1 truncate text-sm text-slate-500" title={me.client.companyName}>{me.client.tradeName || me.client.companyName}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-3"><span className="hidden max-w-48 truncate text-sm font-semibold text-slate-600 md:block">{me.user.name}</span><button type="button" onClick={handleLogout} className="min-h-10 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-red-200 hover:text-red-700">Sair</button></div>
        </div>
        <nav aria-label="Central do cliente" className="portal-nav border-t border-slate-100">{NAV_ITEMS.filter((item) => !item.permission || me.user.portalPermissions.includes(item.permission)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'whitespace-nowrap bg-blue-600 text-white' : 'whitespace-nowrap border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}>{item.label}</Link>;
        })}</nav>
      </div>
    </header>
    <main id="portal-content" tabIndex={-1} className="portal-main mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
  </div>;
}
