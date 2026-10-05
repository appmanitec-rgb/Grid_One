"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { PageHero, SectionCard, StatusBanner } from "../../components/DashboardPageKit";
import FiscalCertificateManager from "./FiscalCertificateManager";

type Kind = "NFE" | "NFSE";
type Item = { description: string; quantity: number; unitAmount: number; ncm: string; cfop: string; serviceCode: string };
type Draft = { receivableId: string; issuerCompanyId: string; kind: Kind; items: Item[]; fiscalNotes: string };
type Receivable = { id: string; description: string; grossAmount: number; dueDate: string; client: { companyName: string; cnpj: string | null } };
type FiscalDocument = {
  id: string; receivableId: string; issuerCompanyId: string | null; kind: Kind; status: string; items: Item[];
  totalAmount: number; fiscalNotes: string | null; number: string | null;
  accessKey: string | null; checklist: string[]; createdAt: string;
  issuerSnapshot: { name: string | null; cnpj: string | null };
  receivable: { description: string; client: { companyName: string } };
};
type Issuer = { id: string; companyName: string | null; cnpj: string | null; stateRegistration: string | null;
  municipalRegistration: string | null; taxRegime: string | null; city: string | null; state: string | null; isPrimary: boolean;
  readiness: { NFE: string[]; NFSE: string[] } };
type Overview = {
  issuers: Issuer[];
  receivables: Receivable[]; documents: FiscalDocument[]; issuanceConfigured: boolean;
};

const blankItem = (): Item => ({ description: "", quantity: 1, unitAmount: 0, ncm: "", cfop: "", serviceCode: "" });
const blankDraft = (): Draft => ({ receivableId: "", issuerCompanyId: "", kind: "NFSE", items: [blankItem()], fiscalNotes: "" });
const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primary = "rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const kindName: Record<Kind, string> = { NFE: "NF-e · produtos", NFSE: "NFS-e · serviços" };

export default function FiscalDocumentsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    const response = await apiFetch(apiUrl("/finance/fiscal-documents/overview"), { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível carregar a área fiscal."));
    setData(await response.json() as Overview);
  }, []);

  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar notas.")); }, [reload]);

  const matchingReceivables = useMemo(() => data?.receivables.filter((item) =>
    `${item.client.companyName} ${item.client.cnpj || ""} ${item.description}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) || [], [data, search]);
  const total = draft.items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * Number(item.unitAmount || 0) * 100), 0) / 100;
  const selectedReceivable = data?.receivables.find((item) => item.id === draft.receivableId);
  const selectedIssuer = data?.issuers.find((item) => item.id === draft.issuerCompanyId);

  function updateItem(index: number, key: keyof Item, value: string) {
    setDraft((current) => ({ ...current, items: current.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [key]: key === "quantity" || key === "unitAmount" ? Number(value) : value } : item) }));
  }

  function edit(document: FiscalDocument) {
    setEditingId(document.id);
    setDraft({
      receivableId: document.receivableId, issuerCompanyId: document.issuerCompanyId || "", kind: document.kind,
      fiscalNotes: document.fiscalNotes || "",
      items: document.items.map((item) => ({ ...blankItem(), ...item })),
    });
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await apiFetch(apiUrl(editingId ? `/finance/fiscal-documents/drafts/${editingId}` : "/finance/fiscal-documents/drafts"), {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível salvar o rascunho fiscal."));
      await reload();
      setDraft(blankDraft()); setEditingId("");
      setNotice("Rascunho salvo. Confira a lista de pendências antes da emissão.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar rascunho."); }
    finally { setBusy(false); }
  }

  return <main className="space-y-5 pb-10">
    <PageHero eyebrow="FINANCEIRO / FISCAL" title="Notas fiscais" description="Prepare NF-e de produtos e NFS-e de serviços vinculadas ao contas a receber. Cada nota mantém seus próprios itens e histórico." compact
      stats={[
        { label: "Rascunhos", value: String(data?.documents.filter((item) => item.status === "DRAFT").length || 0), tone: "blue" },
        { label: "Autorizadas", value: String(data?.documents.filter((item) => item.status === "AUTHORIZED").length || 0), tone: "emerald" },
        { label: "Contas a receber", value: String(data?.receivables.length || 0), tone: "amber" },
      ]}
      actions={<Link className={secondary} href="/dashboard/finance/collections">Cobrança Santander</Link>} />

    {error && <StatusBanner tone="rose">{error}</StatusBanner>}
    {notice && <StatusBanner tone="emerald">{notice}</StatusBanner>}
    <StatusBanner tone="amber">A emissão fiscal ainda não está conectada. Os rascunhos desta página não são notas autorizadas. A transmissão será liberada após configurar a integração e homologar os dados tributários.</StatusBanner>

    <FiscalCertificateManager issuers={data?.issuers || []} onInstalled={reload} />

    <SectionCard title="1. Escolher emitente" description="Selecione o CNPJ que emitirá esta nota. Os dados da empresa escolhida ficam registrados no rascunho.">
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        {data?.issuers.length || 0} empresa(s) cadastrada(s). Para operar com os dois CNPJs, complete os dois cadastros fiscais e homologue cada tipo de nota separadamente.
      </div>
      <label className="mb-4 block max-w-xl text-xs font-semibold uppercase tracking-wide text-slate-600">Empresa emitente
        <select className={`${field} mt-1`} value={draft.issuerCompanyId} onChange={(event) => setDraft((current) => ({ ...current, issuerCompanyId: event.target.value }))}>
          <option value="">Selecione o CNPJ emitente</option>
          {data?.issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.companyName || "Empresa sem nome"} · {issuer.cnpj || "CNPJ pendente"}</option>)}
        </select>
      </label>
      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Empresa", selectedIssuer?.companyName || "Selecione acima"],
          ["CNPJ", selectedIssuer?.cnpj || "Pendente"],
          ["Regime tributário", selectedIssuer?.taxRegime || "Pendente"],
          ["Município / UF", [selectedIssuer?.city, selectedIssuer?.state].filter(Boolean).join(" / ") || "Pendente"],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>)}
      </div>
      <Link href="/dashboard/company-settings" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">Revisar cadastro da empresa</Link>
      {selectedIssuer && <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(["NFE", "NFSE"] as const).map((kind) => <div key={kind} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-950">{kind === "NFE" ? "NF-e de produtos" : "NFS-e de serviços"} · pendências</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-950">{selectedIssuer.readiness[kind].map((item) => <li key={item}>• {item}</li>)}</ul>
        </div>)}
      </div>}
    </SectionCard>

    <SectionCard title={editingId ? "2. Editar rascunho" : "2. Preparar nota"} description="Selecione a conta a receber e descreva separadamente os produtos ou serviços. Os códigos fiscais exigem conferência da contabilidade.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Buscar conta a receber</label>
          <input className={`${field} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, CNPJ ou descrição" disabled={!!editingId} />
          <select className={`${field} mt-2`} value={draft.receivableId} disabled={!!editingId} onChange={(event) => setDraft((current) => ({ ...current, receivableId: event.target.value }))}>
            <option value="">Selecione a conta</option>
            {matchingReceivables.map((item) => <option key={item.id} value={item.id}>{item.client.companyName} · {item.description} · {money(item.grossAmount)}</option>)}
            {selectedReceivable && !matchingReceivables.some((item) => item.id === selectedReceivable.id) && <option value={selectedReceivable.id}>{selectedReceivable.client.companyName} · {selectedReceivable.description}</option>}
          </select>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tipo de nota
          <select className={`${field} mt-1`} value={draft.kind} disabled={!!editingId} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as Kind, items: [blankItem()] }))}>
            <option value="NFSE">NFS-e · serviços</option><option value="NFE">NF-e · produtos</option>
          </select>
        </label>
      </div>
      <div className="mt-5 space-y-3">
        {draft.items.map((item, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between"><strong className="text-sm text-slate-900">Item {index + 1}</strong><button className="text-xs font-semibold text-rose-700 disabled:opacity-40" disabled={draft.items.length === 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>Remover</button></div>
          <div className="grid gap-3 md:grid-cols-6">
            <label className="text-xs font-semibold text-slate-600 md:col-span-3">Descrição<input className={`${field} mt-1`} value={item.description} maxLength={500} onChange={(event) => updateItem(index, "description", event.target.value)} /></label>
            <label className="text-xs font-semibold text-slate-600">Quantidade<input className={`${field} mt-1`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">Valor unitário (R$)<input className={`${field} mt-1`} type="number" min="0.01" step="0.01" value={item.unitAmount} onChange={(event) => updateItem(index, "unitAmount", event.target.value)} /></label>
            {draft.kind === "NFE" ? <>
              <label className="text-xs font-semibold text-slate-600 md:col-span-2">NCM<input className={`${field} mt-1`} inputMode="numeric" maxLength={8} value={item.ncm || ""} onChange={(event) => updateItem(index, "ncm", event.target.value)} /></label>
              <label className="text-xs font-semibold text-slate-600 md:col-span-2">CFOP<input className={`${field} mt-1`} inputMode="numeric" maxLength={4} value={item.cfop || ""} onChange={(event) => updateItem(index, "cfop", event.target.value)} /></label>
            </> : <label className="text-xs font-semibold text-slate-600 md:col-span-3">Código fiscal do serviço<input className={`${field} mt-1`} maxLength={20} value={item.serviceCode || ""} onChange={(event) => updateItem(index, "serviceCode", event.target.value)} /></label>}
            <p className="self-end text-sm font-semibold text-slate-900 md:col-span-2">Total: {money(Number(item.quantity || 0) * Number(item.unitAmount || 0))}</p>
          </div>
        </div>)}
      </div>
      <button className={`${secondary} mt-3`} disabled={draft.items.length >= 50} onClick={() => setDraft((current) => ({ ...current, items: [...current.items, blankItem()] }))}>Adicionar item</button>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-600">Observações para conferência fiscal<textarea className={`${field} mt-1 min-h-20`} maxLength={2000} value={draft.fiscalNotes} onChange={(event) => setDraft((current) => ({ ...current, fiscalNotes: event.target.value }))} /></label>
        <div className="text-right"><p className="mb-2 text-lg font-bold text-slate-950">{money(total)}</p><button className={primary} disabled={busy || !draft.issuerCompanyId || !draft.receivableId || total <= 0 || draft.items.some((item) => !item.description.trim())} onClick={() => void save()}>{editingId ? "Salvar alterações" : "Salvar rascunho"}</button></div>
      </div>
      {editingId && <button className={`${secondary} mt-3`} onClick={() => { setEditingId(""); setDraft(blankDraft()); }}>Cancelar edição</button>}
    </SectionCard>

    <SectionCard title="3. Acompanhar notas" description="Uma mesma conta pode ter rascunhos separados para peças e serviços. A autorização aparecerá aqui quando a integração fiscal estiver ativa.">
      {!data?.documents.length ? <p className="text-sm text-slate-500">Nenhum rascunho fiscal criado.</p> : <div className="grid gap-3 xl:grid-cols-2">
        {data.documents.map((document) => <div key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{kindName[document.kind]}</p><h3 className="mt-1 font-bold text-slate-950">{document.receivable.client.companyName}</h3><p className="text-xs text-slate-500">{document.receivable.description}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{document.status === "DRAFT" ? "Rascunho · sem valor fiscal" : document.status}</span></div>
          <p className="mt-3 text-xs font-semibold text-slate-600">Emitente: {document.issuerSnapshot.name || "Pendente"} · {document.issuerSnapshot.cnpj || "CNPJ pendente"}</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{money(document.totalAmount)}</p>
          <p className="mt-1 text-xs text-slate-500">{document.items.length} item(ns) · criada em {new Date(document.createdAt).toLocaleDateString("pt-BR")}{document.number ? ` · NF ${document.number}` : ""}</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Pendências antes da emissão</p><ul className="mt-2 space-y-1 text-xs text-slate-700">{document.checklist.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          {document.status === "DRAFT" && <button className={`${secondary} mt-3`} onClick={() => edit(document)}>Editar rascunho</button>}
        </div>)}
      </div>}
    </SectionCard>
  </main>;
}
