"use client";
import { canUsePortfolio } from "@/lib/access-rules";

import { SelectField } from "@/app/dashboard/components/SelectField";
import Link from "next/link";
import PaymentPlanEditor from "../../PaymentPlanEditor";
import { type ProposalPaymentPlan } from "@/lib/proposal-payment-plan";
import { commercialLabel } from "@/lib/commercial-labels";
import {
  ProposalSteps,
  ProposalFinancialDock,
  ProposalFormSection,
  focusProposalStep,
} from "../../../components/ProposalFormFlow";
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

const EXTERNAL_STEPS = [
  {
    title: "Dados comerciais",
    description: "Cliente, responsável e referência",
  },
  { title: "Valores e arquivo", description: "Pagamento e documento original" },
  { title: "Revisão", description: "Confira antes de cadastrar" },
];
export default function ExternalProposalPage() {
  const [accessReady, setAccessReady] = useState(false);
  useEffect(() => setAccessReady(true), []);

  const [step, setStep] = useState(0);
  function changeStep(next: number) {
    setStep(next);
    setError("");
    focusProposalStep();
  }
  function nextStep() {
    if (step === 0 && (!clientId || !sellerId || !reference.trim())) {
      setError(
        "Selecione o cliente, o vendedor e informe a referência externa.",
      );
      focusProposalStep();
      return;
    }
    if (
      step === 1 &&
      (!Number.isFinite(numericAmount) ||
        numericAmount <= 0 ||
        !file ||
        !/^[A-Z]{3}$/.test(currency))
    ) {
      setError(
        "Informe um valor maior que zero, uma moeda válida e anexe o documento original.",
      );
      focusProposalStep();
      return;
    }
    changeStep(step + 1);
  }
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [sellerQuery, setSellerQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [type, setType] = useState(
    canUsePortfolio("generators")
      ? "GENERATOR_SALE"
      : canUsePortfolio("partsServices")
        ? "PARTS_AND_SERVICES"
        : "CONTRACT",
  );
  const [reference, setReference] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [amount, setAmount] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<ProposalPaymentPlan | null>(
    null,
  );
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
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !/^[A-Z]{3}$/.test(currency) ||
      !file
    ) {
      setStep(!clientId || !sellerId || !reference.trim() ? 0 : 1);
      focusProposalStep();
      setError(
        "Selecione cliente e vendedor, informe referência, valor e anexe o documento externo.",
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
          paymentPlan: paymentPlan || undefined,
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

  if (!accessReady)
    return (
      <div className="dashboard-page p-6 text-sm text-slate-500">
        Carregando permissões...
      </div>
    );
  return (
    <div className="dashboard-page proposal-flow-page space-y-5">
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
      <ProposalSteps
        steps={EXTERNAL_STEPS}
        current={step}
        onChange={changeStep}
      />
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {step === 0 ? (
        <div className="space-y-5">
          <SectionCard
            title="Referência e tipo da proposta"
            description="A proposta externa participa do mesmo funil, aprovacoes, alertas e historico das propostas Manitec."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Origem">
                <div className="mt-2">
                  <DataPill tone="amber">Externa</DataPill>
                </div>
              </Field>
              <Field label="Carteira">
                <SelectField
                  className={INPUT}
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {canUsePortfolio("generators") ? (
                    <option value="GENERATOR_SALE">Venda de gerador</option>
                  ) : null}
                  {canUsePortfolio("partsServices") ? (
                    <option value="PARTS_AND_SERVICES">Peças e serviços</option>
                  ) : null}
                  {canUsePortfolio("contracts") ? (
                    <option value="CONTRACT">Contrato</option>
                  ) : null}
                </SelectField>
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
                  ? clients.slice(0, 10).map((client) => (
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
                  ? sellers.slice(0, 10).map((seller) => (
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
        </div>
      ) : null}
      {step === 1 ? (
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
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
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
            <div className="md:col-span-3">
              <PaymentPlanEditor
                value={paymentPlan}
                onChange={setPaymentPlan}
                paymentTerm={paymentTerm}
                onTermChange={setPaymentTerm}
                total={numericAmount}
              />
            </div>
            <Field label="Documento PDF ou DOCX">
              <input
                className={INPUT}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              {file ? (
                <p className="mt-2 text-xs text-emerald-700">
                  Arquivo selecionado: {file.name}
                </p>
              ) : null}
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
        </SectionCard>
      ) : null}
      {step === 2 ? (
        <ProposalFormSection
          title="Confira a proposta externa"
          description="O arquivo original será anexado ao cadastro."
        >
          <dl className="proposal-review-grid">
            <div>
              <dt>Cliente</dt>
              <dd>{clientQuery || "Não selecionado"}</dd>
            </div>
            <div>
              <dt>Vendedor</dt>
              <dd>{sellerQuery || "Não selecionado"}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{commercialLabel(type)}</dd>
            </div>
            <div>
              <dt>Referência</dt>
              <dd>{reference || "Não informada"}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{commercialLabel(paymentTerm, "A combinar")}</dd>
            </div>
            <div>
              <dt>Documento original</dt>
              <dd>{file?.name || "Nenhum arquivo selecionado"}</dd>
            </div>
          </dl>
        </ProposalFormSection>
      ) : null}
      <ProposalFinancialDock
        lines={[{ label: "Valor informado", value: numericAmount }]}
        total={numericAmount}
        currency={currency}
        payment={commercialLabel(paymentTerm, "Pagamento a definir")}
        current={step}
        steps={EXTERNAL_STEPS.length}
        onBack={() => changeStep(step - 1)}
        onNext={nextStep}
        onSave={() => void submit()}
        saving={submitting}
        saveLabel="Cadastrar proposta externa"
      />
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
