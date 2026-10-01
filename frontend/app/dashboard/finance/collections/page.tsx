"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { PageHero, SectionCard, StatusBanner } from "../../components/DashboardPageKit";

type Account = { id: string; name: string; bankName: string | null; agency: string | null; accountNumber: string | null };
type Agreement = {
  id: string; bankAccountId: string; transmissionCode: string; beneficiaryName: string;
  beneficiaryDocument: string; agency: string; agencyDigit: string; accountNumber: string;
  accountDigit: string; walletCode: string; documentType: string; homologated: boolean;
};
type Receivable = { id: string; description: string; dueDate: string; netAmount: number; paidAmount: number; client: { companyName: string } | null; fiscalDocuments: { id: string; kind: "NFE" | "NFSE"; status: string; number: string | null }[] };
type Title = {
  id: string; bankAccountId: string; documentNumber: string; ourNumber: string; status: string;
  invoiceNumber: string | null; invoiceIssuedAt: string | null; lastMessage: string | null;
  invoiceAccessKey: string | null; invoiceUrl: string | null;
  receivable: Receivable;
};
type Batch = { id: string; agreementId: string; fileName: string; status: string; createdAt: string; sentAt: string | null; items: { titleId: string }[] };
type ReturnFile = { id: string; agreementId: string; fileName: string; importedAt: string; events: { id: string }[] };
type Event = { id: string; importId: string; titleId: string | null; movementCode: string; reasonCodes: string | null; amount: number; outcome: string; message: string; eventDate: string | null; title: { documentNumber: string } | null };
type Overview = { accounts: Account[]; agreements: Agreement[]; unprepared: Receivable[]; titles: Title[]; batches: Batch[]; returns: ReturnFile[]; events: Event[] };

const button = "rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45";
const secondary = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45";
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const emptyAgreement = { transmissionCode: "", beneficiaryName: "", beneficiaryDocument: "", agency: "", agencyDigit: "", accountNumber: "", accountDigit: "", walletCode: "1", documentType: "2", homologated: false };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const statusLabel: Record<string, string> = { DRAFT: "Pronto para remessa", GENERATED: "Remessa gerada", SENT: "Enviado ao banco", REGISTERED: "Registrado", REJECTED: "Rejeitado", PAID: "Liquidado", APPLIED: "Tratado", PENDING_REVIEW: "Revisar", NEEDS_REVIEW: "Revisar", PENDING_SETTLEMENT: "Baixa pendente" };

export default function CollectionsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [agreement, setAgreement] = useState(emptyAgreement);
  const [selected, setSelected] = useState<string[]>([]);
  const [returnFile, setReturnFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [invoiceTitleId, setInvoiceTitleId] = useState("");
  const [invoiceDraft, setInvoiceDraft] = useState({ number: "", issuedAt: "", accessKey: "", url: "" });

  const reload = useCallback(async () => {
    const response = await apiFetch(apiUrl("/finance/collections/overview"), { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível carregar a cobrança."));
    const result = await response.json() as Overview;
    setData(result);
    setAccountId((current) => current || result.agreements[0]?.bankAccountId || result.accounts[0]?.id || "");
  }, []);

  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar cobrança.")); }, [reload]);
  useEffect(() => {
    const configured = data?.agreements.find((item) => item.bankAccountId === accountId);
    setAgreement(configured ? {
      transmissionCode: configured.transmissionCode, beneficiaryName: configured.beneficiaryName,
      beneficiaryDocument: configured.beneficiaryDocument, agency: configured.agency,
      agencyDigit: configured.agencyDigit, accountNumber: configured.accountNumber,
      accountDigit: configured.accountDigit, walletCode: configured.walletCode,
      documentType: configured.documentType, homologated: configured.homologated,
    } : emptyAgreement);
    setSelected([]);
  }, [accountId, data]);

  const currentAgreement = data?.agreements.find((item) => item.bankAccountId === accountId);
  const titles = useMemo(() => data?.titles.filter((item) => item.bankAccountId === accountId) || [], [data, accountId]);
  const ready = titles.filter((item) => ["DRAFT", "REJECTED"].includes(item.status));
  const batches = data?.batches.filter((item) => item.agreementId === currentAgreement?.id) || [];
  const returns = data?.returns.filter((item) => item.agreementId === currentAgreement?.id) || [];
  const returnIds = new Set(returns.map((item) => item.id));
  const events = data?.events.filter((item) => returnIds.has(item.importId)) || [];
  const review = events.filter((item) => ["NEEDS_REVIEW", "PENDING_REVIEW"].includes(item.outcome));

  async function mutate(path: string, method: string, body?: unknown, success = "Atualizado.") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(apiUrl(path), { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível concluir a operação."));
      const result = await response.json();
      await reload();
      setNotice(success);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
      return null;
    } finally { setBusy(false); }
  }

  async function download(batch: Batch) {
    setError("");
    try {
      const response = await apiFetch(apiUrl(`/finance/collections/batches/${batch.id}/download`));
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Falha ao baixar remessa."));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = batch.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao baixar remessa."); }
  }

  async function importReturn() {
    if (!returnFile || !accountId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("bankAccountId", accountId); form.append("file", returnFile);
      const response = await apiFetch(apiUrl("/finance/collections/returns/import"), { method: "POST", body: form });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível importar o retorno."));
      const result = await response.json() as { events: Event[] };
      setReturnFile(null); await reload();
      setNotice(`Retorno importado: ${result.events.length} ocorrência(s). Confira a fila de revisão.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao importar retorno."); }
    finally { setBusy(false); }
  }

  return <main className="space-y-5 pb-10">
    <PageHero eyebrow="FINANCEIRO / COBRANÇA" title="Boletos Santander" description="Prepare títulos, gere a remessa CNAB 240, envie pelo banco e importe o retorno para atualizar o contas a receber." compact
      stats={[
        { label: "Para preparar", value: String(data?.unprepared.length || 0), tone: "blue" },
        { label: "Para remessa", value: String(ready.length), tone: "amber" },
        { label: "Enviadas", value: String(batches.filter((item) => item.status === "SENT").length), tone: "emerald" },
        { label: "Para revisar", value: String(review.length), tone: "rose" },
      ]}
      actions={<div className="flex flex-wrap gap-2"><Link className={secondary} href="/dashboard/finance/fiscal-documents">Notas fiscais</Link><Link className={secondary} href="/dashboard/finance/accounts-receivable">Contas a receber</Link></div>} />

    {error && <StatusBanner tone="rose">{error}</StatusBanner>}
    {notice && <StatusBanner tone="emerald">{notice}</StatusBanner>}

    <SectionCard title="1. Conta e convênio" description="Escolha a conta de cobrança Santander. Os dados do convênio devem coincidir com os fornecidos pelo banco."
      actions={<button className={secondary} onClick={() => setShowSettings(!showSettings)}>{showSettings ? "Fechar configuração" : "Configurar convênio"}</button>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block text-sm font-semibold text-slate-700">Conta bancária
          <select className={`${input} mt-2`} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {data?.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.bankName || "Banco não informado"}</option>)}
          </select>
        </label>
        <span className={`rounded-xl px-3 py-2 text-sm font-semibold ${currentAgreement?.homologated ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {currentAgreement ? currentAgreement.homologated ? "Convênio homologado" : "Aguardando homologação" : "Convênio não configurado"}
        </span>
      </div>
      {showSettings && <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
        {([ ["transmissionCode", "Código de transmissão (15 dígitos)"], ["beneficiaryName", "Nome do beneficiário"], ["beneficiaryDocument", "CPF/CNPJ do beneficiário"], ["agency", "Agência (4 dígitos)"], ["agencyDigit", "Dígito da agência"], ["accountNumber", "Conta (9 dígitos)"], ["accountDigit", "Dígito da conta"] ] as const).map(([key, label]) =>
          <label key={key} className="text-xs font-semibold text-slate-700">{label}<input className={`${input} mt-1`} value={agreement[key]} onChange={(event) => setAgreement((previous) => ({ ...previous, [key]: event.target.value }))} /></label>)}
        <label className="text-xs font-semibold text-slate-700">Carteira<select className={`${input} mt-1`} value={agreement.walletCode} onChange={(event) => setAgreement((previous) => ({ ...previous, walletCode: event.target.value }))}><option value="1">1 · Simples eletrônica</option><option value="3">3 · Caucionada</option><option value="5">5 · Simples rápida com registro</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Tipo do documento<select className={`${input} mt-1`} value={agreement.documentType} onChange={(event) => setAgreement((previous) => ({ ...previous, documentType: event.target.value }))}><option value="2">2 · Tradicional</option><option value="1">1 · Escritural</option></select></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={agreement.homologated} onChange={(event) => setAgreement((previous) => ({ ...previous, homologated: event.target.checked }))} /> Arquivo validado no ambiente do banco</label>
        <div className="md:col-span-3"><button disabled={busy || !accountId} className={button} onClick={() => void mutate("/finance/collections/agreement", "POST", { bankAccountId: accountId, ...agreement }, "Convênio salvo.")}>Salvar convênio</button></div>
      </div>}
    </SectionCard>

    <SectionCard title="2. Preparar boletos" description="O boleto usa o cliente, endereço de cobrança, vencimento e saldo já existentes no contas a receber.">
      {!data?.unprepared.length ? <p className="text-sm text-slate-500">Nenhum título em aberto aguardando preparação.</p> : <div className="max-h-72 space-y-2 overflow-auto">
        {data.unprepared.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <div><p className="font-semibold text-slate-900">{item.client?.companyName || "Cliente"} · {item.description}</p><p className="text-xs text-slate-500">Vence {date(item.dueDate)} · {money(Number(item.netAmount) - Number(item.paidAmount))}</p></div>
          <button className={secondary} disabled={busy || !currentAgreement} onClick={() => void mutate("/finance/collections/titles", "POST", { receivableId: item.id, bankAccountId: accountId }, "Boleto preparado.")}>Preparar boleto</button>
        </div>)}
      </div>}
    </SectionCard>

    <SectionCard title="3. Conferir e gerar remessa" description="Selecione os boletos prontos. O arquivo pode ser baixado novamente no histórico abaixo.">
      <div className="space-y-2">
        {titles.length === 0 && <p className="text-sm text-slate-500">Nenhum boleto preparado para esta conta.</p>}
        {titles.map((title) => <div key={title.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 text-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
          <input aria-label={`Selecionar boleto ${title.documentNumber}`} type="checkbox" disabled={!ready.includes(title)} checked={selected.includes(title.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, title.id] : previous.filter((id) => id !== title.id))} />
          <div className="min-w-0"><p className="font-semibold text-slate-900">{title.receivable.client?.companyName || "Cliente"} · {title.documentNumber}</p><p className="text-xs text-slate-500">Nosso número {title.ourNumber} · {money(Number(title.receivable.netAmount) - Number(title.receivable.paidAmount))} · Vence {date(title.receivable.dueDate)}</p><p className="text-xs text-slate-500">{title.receivable.fiscalDocuments.length ? title.receivable.fiscalDocuments.map((item) => `${item.kind === "NFE" ? "NF-e" : "NFS-e"} ${item.number || "rascunho"} (${item.status === "DRAFT" ? "sem valor fiscal" : item.status})`).join(" · ") : title.invoiceNumber ? `NF anterior ${title.invoiceNumber}` : "Nota fiscal pendente"} · {statusLabel[title.status] || title.status}{title.lastMessage ? ` · ${title.lastMessage}` : ""}</p></div>
          <button className={secondary} disabled={busy} onClick={() => {
            setInvoiceTitleId(title.id);
            setInvoiceDraft({ number: title.invoiceNumber || "", issuedAt: title.invoiceIssuedAt?.slice(0, 10) || "", accessKey: title.invoiceAccessKey || "", url: title.invoiceUrl || "" });
          }}>NF anterior</button>
        </div>)}
      </div>
      {invoiceTitleId && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-bold text-slate-900">Referência da nota fiscal</p>
        <p className="mt-1 text-xs text-slate-600">Referência de notas já emitidas antes da integração fiscal do GridOne. Novos rascunhos de NF-e e NFS-e ficam na área Notas Fiscais.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Número da NF<input className={`${input} mt-1`} value={invoiceDraft.number} onChange={(event) => setInvoiceDraft((previous) => ({ ...previous, number: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-slate-700">Data de emissão<input className={`${input} mt-1`} type="date" value={invoiceDraft.issuedAt} onChange={(event) => setInvoiceDraft((previous) => ({ ...previous, issuedAt: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-slate-700">Chave de acesso, se houver<input className={`${input} mt-1`} value={invoiceDraft.accessKey} onChange={(event) => setInvoiceDraft((previous) => ({ ...previous, accessKey: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-slate-700">Link HTTPS da NF, se houver<input className={`${input} mt-1`} type="url" value={invoiceDraft.url} onChange={(event) => setInvoiceDraft((previous) => ({ ...previous, url: event.target.value }))} /></label>
        </div>
        <div className="mt-3 flex gap-2"><button className={button} disabled={busy || (!!invoiceDraft.number && !invoiceDraft.issuedAt)} onClick={() => void mutate(`/finance/collections/titles/${invoiceTitleId}/invoice`, "PATCH", invoiceDraft, "Referência da NF salva.").then((result) => { if (result) setInvoiceTitleId(""); })}>Salvar NF</button><button className={secondary} onClick={() => setInvoiceTitleId("")}>Cancelar</button></div>
      </div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><button className={button} disabled={busy || selected.length === 0 || !currentAgreement} onClick={() => void mutate("/finance/collections/batches", "POST", { bankAccountId: accountId, titleIds: selected }, "Remessa gerada. Baixe o arquivo no histórico e envie ao banco.")}>Gerar remessa ({selected.length})</button><span className="text-xs text-slate-500">A geração não envia o arquivo ao banco automaticamente.</span></div>
    </SectionCard>

    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="4. Remessas" description="Baixe o arquivo, envie no Santander e marque o envio para controle da equipe.">
        <div className="space-y-2">{!batches.length && <p className="text-sm text-slate-500">Nenhuma remessa gerada.</p>}{batches.map((batch) => <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><div><p className="font-semibold">{batch.fileName} · {batch.items.length} boleto(s)</p><p className="text-xs text-slate-500">{date(batch.createdAt)} · {batch.status === "SENT" ? "Enviada" : "Aguardando envio"}</p></div><div className="flex gap-2"><button className={secondary} onClick={() => void download(batch)}>Baixar</button>{batch.status === "GENERATED" && <button disabled={busy} className={secondary} onClick={() => void mutate(`/finance/collections/batches/${batch.id}/sent`, "POST", undefined, "Remessa marcada como enviada.")}>Marcar enviada</button>}</div></div>)}</div>
      </SectionCard>
      <SectionCard title="5. Retorno do banco" description="Importe o arquivo de retorno da mesma conta. Registros, rejeições e liquidações serão vinculados aos boletos.">
        <div className="flex flex-wrap items-center gap-3"><input aria-label="Arquivo de retorno CNAB 240" className="max-w-full text-sm" type="file" accept=".RET,.ret,.txt" onChange={(event) => setReturnFile(event.target.files?.[0] || null)} /><button className={button} disabled={busy || !returnFile || !currentAgreement} onClick={() => void importReturn()}>Importar retorno</button></div>
        <div className="mt-4 space-y-2">{!returns.length && <p className="text-sm text-slate-500">Nenhum retorno importado.</p>}{returns.map((file) => <div key={file.id} className="rounded-xl border border-slate-200 p-3 text-sm"><strong>{file.fileName}</strong><span className="ml-2 text-slate-500">{file.events.length} ocorrência(s) · {date(file.importedAt)}</span></div>)}</div>
      </SectionCard>
    </div>

    <SectionCard title="Ocorrências para conferir" description="Divergências de identificação, valores e movimentos que exigem avaliação do financeiro.">
      {!review.length ? <p className="text-sm text-slate-500">Nenhuma ocorrência pendente de revisão nesta conta.</p> : <div className="space-y-2">{review.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><div><p className="font-semibold text-amber-950">{event.title?.documentNumber || "Boleto não identificado"} · ocorrência {event.movementCode} · {money(event.amount)}</p><p className="text-amber-900">{event.message}{event.reasonCodes ? ` · Motivos: ${event.reasonCodes}` : ""}</p></div>{event.outcome === "NEEDS_REVIEW" && event.movementCode === "06" && <button className={secondary} disabled={busy} onClick={() => void mutate(`/finance/collections/events/${event.id}/apply`, "POST", undefined, "Baixa reavaliada.")}>Tentar baixa novamente</button>}</div>)}</div>}
    </SectionCard>
  </main>;
}
