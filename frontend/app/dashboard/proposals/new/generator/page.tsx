"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, type ControlOption } from "@/lib/control-options";
import {
  DataPill,
  PageHero,
  SectionCard,
  StatusBanner,
} from "../../../components/DashboardPageKit";
import OperationalExpensesEditor, {
  operationalExpensesTotal,
  type OperationalExpenseSelection,
} from "../../OperationalExpensesEditor";

type ClientOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
};

type SellerOption = {
  id: string;
  name: string;
  email?: string | null;
};

type InspectionOption = {
  id: string;
  code: string;
  status: string;
  requiredPowerKva?: number | null;
  voltage?: string | null;
  qtaDistanceMeters?: number | null;
  needsMunck?: boolean;
  accessNotes?: string | null;
  technicalNotes?: string | null;
};

type LinkedOpportunity = {
  id: string;
  title: string;
  opportunityType?: string | null;
  client: ClientOption;
  assignedSeller?: SellerOption | null;
  inspections?: InspectionOption[];
};

type CommercialGeneratorOption = {
  id: string;
  internalCode: string;
  manufacturer: string;
  line?: string | null;
  model: string;
  description?: string | null;
  standbyPowerKw?: number | null;
  standbyPowerKva?: number | null;
  capacityKw?: number | null;
  capacityKva?: number | null;
  reservePercent?: number | null;
  fuelType: string;
  construction: string;
  availability: string;
  stockQuantity: number;
  leadTimeDays?: number | null;
  currency: string;
  commercialPrice: number;
  reasons?: string[];
  warnings?: string[];
  classification?: string;
};

type RecommendationResult = {
  disclaimer: string;
  requiresEngineeringReview: boolean;
  engineeringReviewReasons: string[];
  calculation: {
    requestedPowerKw: number;
    appliedPowerFactor: number;
    marginPercent: number;
    requiredPowerKw: number;
  };
  policy: { id: string; name: string; version: number };
  recommended: CommercialGeneratorOption | null;
  candidates: CommercialGeneratorOption[];
};

type AdditionalItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  enabled: boolean;
};

const STEPS = [
  "Cliente",
  "Necessidade",
  "Equipamento",
  "Configuracao",
  "Instalacao",
  "Comercial",
  "Revisao",
];

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const DRAFT_KEY = "manitec_generator_proposal_draft_v1";

export default function GeneratorProposalWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [linkedOpportunity, setLinkedOpportunity] =
    useState<LinkedOpportunity | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellerSearch, setSellerSearch] = useState("");
  const [sellerId, setSellerId] = useState("");

  const [power, setPower] = useState("");
  const [powerUnit, setPowerUnit] = useState("KW");
  const [voltage, setVoltage] = useState("220 V");
  const [phaseConfiguration, setPhaseConfiguration] = useState("TWO_PHASE");
  const [frequencyHz, setFrequencyHz] = useState("60");
  const [loadType, setLoadType] = useState("MIXED");
  const [application, setApplication] = useState("STANDBY");
  const [fuelPreference, setFuelPreference] = useState("ANY");
  const [constructionPreference, setConstructionPreference] = useState("ANY");
  const [installationLocation, setInstallationLocation] = useState("OUTDOOR");
  const [priority, setPriority] = useState("BEST_SIZING");
  const [powerFactor, setPowerFactor] = useState("");
  const [recommendation, setRecommendation] =
    useState<RecommendationResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [selectedGenerator, setSelectedGenerator] =
    useState<CommercialGeneratorOption | null>(null);
  const [manualCatalog, setManualCatalog] = useState<CommercialGeneratorOption[]>([]);
  const [manualSearch, setManualSearch] = useState("");

  const [generatorQuantity, setGeneratorQuantity] = useState("1");
  const [additionalItems, setAdditionalItems] = useState<AdditionalItem[]>([
    item("Comissionamento / entrega tecnica", "commissioning"),
    item("Transporte", "transport"),
  ]);
  const [includeInstallation, setIncludeInstallation] = useState(false);
  const [inspectionId, setInspectionId] = useState("");
  const [installationNotes, setInstallationNotes] = useState("");

  const [paymentTerms, setPaymentTerms] = useState<ControlOption[]>([]);
  const [paymentTerm, setPaymentTerm] = useState("");
  const [freight, setFreight] = useState("FOB");
  const [deliveryLeadTimeDays, setDeliveryLeadTimeDays] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [externalNotes, setExternalNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [operationalExpenses, setOperationalExpenses] = useState<
    OperationalExpenseSelection[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const params = new URLSearchParams(window.location.search);
      const opportunityId = params.get("opportunityId");
      try {
        const [catalogResponse, controls] = await Promise.all([
          apiFetch("/commercial-sizing/catalog", { cache: "no-store" }),
          loadControlOptions(["PAYMENT_TERM"]),
        ]);
        if (!cancelled && catalogResponse.ok) {
          setManualCatalog(await catalogResponse.json());
        }
        if (!cancelled) setPaymentTerms(controls.PAYMENT_TERM || []);

        if (opportunityId) {
          const response = await apiFetch(`/crm/opportunities/${opportunityId}`, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(
              await readApiErrorMessage(
                response,
                "Nao foi possivel carregar a oportunidade.",
              ),
            );
          }
          const opportunity = (await response.json()) as LinkedOpportunity;
          if (opportunity.opportunityType !== "GENERATOR_SALE") {
            throw new Error(
              "Esta oportunidade nao e do tipo Venda de gerador. Use a proposta de pecas e servicos.",
            );
          }
          if (!cancelled) {
            setLinkedOpportunity(opportunity);
            setClientId(opportunity.client.id);
            setClientSearch(opportunity.client.companyName);
            if (opportunity.assignedSeller) {
              setSellerId(opportunity.assignedSeller.id);
              setSellerSearch(opportunity.assignedSeller.name);
            }
          }
        } else {
          restoreDraft();
        }
      } catch (initializationError: unknown) {
        if (!cancelled) {
          setError(
            initializationError instanceof Error
              ? initializationError.message
              : "Falha ao iniciar o assistente.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (linkedOpportunity) return;
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({ take: "10" });
      if (clientSearch.trim()) params.set("q", clientSearch.trim());
      const response = await apiFetch(`/clients/lookup?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) setClients(await response.json());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [clientSearch, linkedOpportunity]);

  useEffect(() => {
    if (linkedOpportunity?.assignedSeller) return;
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({
        take: "10",
        pipeline: "COMMERCIAL_01_GENERATORS",
      });
      if (sellerSearch.trim()) params.set("q", sellerSearch.trim());
      const response = await apiFetch(`/crm/sellers?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) setSellers(await response.json());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [linkedOpportunity, sellerSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (manualSearch.trim()) params.set("q", manualSearch.trim());
      const response = await apiFetch(
        `/commercial-sizing/catalog?${params.toString()}`,
        { cache: "no-store" },
      );
      if (response.ok) setManualCatalog(await response.json());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [manualSearch]);

  const selectedInspection = useMemo(
    () =>
      linkedOpportunity?.inspections?.find(
        (inspection) => inspection.id === inspectionId,
      ) ?? null,
    [inspectionId, linkedOpportunity],
  );

  const itemsSubtotal = useMemo(() => {
    const generatorTotal =
      Number(generatorQuantity || 0) *
      Number(selectedGenerator?.commercialPrice || 0);
    return additionalItems
      .filter((entry) => entry.enabled)
      .reduce(
        (total, entry) =>
          total + Number(entry.quantity || 0) * Number(entry.unitPrice || 0),
        generatorTotal,
      );
  }, [additionalItems, generatorQuantity, selectedGenerator]);
  const expensesTotal = operationalExpensesTotal(operationalExpenses);
  const subtotal = itemsSubtotal + expensesTotal;
  const discountValue = subtotal * Math.min(100, Math.max(0, Number(discountPercent || 0))) / 100;
  const total = subtotal - discountValue;

  function restoreDraft() {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as Record<string, unknown>;
      if (typeof draft.clientId === "string") setClientId(draft.clientId);
      if (typeof draft.clientSearch === "string") setClientSearch(draft.clientSearch);
      if (typeof draft.sellerId === "string") setSellerId(draft.sellerId);
      if (typeof draft.sellerSearch === "string") setSellerSearch(draft.sellerSearch);
      if (typeof draft.power === "string") setPower(draft.power);
      if (typeof draft.powerUnit === "string") setPowerUnit(draft.powerUnit);
      if (typeof draft.voltage === "string") setVoltage(draft.voltage);
      if (typeof draft.phaseConfiguration === "string") setPhaseConfiguration(draft.phaseConfiguration);
      if (typeof draft.loadType === "string") setLoadType(draft.loadType);
      if (typeof draft.application === "string") setApplication(draft.application);
      if (draft.selectedGenerator && typeof draft.selectedGenerator === "object") {
        setSelectedGenerator(draft.selectedGenerator as CommercialGeneratorOption);
      }
      setNotice("Rascunho local recuperado.");
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  function saveDraft() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        clientId,
        clientSearch,
        sellerId,
        sellerSearch,
        power,
        powerUnit,
        voltage,
        phaseConfiguration,
        loadType,
        application,
        selectedGenerator,
      }),
    );
    setNotice("Rascunho salvo neste navegador.");
    setError("");
  }

  async function calculateRecommendation() {
    if (!power || Number(power) <= 0 || !voltage.trim()) {
      setError("Informe potencia e tensao para calcular a recomendacao.");
      return;
    }
    setCalculating(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/commercial-sizing/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          power: Number(power),
          powerUnit,
          voltage: voltage.trim(),
          phaseConfiguration,
          frequencyHz: Number(frequencyHz),
          loadType,
          application,
          installationLocation,
          fuelPreference,
          constructionPreference,
          priority,
          powerFactor: powerFactor ? Number(powerFactor) : undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao calcular recomendacao."),
        );
      }
      const result = (await response.json()) as RecommendationResult;
      setRecommendation(result);
      if (result.recommended) setSelectedGenerator(result.recommended);
      if (!result.recommended) {
        setNotice(
          "Nenhum equipamento compativel foi encontrado. Revise os filtros ou escolha manualmente.",
        );
      }
    } catch (calculationError: unknown) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : "Falha ao calcular recomendacao.",
      );
    } finally {
      setCalculating(false);
    }
  }

  function addAdditionalItem() {
    setAdditionalItems((current) => [...current, item("Outro item / servico")]);
  }

  function updateAdditionalItem(id: string, patch: Partial<AdditionalItem>) {
    setAdditionalItems((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function validateStep(targetStep = step) {
    if (targetStep === 0 && (!clientId || !sellerId)) {
      return "Selecione o cliente e o vendedor.";
    }
    if (targetStep === 1 && (!power || Number(power) <= 0 || !voltage.trim())) {
      return "Preencha potencia e tensao da necessidade.";
    }
    if (targetStep === 2 && !selectedGenerator) {
      return "Calcule a recomendacao ou escolha um gerador manualmente.";
    }
    if (targetStep === 3 && Number(generatorQuantity) < 1) {
      return "A quantidade de geradores deve ser maior que zero.";
    }
    if (targetStep === 4 && includeInstallation && !installationNotes.trim() && !inspectionId) {
      return "Selecione uma vistoria ou informe os dados basicos da instalacao.";
    }
    if (targetStep === 5 && !paymentTerm) {
      return "Selecione a condicao de pagamento.";
    }
    return "";
  }

  function nextStep() {
    const validation = validateStep();
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function submitProposal() {
    for (let index = 0; index < 6; index += 1) {
      const validation = validateStep(index);
      if (validation) {
        setStep(index);
        setError(validation);
        return;
      }
    }
    if (!selectedGenerator) return;

    setSubmitting(true);
    setError("");
    try {
      const items = [
        {
          kind: "OTHER",
          description: `Gerador Generac ${selectedGenerator.model} (${selectedGenerator.internalCode})`,
          quantity: Number(generatorQuantity),
          unitPrice: selectedGenerator.commercialPrice,
        },
        ...additionalItems
          .filter((entry) => entry.enabled && entry.description.trim())
          .map((entry) => ({
            kind: "OTHER",
            description: entry.description.trim(),
            quantity: Number(entry.quantity || 1),
            unitPrice: Number(entry.unitPrice || 0),
          })),
      ];
      const response = await apiFetch("/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          userId: sellerId,
          salesOpportunityId: linkedOpportunity?.id,
          commercialGeneratorId: selectedGenerator.id,
          type: "GENERATOR_SALE",
          sizingSnapshot: recommendation ?? {
            source: "MANUAL_SELECTION",
            input: { power, powerUnit, voltage, phaseConfiguration, loadType, application },
          },
          scope: buildScope(selectedGenerator, includeInstallation, installationNotes, selectedInspection),
          freight,
          validUntil: validUntil || undefined,
          paymentTerm,
          deliveryLeadTimeDays: deliveryLeadTimeDays
            ? Number(deliveryLeadTimeDays)
            : selectedGenerator.leadTimeDays ?? undefined,
          internalNotes: internalNotes || undefined,
          externalNotes: externalNotes || undefined,
          discount: discountValue,
          operationalExpenses: operationalExpenses
            .filter((item) => item.quantity > 0)
            .map((item) => ({
              expenseType: item.expenseType,
              quantity: item.quantity,
            })),
          items,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao criar proposta de gerador."),
        );
      }
      const created = (await response.json()) as { id: string };
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/dashboard/proposals/${created.id}`);
    } catch (submissionError: unknown) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Falha ao criar proposta de gerador.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Comercial / Venda de geradores"
        title="Nova proposta de gerador"
        description="Assistente comercial para dimensionar, selecionar e configurar um gerador Generac sem misturar equipamentos instalados no cliente."
        actions={
          <>
            <Link href="/dashboard/proposals" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Voltar para propostas
            </Link>
            <button type="button" onClick={saveDraft} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800">
              Salvar rascunho local
            </button>
          </>
        }
      />

      <nav className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-7">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => index <= step && setStep(index)}
            className={`rounded-xl px-3 py-3 text-left text-xs font-bold transition ${
              index === step
                ? "bg-sky-600 text-white"
                : index < step
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-50 text-slate-400"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-[0.14em]">Etapa {index + 1}</span>
            <span className="mt-1 block">{label}</span>
          </button>
        ))}
      </nav>

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {loading ? <StatusBanner>Carregando dados do assistente...</StatusBanner> : null}

      {!loading && step === 0 ? (
        <SectionCard title="Cliente e responsavel comercial" description="A oportunidade de venda preenche automaticamente estes dados quando estiver vinculada.">
          {linkedOpportunity ? (
            <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Oportunidade vinculada</p>
              <p className="mt-2 font-bold text-slate-950">{linkedOpportunity.title}</p>
            </div>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2">
            <LookupField label="Cliente" value={clientSearch} locked={Boolean(linkedOpportunity)} onChange={(value) => { setClientSearch(value); setClientId(""); }}>
              {!clientId && !linkedOpportunity ? clients.map((client) => (
                <LookupOption key={client.id} title={client.companyName} helper={client.cnpj || client.tradeName || "Cliente"} onClick={() => { setClientId(client.id); setClientSearch(client.companyName); }} />
              )) : null}
            </LookupField>
            <LookupField label="Vendedor" value={sellerSearch} locked={Boolean(linkedOpportunity?.assignedSeller)} onChange={(value) => { setSellerSearch(value); setSellerId(""); }}>
              {!sellerId && !linkedOpportunity?.assignedSeller ? sellers.map((seller) => (
                <LookupOption key={seller.id} title={seller.name} helper={seller.email || "Comercial"} onClick={() => { setSellerId(seller.id); setSellerSearch(seller.name); }} />
              )) : null}
            </LookupField>
          </div>
        </SectionCard>
      ) : null}

      {!loading && step === 1 ? (
        <SectionCard title="Necessidade e pre-dimensionamento" description="Informe os dados conhecidos. A recomendacao continua sendo comercial e preliminar.">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Potencia / pico"><input className={INPUT_CLASS} type="number" min="0" value={power} onChange={(event) => setPower(event.target.value)} /></Field>
            <Field label="Unidade"><Select value={powerUnit} onChange={setPowerUnit} options={[["W", "W"], ["KW", "kW"], ["KVA", "kVA"]]} /></Field>
            <Field label="Tensao"><input className={INPUT_CLASS} value={voltage} onChange={(event) => setVoltage(event.target.value)} placeholder="220 V" /></Field>
            <Field label="Ligacao"><Select value={phaseConfiguration} onChange={setPhaseConfiguration} options={[["MONOPHASE", "Monofasico"], ["TWO_PHASE", "Bifasico"], ["THREE_PHASE", "Trifasico"]]} /></Field>
            <Field label="Frequencia"><Select value={frequencyHz} onChange={setFrequencyHz} options={[["60", "60 Hz"], ["50", "50 Hz"]]} /></Field>
            <Field label="Tipo de carga"><Select value={loadType} onChange={setLoadType} options={LOAD_OPTIONS} /></Field>
            <Field label="Aplicacao"><Select value={application} onChange={setApplication} options={[["STANDBY", "Emergencia / Stand-by"], ["PRIME", "Prime"], ["CONTINUOUS", "Continuo"]]} /></Field>
            <Field label="Local"><Select value={installationLocation} onChange={setInstallationLocation} options={[["INDOOR", "Interno"], ["OUTDOOR", "Externo"]]} /></Field>
            <Field label="Combustivel"><Select value={fuelPreference} onChange={setFuelPreference} options={[["ANY", "Indiferente"], ["NATURAL_GAS", "Gas natural"], ["LPG", "GLP"], ["DIESEL", "Diesel"]]} /></Field>
            <Field label="Construcao"><Select value={constructionPreference} onChange={setConstructionPreference} options={[["ANY", "Indiferente"], ["OPEN", "Aberto"], ["CANOPIED", "Carenado"], ["SOUND_ATTENUATED", "Carenado / Silenciado"]]} /></Field>
            <Field label="Prioridade"><Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} /></Field>
            <Field label="Fator de potencia (opcional)"><input className={INPUT_CLASS} type="number" min="0.01" max="1" step="0.01" value={powerFactor} onChange={(event) => setPowerFactor(event.target.value)} placeholder="Usar politica do Studio" /></Field>
          </div>
          <button type="button" onClick={() => void calculateRecommendation()} disabled={calculating} className="mt-6 rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {calculating ? "Calculando..." : "Calcular recomendacao"}
          </button>
        </SectionCard>
      ) : null}

      {!loading && step === 2 ? (
        <SectionCard title="Gerador Generac" description="Use a recomendacao, compare alternativas ou selecione manualmente.">
          {recommendation ? (
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <Summary label="Carga normalizada" value={`${recommendation.calculation.requestedPowerKw} kW`} />
              <Summary label="Margem aplicada" value={`${recommendation.calculation.marginPercent}%`} />
              <Summary label="Potencia requerida" value={`${recommendation.calculation.requiredPowerKw} kW`} />
              <Summary label="Politica" value={`${recommendation.policy.name} v${recommendation.policy.version}`} />
            </div>
          ) : null}
          {recommendation?.requiresEngineeringReview ? (
            <StatusBanner tone="amber">Validacao tecnica recomendada: {recommendation.engineeringReviewReasons.join(" ")}</StatusBanner>
          ) : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {(recommendation?.candidates || []).map((candidate) => (
              <GeneratorCard key={candidate.id} generator={candidate} selected={selectedGenerator?.id === candidate.id} onSelect={() => setSelectedGenerator(candidate)} />
            ))}
          </div>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Escolher manualmente</label>
            <input className={INPUT_CLASS} value={manualSearch} onChange={(event) => setManualSearch(event.target.value)} placeholder="Buscar codigo, linha ou modelo" />
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {manualCatalog.slice(0, 12).map((generator) => (
                <GeneratorCard key={generator.id} generator={generator} selected={selectedGenerator?.id === generator.id} onSelect={() => setSelectedGenerator(generator)} compact />
              ))}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {!loading && step === 3 ? (
        <SectionCard title="Configuracao da venda" description="Confirme quantidade e acrescente servicos ou itens comerciais.">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="font-bold text-slate-950">Generac {selectedGenerator?.model}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Quantidade"><input className={INPUT_CLASS} type="number" min="1" value={generatorQuantity} onChange={(event) => setGeneratorQuantity(event.target.value)} /></Field>
              <Summary label="Unitario" value={money(selectedGenerator?.commercialPrice || 0)} />
              <Summary label="Total do gerador" value={money(Number(generatorQuantity || 0) * Number(selectedGenerator?.commercialPrice || 0))} />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {additionalItems.map((entry) => (
              <div key={entry.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[auto_1fr_120px_180px] md:items-end">
                <input type="checkbox" checked={entry.enabled} onChange={(event) => updateAdditionalItem(entry.id, { enabled: event.target.checked })} />
                <Field label="Item / servico"><input className={INPUT_CLASS} value={entry.description} onChange={(event) => updateAdditionalItem(entry.id, { description: event.target.value })} /></Field>
                <Field label="Quantidade"><input className={INPUT_CLASS} type="number" min="1" value={entry.quantity} onChange={(event) => updateAdditionalItem(entry.id, { quantity: event.target.value })} /></Field>
                <Field label="Valor unitario"><input className={INPUT_CLASS} type="number" min="0" value={entry.unitPrice} onChange={(event) => updateAdditionalItem(entry.id, { unitPrice: event.target.value })} /></Field>
              </div>
            ))}
          </div>
          <button type="button" onClick={addAdditionalItem} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Adicionar outro item</button>
        </SectionCard>
      ) : null}

      {!loading && step === 4 ? (
        <SectionCard title="Instalacao e vistoria" description="A instalacao e opcional e pode aproveitar uma vistoria da oportunidade.">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 font-semibold text-slate-800">
            <input type="checkbox" checked={includeInstallation} onChange={(event) => setIncludeInstallation(event.target.checked)} />
            Incluir instalacao nesta proposta
          </label>
          {includeInstallation ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Vistoria comercial">
                <select className={INPUT_CLASS} value={inspectionId} onChange={(event) => setInspectionId(event.target.value)}>
                  <option value="">Sem vistoria vinculada</option>
                  {(linkedOpportunity?.inspections || []).map((inspection) => <option key={inspection.id} value={inspection.id}>{inspection.code} - {inspection.status}</option>)}
                </select>
              </Field>
              <Field label="Dados complementares">
                <textarea className={INPUT_CLASS} rows={5} value={installationNotes} onChange={(event) => setInstallationNotes(event.target.value)} placeholder="Acesso, infraestrutura, tubulacao, icamento e observacoes." />
              </Field>
              {selectedInspection ? <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Importado de {selectedInspection.code}: {selectedInspection.requiredPowerKva ? `${selectedInspection.requiredPowerKva} kVA; ` : ""}{selectedInspection.voltage ? `${selectedInspection.voltage}; ` : ""}{selectedInspection.qtaDistanceMeters ? `QTA a ${selectedInspection.qtaDistanceMeters} m; ` : ""}{selectedInspection.needsMunck ? "necessita Munck. " : ""}{selectedInspection.technicalNotes || selectedInspection.accessNotes || "Sem observacoes adicionais."}</div> : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {!loading && step === 5 ? (
        <SectionCard title="Condicoes comerciais" description="Defina somente as excecoes; os dados do equipamento vieram do Studio.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Condicao de pagamento"><select className={INPUT_CLASS} value={paymentTerm} onChange={(event) => setPaymentTerm(event.target.value)}><option value="">Selecione</option>{paymentTerms.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}</select></Field>
            <Field label="Frete"><Select value={freight} onChange={setFreight} options={[["FOB", "FOB"], ["CIF", "CIF"], ["SEM_FRETE", "Sem frete"]]} /></Field>
            <Field label="Prazo de entrega (dias)"><input className={INPUT_CLASS} type="number" min="0" value={deliveryLeadTimeDays} onChange={(event) => setDeliveryLeadTimeDays(event.target.value)} placeholder={String(selectedGenerator?.leadTimeDays ?? "Sob consulta")} /></Field>
            <Field label="Validade"><input className={INPUT_CLASS} type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
            <Field label="Desconto geral %"><input className={INPUT_CLASS} type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} /></Field>
            <Summary label="Valor final" value={money(total)} />
            <Field label="Observacoes para o cliente"><textarea className={INPUT_CLASS} rows={4} value={externalNotes} onChange={(event) => setExternalNotes(event.target.value)} /></Field>
            <Field label="Observacoes internas"><textarea className={INPUT_CLASS} rows={4} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></Field>
          </div>
          <div className="mt-6">
            <OperationalExpensesEditor
              value={operationalExpenses}
              onChange={setOperationalExpenses}
            />
          </div>
        </SectionCard>
      ) : null}

      {!loading && step === 6 ? (
        <SectionCard title="Revisao da proposta" description="Confira os dados antes de criar o rascunho oficial da proposta.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Summary label="Cliente" value={clientSearch} />
            <Summary label="Necessidade" value={`${power} ${powerUnit} / ${voltage}`} />
            <Summary label="Equipamento" value={`Generac ${selectedGenerator?.model}`} />
            <Summary label="Quantidade" value={generatorQuantity} />
            <Summary label="Instalacao" value={includeInstallation ? "Incluida" : "Nao incluida"} />
            <Summary label="Pagamento" value={paymentTerm} />
            <Summary label="Prazo" value={deliveryLeadTimeDays || String(selectedGenerator?.leadTimeDays ?? "Sob consulta")} />
            <Summary label="Despesas operacionais" value={money(expensesTotal)} />
            <Summary label="Valor final" value={money(total)} />
          </div>
          {recommendation?.requiresEngineeringReview ? <div className="mt-5"><StatusBanner tone="amber">A proposta sera criada em rascunho com recomendacao de validacao tecnica.</StatusBanner></div> : null}
          <button type="button" disabled={submitting} onClick={() => void submitProposal()} className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Criando proposta..." : "Finalizar e criar rascunho"}</button>
        </SectionCard>
      ) : null}

      {!loading ? (
        <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
          <button type="button" disabled={step === 0} onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Voltar</button>
          <div className="flex items-center gap-3"><DataPill tone="slate">{step + 1} de {STEPS.length}</DataPill>{step < STEPS.length - 1 ? <button type="button" onClick={nextStep} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Continuar</button> : null}</div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}{children}</label>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return <select className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}

function LookupField({ label, value, locked, onChange, children }: { label: string; value: string; locked: boolean; onChange: (value: string) => void; children: ReactNode }) {
  return <div className="relative"><label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</label><input className={INPUT_CLASS} value={value} disabled={locked} onChange={(event) => onChange(event.target.value)} /><div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">{children}</div></div>;
}

function LookupOption({ title, helper, onClick }: { title: string; helper: string; onClick: () => void }) {
  return <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-sky-50"><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{helper}</span></button>;
}

function GeneratorCard({ generator, selected, onSelect, compact = false }: { generator: CommercialGeneratorOption; selected: boolean; onSelect: () => void; compact?: boolean }) {
  return <article className={`rounded-2xl border p-4 ${selected ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">{generator.classification === "RECOMMENDED" ? "Recomendado" : generator.internalCode}</p><p className="mt-1 font-bold text-slate-950">Generac {generator.model}</p></div>{selected ? <DataPill tone="emerald">Selecionado</DataPill> : null}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><span>{generator.capacityKw ?? generator.standbyPowerKw ?? "-"} kW</span><span>{generator.fuelType}</span><span>{generator.construction}</span><span>{generator.availability}</span></div>{!compact && generator.reservePercent !== undefined ? <p className="mt-3 text-sm font-semibold text-slate-700">Reserva estimada: {generator.reservePercent}%</p> : null}<p className="mt-3 text-lg font-bold text-slate-950">{money(generator.commercialPrice)}</p>{!compact && generator.reasons?.length ? <ul className="mt-3 space-y-1 text-xs text-emerald-800">{generator.reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}</ul> : null}{!compact && generator.warnings?.length ? <ul className="mt-2 space-y-1 text-xs text-amber-800">{generator.warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}</ul> : null}<button type="button" onClick={onSelect} className="mt-4 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white">Selecionar</button></article>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 break-words text-sm font-bold text-slate-950">{value || "Nao informado"}</p></div>;
}

function item(description: string, id = `${Date.now()}-${Math.random()}`): AdditionalItem {
  return { id, description, quantity: "1", unitPrice: "0", enabled: false };
}

function buildScope(generator: CommercialGeneratorOption, includeInstallation: boolean, notes: string, inspection: InspectionOption | null) {
  const lines = [`Fornecimento de gerador Generac ${generator.model} (${generator.internalCode}).`];
  if (includeInstallation) lines.push("Inclui instalacao conforme dados comerciais informados.");
  if (inspection) lines.push(`Vistoria comercial vinculada: ${inspection.code}.`);
  if (notes.trim()) lines.push(`Observacoes da instalacao: ${notes.trim()}`);
  return lines.join("\n");
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

const LOAD_OPTIONS = [
  ["RESISTIVE", "Resistiva"], ["MOTORS", "Motores"], ["PUMPS", "Bombas"],
  ["AIR_CONDITIONING", "Ar-condicionado"], ["ELEVATORS", "Elevadores"],
  ["IT_ELECTRONICS", "TI / Eletronica"], ["MIXED", "Mista"], ["UNKNOWN", "Nao informado"],
];

const PRIORITY_OPTIONS = [
  ["BEST_SIZING", "Melhor dimensionamento"], ["LOWEST_PRICE", "Menor preco"],
  ["SHORTEST_LEAD_TIME", "Menor prazo"], ["AVAILABILITY", "Disponibilidade / estoque"],
  ["HIGHEST_POWER_RESERVE", "Maior reserva de potencia"],
];
