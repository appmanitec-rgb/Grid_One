"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  DataPill,
  PageHero,
  SectionCard,
  StatusBanner,
} from "../../../components/DashboardPageKit";

type ClientOption = { id: string; companyName: string; cnpj?: string | null };
type SellerOption = { id: string; name: string; email?: string | null };

const INPUT =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400";

export default function ExternalProposalPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [sellerQuery, setSellerQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [type, setType] = useState("GENERATOR_SALE");
  const [reference, setReference] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [amount, setAmount] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [scope, setScope] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({ take: "10" });
      if (clientQuery.trim()) params.set("q", clientQuery.trim());
      const response = await apiFetch(`/clients/lookup?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) setClients(await response.json());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [clientQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({ take: "10" });
      if (sellerQuery.trim()) params.set("q", sellerQuery.trim());
      const response = await apiFetch(`/crm/sellers?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) setSellers(await response.json());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [sellerQuery]);

  const numericAmount = useMemo(
    () => Number(amount.replace(",", ".") || 0),
    [amount],
  );

  async function submit() {
    if (
      !clientId ||
      !sellerId ||
      !reference.trim() ||
      numericAmount <= 0 ||
      !file
    ) {
      setError(
        "Selecione cliente e vendedor, informe referencia, valor e anexe o documento externo.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await apiFetch("/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          userId: sellerId,
          type,
          origin: "EXTERNAL",
          externalReference: reference.trim(),
          externalCurrency: currency.trim().toUpperCase(),
          totalValue: numericAmount,
          paymentTerm: paymentTerm || undefined,
          validUntil: validUntil || undefined,
          scope:
            scope ||
            `Proposta externa ${reference.trim()}. Consulte o documento anexado.`,
          items: [
            {
              kind: "OTHER",
              description: `Proposta externa ${reference.trim()}`,
              quantity: 1,
              unitPrice: numericAmount,
            },
          ],
        }),
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Falha ao cadastrar proposta externa.",
          ),
        );
      const proposal = (await response.json()) as { id: string };
      const formData = new FormData();
      formData.append("file", file);
      const upload = await apiFetch(
        `/proposals/${proposal.id}/external-document`,
        { method: "POST", body: formData },
      );
      if (!upload.ok)
        throw new Error(
          await readApiErrorMessage(
            upload,
            "A proposta foi criada, mas o anexo nao foi enviado.",
          ),
        );
      router.push(`/dashboard/proposals/${proposal.id}`);
    } catch (submissionError: unknown) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Falha ao cadastrar proposta externa.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Comercial / Propostas externas"
        title="Cadastrar proposta externa"
        description="Registre os dados comerciais essenciais e preserve o documento original sem recriar seu conteudo no Manitec."
        actions={
          <Link
            href="/dashboard/proposals"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Voltar
          </Link>
        }
      />
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      <SectionCard
        title="Origem e classificacao"
        description="A proposta externa participa do mesmo funil, aprovacoes, alertas e historico das propostas Manitec."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Origem">
            <div className="mt-2">
              <DataPill tone="amber">Externa</DataPill>
            </div>
          </Field>
          <Field label="Carteira">
            <select
              className={INPUT}
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="GENERATOR_SALE">Venda de gerador</option>
              <option value="PARTS_AND_SERVICES">Pecas e servicos</option>
              <option value="CONTRACT">Contrato</option>
            </select>
          </Field>
          <Field label="Numero / referencia externa">
            <input
              className={INPUT}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex.: 53390"
            />
          </Field>
        </div>
      </SectionCard>
      <SectionCard
        title="Cliente e responsavel"
        description="Vincule o documento externo aos mesmos cadastros usados pelo fluxo comercial."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Lookup
            label="Cliente"
            query={clientQuery}
            setQuery={(value) => {
              setClientQuery(value);
              setClientId("");
            }}
            selected={Boolean(clientId)}
          >
            {!clientId
              ? clients.map((client) => (
                  <Option
                    key={client.id}
                    title={client.companyName}
                    helper={client.cnpj || "Cliente"}
                    onClick={() => {
                      setClientId(client.id);
                      setClientQuery(client.companyName);
                    }}
                  />
                ))
              : null}
          </Lookup>
          <Lookup
            label="Vendedor"
            query={sellerQuery}
            setQuery={(value) => {
              setSellerQuery(value);
              setSellerId("");
            }}
            selected={Boolean(sellerId)}
          >
            {!sellerId
              ? sellers.map((seller) => (
                  <Option
                    key={seller.id}
                    title={seller.name}
                    helper={seller.email || "Comercial"}
                    onClick={() => {
                      setSellerId(seller.id);
                      setSellerQuery(seller.name);
                    }}
                  />
                ))
              : null}
          </Lookup>
        </div>
      </SectionCard>
      <SectionCard
        title="Valores e documento"
        description="O valor e o arquivo ficam congelados no registro desta proposta."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Moeda">
            <input
              className={INPUT}
              value={currency}
              maxLength={3}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </Field>
          <Field label="Valor total">
            <input
              className={INPUT}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Validade">
            <input
              className={INPUT}
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
          <Field label="Condicao de pagamento">
            <input
              className={INPUT}
              value={paymentTerm}
              onChange={(event) => setPaymentTerm(event.target.value)}
            />
          </Field>
          <Field label="Documento PDF ou DOCX">
            <input
              className={INPUT}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </Field>
          <Field label="Resumo do escopo">
            <textarea
              className={INPUT}
              rows={4}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="mt-6 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? "Cadastrando..." : "Cadastrar proposta externa"}
        </button>
      </SectionCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
      {label}
      {children}
    </label>
  );
}
function Lookup({
  label,
  query,
  setQuery,
  selected,
  children,
}: {
  label: string;
  query: string;
  setQuery: (value: string) => void;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </label>
      <input
        className={INPUT}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!selected ? (
        <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}
function Option({
  title,
  helper,
  onClick,
}: {
  title: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-sky-50"
    >
      <span className="block text-sm font-bold text-slate-900">{title}</span>
      <span className="text-xs text-slate-500">{helper}</span>
    </button>
  );
}
