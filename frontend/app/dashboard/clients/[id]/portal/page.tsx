'use client';

import { PageHeader } from "../../../components/DashboardPageKit";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import ClientPortalAdminPanel from '../ClientPortalAdminPanel';

export default function ClientPortalManagementPage() {
  const params = useParams<{ id?: string | string[] }>();
  const clientId = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!clientId) {
    return <main className="mx-auto max-w-6xl p-6"><p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Cliente não informado.</p></main>;
  }

  return <main className="dashboard-page space-y-5">
    <nav aria-label="Caminho" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
      <Link href="/dashboard/clients" className="hover:text-blue-700">Clientes</Link>
      <span>/</span>
      <Link href={'/dashboard/clients/' + clientId} className="hover:text-blue-700">Perfil do cliente</Link>
      <span>/</span>
      <span className="text-slate-900">Central do cliente</span>
    </nav>
    <PageHeader
        eyebrow="Clientes"
        title="Gerenciar central do cliente"
        description="Configure o acesso apenas quando este cliente utilizar a central."
        actions={<>
<Link href={'/dashboard/clients/' + clientId} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700">Voltar ao cliente</Link>
</>}
      />
    <ClientPortalAdminPanel clientId={clientId} />
  </main>;
}
