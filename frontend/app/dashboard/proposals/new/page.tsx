"use client";
import { canUsePortfolio, getDetailedAccess } from "@/lib/access-rules";

import {
  SelectField,
  SearchLookup,
} from "@/app/dashboard/components/SelectField";
import { PageHeader } from "../../components/DashboardPageKit";
import {
  ProposalSteps,
  ProposalFinancialDock,
  ProposalFormSection,
  focusProposalStep,
} from "../../components/ProposalFormFlow";
import { commercialLabel, freightLabel } from "@/lib/commercial-labels";

import Link from "next/link";
import PaymentPlanEditor from "../PaymentPlanEditor";
import {
  paymentComposition,
  planFromLegacy,
  type ProposalPaymentPlan,
} from "@/lib/proposal-payment-plan";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, type ControlOption } from "@/lib/control-options";
import { confirmDeletion } from "@/lib/confirm-action";
import OperationalExpensesEditor, {
  operationalExpensesTotal,
  type OperationalExpenseSelection,
} from "../OperationalExpensesEditor";
import {
  buildProposalAccessoryWarnings,
  normalizeProposalItemName,
  type ProposalAccessoryRule,
  type ProposalAccessoryWarning,
} from "./proposal-assistance";

type CatalogItem = {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  basePrice?: number | null;
  type?: string | null;
};

type Client = {
  id: string;
  companyName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  paymentTermDefault?: string | null;
  proposalCreationBlocked?: boolean | null;
  proposalBlockReason?: string | null;
  blockedPaymentTerms?: string[];
  _count?: { proposals?: number };
};

type Generator = {
  id: string;
  name?: string | null;
  clientId?: string | null;
  assetTag?: string | null;
  brand?: string | null;
  serialNumber?: string | null;
  power?: number | null;
  voltage?: string | null;
  engineModelName?: string | null;
  installationSite?: string | null;
  client?: {
    id: string;
    companyName?: string | null;
    tradeName?: string | null;
  } | null;
  currentSite?: {
    id: string;
    name?: string | null;
    code?: string | null;
  } | null;
};

type LinkedOpportunity = {
  id: string;
  title: string;
  stage: string;
  pipeline?: string | null;
  opportunityType?: string | null;
  estimatedValue?: number | null;
  client: { id: string; companyName: string; tradeName?: string | null };
  assignedSeller?: {
    id: string;
    name: string;
    email?: string | null;
    department?: string | null;
  } | null;
  inspections?: Array<{
    id: string;
    code: string;
    status: string;
    technicalNotes?: string | null;
    scheduledAt?: string | null;
    finishedAt?: string | null;
  }>;
  proposals?: Array<{
    id: string;
    code: string;
    status: string;
    totalValue?: number | null;
    createdAt: string;
  }>;
};

type RowItem = {
  catalogItemId: string;
  quantity: string;
  unitPrice: string;
  origin?: "MACHINE" | "GENERAL";
};

type MachineBaseItem = {
  id: string;
  catalogItemId: string;
  serviceGroup: string;
  quantity: number;
  sourceModelBaseItemId?: string | null;
  isCustomized?: boolean;
  catalogItem?: CatalogItem | null;
};

type HourlyItem = {
  description: string;
  hourType: string;
  technicianType: string;
  hours: string;
  discountPercent: string;
};

type HourlyRateOption = {
  hourType: string;
  technicianType: string;
  unitPrice: number;
};

type PaymentProfile = {
  id: string;
  issuerCompany?: { id: string; companyName: string | null } | null;
  name: string;
  purpose: "PARTS" | "SERVICES";
  method: "PIX" | "BOLETO";
  beneficiary: string;
  beneficiaryDocument?: string | null;
  bankName?: string | null;
  agency?: string | null;
  accountNumber?: string | null;
  pixKey?: string | null;
  pixCopyPaste?: string | null;
  boletoInstructions?: string | null;
  qrCodeDataUrl?: string | null;
};

type EditableProposal = {
  id: string;
  code: string;
  status: string;
  type: "PARTS_AND_SERVICES" | "CONTRACT";
  clientId: string;
  client?: Client | null;
  generatorId?: string | null;
  generator?: Generator | null;
  userId?: string | null;
  user?: SellerOption | null;
  salesOpportunityId?: string | null;
  scope?: string | null;
  freight?: string | null;
  validUntil?: string | null;
  paymentTerm?: string | null;
  paymentPlan?: ProposalPaymentPlan | null;
  deliveryLeadTimeDays?: number | null;
  paymentSelections?: Array<{
    id?: string;
    purpose: "PARTS" | "SERVICES";
  }> | null;
  hasDownPayment?: boolean;
  downPaymentAmount?: number | null;
  installmentCount?: number | null;
  installmentIntervalDays?: number | null;
  firstDueDate?: string | null;
  internalNotes?: string | null;
  externalNotes?: string | null;
  discount?: number | null;
  allowOperationalExpenseDiscount?: boolean;
  operationalExpenses?: OperationalExpenseSelection[] | null;
  items: Array<{
    kind: "PART_MATERIAL" | "CATALOG_SERVICE" | "HOURLY_SERVICE" | "OTHER";
    catalogItemId?: string | null;
    catalogItem?: CatalogItem | null;
    description?: string | null;
    quantity: number;
    hours?: number | null;
    unitPrice: number;
    discountPercent?: number | null;
    hourType?: string | null;
    technicianType?: string | null;
  }>;
};

type OtherItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

type SellerOption = {
  id: string;
  name: string;
  email?: string | null;
  department?: string | null;
};

type ScopeTemplate = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  scopeText: string;
  sourceFileName?: string | null;
  tags?: string[];
  compatibleOpportunityTypes?: string[];
};

type PricingOption = {
  value: string;
  label: string;
  defaultDiscountPercent?: number;
};

const INSPECTION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluida",
  CANCELED: "Cancelada",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

type CommercialBreakdownRow = {
  key: "EXPENSES" | "PARTS" | "SERVICES";
  label: string;
  subtotal: number;
  discountEligible: boolean;
  discount: number;
  total: number;
};

function buildCommercialBreakdown(
  entries: Array<
    Pick<
      CommercialBreakdownRow,
      "key" | "label" | "subtotal" | "discountEligible"
    >
  >,
  totalDiscount: number,
): CommercialBreakdownRow[] {
  const normalized = entries.map((entry) => ({
    ...entry,
    subtotal: roundMoney(entry.subtotal),
  }));
  const discountableTotal = roundMoney(
    normalized.reduce(
      (sum, entry) => sum + (entry.discountEligible ? entry.subtotal : 0),
      0,
    ),
  );
  const discount = Math.min(discountableTotal, roundMoney(totalDiscount));
  const positiveEntries = normalized.filter(
    (entry) => entry.discountEligible && entry.subtotal > 0,
  );
  let allocated = 0;

  return normalized.map((entry) => {
    const positiveIndex = positiveEntries.findIndex(
      (positive) => positive.key === entry.key,
    );
    const isLastPositive = positiveIndex === positiveEntries.length - 1;
    const entryDiscount =
      !entry.discountEligible || entry.subtotal <= 0 || discountableTotal <= 0
        ? 0
        : isLastPositive
          ? roundMoney(discount - allocated)
          : roundMoney((discount * entry.subtotal) / discountableTotal);
    allocated = roundMoney(allocated + entryDiscount);
    return {
      ...entry,
      discount: entryDiscount,
      total: roundMoney(entry.subtotal - entryDiscount),
    };
  });
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCommercialTerm(value?: string | null) {
  return commercialLabel(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatClientOption(client: Client) {
  return [client.companyName, client.tradeName, client.cnpj]
    .filter(Boolean)
    .join(" | ");
}

function formatGeneratorOption(generator: Generator) {
  const details = [
    generator.assetTag,
    generator.serialNumber,
    generator.engineModelName,
    generator.power ? `${generator.power} kVA` : null,
  ].filter(Boolean);
  return `${generator.name || "Maquina"}${details.length ? ` | ${details.join(" | ")}` : ""}`;
}

function joinScopeTexts(texts: string[]) {
  const unique = Array.from(
    new Set(texts.map((text) => text.trim()).filter(Boolean)),
  );
  return unique.join("\n\n");
}

function mergeCatalogOptions(
  current: CatalogItem[],
  rows: RowItem[],
  machineItems: MachineBaseItem[],
) {
  const wantedIds = new Set(rows.map((row) => row.catalogItemId));
  const additions = machineItems
    .filter((item) => wantedIds.has(item.catalogItemId) && item.catalogItem)
    .map((item) => item.catalogItem as CatalogItem);
  return Array.from(
    new Map([...current, ...additions].map((item) => [item.id, item])).values(),
  );
}

function defaultHourlyDiscount(hourType: string) {
  return hourType === "CONTRACT" ? "20" : "0";
}

function SearchableSelect({
  items,
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  items: CatalogItem[];
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  placeholder: string;
}) {
  return (
    <SearchLookup
      value={value}
      options={items.map((item) => ({
        value: item.id,
        label: [item.code || item.sku, item.name].filter(Boolean).join(" · "),
      }))}
      onSelect={onChange}
      onSearch={onSearch}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-sky-500"
    />
  );
}

function PaymentProfileSelector({
  label,
  purpose,
  profiles,
  value,
  onChange,
}: {
  label: string;
  purpose: PaymentProfile["purpose"];
  profiles: PaymentProfile[];
  value: string;
  onChange: (value: string) => void;
}) {
  const choices = profiles.filter((profile) => profile.purpose === purpose);
  const selected = choices.find((profile) => profile.id === value);
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <label
        htmlFor={"proposal-payment-" + purpose}
        className="block text-sm font-semibold text-zinc-800"
      >
        {label}
      </label>
      <p className="mt-1 text-xs text-zinc-500">
        A conta define a empresa Manitec emitente e os dados que aparecerão no
        documento.
      </p>
      <SelectField
        id={"proposal-payment-" + purpose}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm"
      >
        <option value="">Selecione PIX ou boleto</option>
        {choices.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.method === "PIX" ? "PIX" : "Boleto"} · {profile.name}
            {profile.issuerCompany?.companyName
              ? ` · ${profile.issuerCompany.companyName}`
              : ""}
          </option>
        ))}
      </SelectField>
      {choices.length === 0 ? (
        <p className="mt-3 text-xs text-amber-800">
          Nenhum perfil ativo. Cadastre os dados reais no Manitec Studio.
        </p>
      ) : null}
      {selected ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
          <p className="text-xs text-slate-500">Empresa emitente</p>
          <p className="mt-1 font-semibold text-slate-900">
            {selected.issuerCompany?.companyName || selected.beneficiary}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-blue-700">
              Ver dados de recebimento
            </summary>
            <p className="mt-3 font-bold text-zinc-900">
              {selected.beneficiary}
            </p>
            {selected.beneficiaryDocument ? (
              <p>CPF/CNPJ: {selected.beneficiaryDocument}</p>
            ) : null}
            {selected.bankName ? <p>Banco: {selected.bankName}</p> : null}
            {selected.agency ? <p>Agência: {selected.agency}</p> : null}
            {selected.accountNumber ? (
              <p>Conta: {selected.accountNumber}</p>
            ) : null}
            {selected.method === "PIX" ? (
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p>
                    Chave PIX: <strong>{selected.pixKey}</strong>
                  </p>
                  {selected.pixCopyPaste ? (
                    <p className="mt-1 break-all text-xs">
                      Copia e cola: {selected.pixCopyPaste}
                    </p>
                  ) : null}
                </div>
                {selected.qrCodeDataUrl ? (
                  <Image
                    src={selected.qrCodeDataUrl}
                    alt={`QR Code PIX para ${label.toLowerCase()}`}
                    width={120}
                    height={120}
                    unoptimized
                    className="rounded border border-zinc-200"
                  />
                ) : null}
              </div>
            ) : selected.boletoInstructions ? (
              <p className="mt-2 whitespace-pre-wrap">
                {selected.boletoInstructions}
              </p>
            ) : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}

const PROPOSAL_STEPS = [
  { title: "Dados comerciais", description: "Cliente, Manitec e pagamento" },
  { title: "Peças", description: "Materiais e complementos" },
  { title: "Serviços", description: "Mão de obra e despesas" },
  { title: "Revisão", description: "Escopo, desconto e conferência" },
];

export default function NewProposalPage() {
  const [accessReady, setAccessReady] = useState(false);
  useEffect(() => setAccessReady(true), []);

  const [step, setStep] = useState(0);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState("");
  const [editingProposalCode, setEditingProposalCode] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [proposalFormType, setProposalFormType] = useState<
    "PARTS_AND_SERVICES" | "CONTRACT"
  >("PARTS_AND_SERVICES");
  const USER_ROLE = "NORMAL" as string;
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [partOptions, setPartOptions] = useState<CatalogItem[]>([]);
  const [accessoryRules, setAccessoryRules] = useState<ProposalAccessoryRule[]>(
    [],
  );
  const [assistanceLoadState, setAssistanceLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [accessoryCandidates, setAccessoryCandidates] = useState<
    Record<string, CatalogItem[]>
  >({});
  const [assistanceReasons, setAssistanceReasons] = useState<
    Record<string, string>
  >({});
  const [assistanceReviews, setAssistanceReviews] = useState<
    Record<string, { signature: string; reason: string }>
  >({});
  const [serviceOptions, setServiceOptions] = useState<CatalogItem[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [scopeTemplates, setScopeTemplates] = useState<ScopeTemplate[]>([]);
  const [scopeTemplatesLoading, setScopeTemplatesLoading] = useState(true);
  const [scopeTemplatesError, setScopeTemplatesError] = useState("");
  const [hourTypes, setHourTypes] = useState<PricingOption[]>([]);
  const [technicianTypes, setTechnicianTypes] = useState<PricingOption[]>([]);
  const [hourlyRates, setHourlyRates] = useState<HourlyRateOption[]>([]);
  const [paymentProfiles, setPaymentProfiles] = useState<PaymentProfile[]>([]);
  const [linkedOpportunity, setLinkedOpportunity] =
    useState<LinkedOpportunity | null>(null);
  const [loadingOpportunity, setLoadingOpportunity] = useState(false);
  const [linkedOpportunityError, setLinkedOpportunityError] = useState("");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientLookupLoading, setClientLookupLoading] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientSaving, setQuickClientSaving] = useState(false);
  const [quickClient, setQuickClient] = useState({
    companyName: "",
    tradeName: "",
    cnpj: "",
    phone: "",
    email: "",
    contactName: "",
    address: "",
    city: "",
    state: "",
  });
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const [equipmentLookupLoading, setEquipmentLookupLoading] = useState(false);
  const [quickGeneratorOpen, setQuickGeneratorOpen] = useState(false);
  const [quickGeneratorSaving, setQuickGeneratorSaving] = useState(false);
  const [quickGenerator, setQuickGenerator] = useState({
    name: "",
    assetTag: "",
    brand: "",
    modelName: "",
    serialNumber: "",
    power: "",
    voltage: "",
    installationSite: "",
    notes: "",
  });
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [sellerDropdownOpen, setSellerDropdownOpen] = useState(false);
  const [sellerLookupLoading, setSellerLookupLoading] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [loadingBaseItems, setLoadingBaseItems] = useState(false);
  const [machineBaseItems, setMachineBaseItems] = useState<MachineBaseItem[]>(
    [],
  );
  const [selectedMachineBaseItemIds, setSelectedMachineBaseItemIds] = useState<
    string[]
  >([]);

  const [parts, setParts] = useState<RowItem[]>([]);
  const [labor, setLabor] = useState<RowItem[]>([]);
  const [hourlyServices, setHourlyServices] = useState<HourlyItem[]>([]);
  const [otherItems, setOtherItems] = useState<OtherItem[]>([]);
  const [operationalExpenses, setOperationalExpenses] = useState<
    OperationalExpenseSelection[]
  >([]);

  const [scope, setScope] = useState("");
  const [selectedScopeTemplateIds, setSelectedScopeTemplateIds] = useState<
    string[]
  >([]);
  const [scopeSearch, setScopeSearch] = useState("");
  const [scopeUploadBusy, setScopeUploadBusy] = useState(false);
  const [freight, setFreight] = useState("FOB");
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [paymentTermOptions, setPaymentTermOptions] = useState<ControlOption[]>(
    [],
  );
  const [deliveryLeadTimeDays, setDeliveryLeadTimeDays] = useState("");
  const [partsPaymentProfileId, setPartsPaymentProfileId] = useState("");
  const [servicesPaymentProfileId, setServicesPaymentProfileId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<ProposalPaymentPlan | null>(
    null,
  );
  const [hasDownPayment, setHasDownPayment] = useState(false);
  const [downPaymentAmount, setDownPaymentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [externalNotes, setExternalNotes] = useState("");

  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "VALUE">(
    "PERCENTAGE",
  );
  const [discountInput, setDiscountInput] = useState("");
  const [allowOperationalExpenseDiscount, setAllowOperationalExpenseDiscount] =
    useState(false);

  const loadAccessoryRules = useCallback(async () => {
    setAssistanceLoadState("loading");
    try {
      const response = await apiFetch(apiUrl("/proposals/accessory-rules"), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar lembretes.");
      setAccessoryRules((await response.json()) as ProposalAccessoryRule[]);
      setAssistanceLoadState("ready");
    } catch {
      setAssistanceLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadAccessoryRules();
  }, [loadAccessoryRules]);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("editId");
    if (!editId) return;
    let cancelled = false;
    setEditingProposalId(editId);
    void apiFetch(`/proposals/${editId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(
              response,
              "Não foi possível carregar o rascunho.",
            ),
          );
        }
        return (await response.json()) as EditableProposal;
      })
      .then(async (draft) => {
        if (cancelled) return;
        if (
          draft.status !== "DRAFT" ||
          !["PARTS_AND_SERVICES", "CONTRACT"].includes(draft.type)
        ) {
          throw new Error(
            "Esta proposta não pode ser editada neste formulário.",
          );
        }
        setEditingProposalCode(draft.code);
        setProposalFormType(draft.type);
        setSelectedClientId(draft.clientId);
        setClientSearch(
          draft.client?.companyName || draft.client?.tradeName || "",
        );
        if (draft.client)
          setClients((current) => [
            draft.client!,
            ...current.filter((item) => item.id !== draft.clientId),
          ]);
        setSelectedEquipmentId(draft.generatorId || "");
        setEquipmentSearch(draft.generator?.name || "");
        if (draft.generator)
          setGenerators((current) => [
            draft.generator!,
            ...current.filter((item) => item.id !== draft.generatorId),
          ]);
        setSelectedSellerId(draft.userId || "");
        setSellerSearch(draft.user?.name || "");
        if (draft.user)
          setSellers((current) => [
            draft.user!,
            ...current.filter((item) => item.id !== draft.userId),
          ]);
        setScope(draft.scope || "");
        setFreight(draft.freight || "FOB");
        setValidUntil(draft.validUntil?.slice(0, 10) || "");
        setPaymentTerm(draft.paymentTerm || "");
        setDeliveryLeadTimeDays(draft.deliveryLeadTimeDays?.toString() || "");
        setPartsPaymentProfileId(
          draft.paymentSelections?.find((item) => item.purpose === "PARTS")
            ?.id || "",
        );
        setServicesPaymentProfileId(
          draft.paymentSelections?.find((item) => item.purpose === "SERVICES")
            ?.id || "",
        );
        setPaymentPlan(planFromLegacy(draft));
        setHasDownPayment(Boolean(draft.hasDownPayment));
        setDownPaymentAmount(draft.downPaymentAmount?.toString() || "");
        setInstallmentCount(draft.installmentCount?.toString() || "1");
        setInstallmentIntervalDays(
          draft.installmentIntervalDays?.toString() || "30",
        );
        setFirstDueDate(draft.firstDueDate?.slice(0, 10) || "");
        setInternalNotes(draft.internalNotes || "");
        setExternalNotes(draft.externalNotes || "");
        setDiscountType("VALUE");
        setDiscountInput(draft.discount?.toString() || "");
        setAllowOperationalExpenseDiscount(
          Boolean(draft.allowOperationalExpenseDiscount),
        );
        setOperationalExpenses(draft.operationalExpenses || []);
        const rows = draft.items || [];
        setParts(
          rows
            .filter((item) => item.kind === "PART_MATERIAL")
            .map((item) => ({
              catalogItemId: item.catalogItemId || "",
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
            })),
        );
        setLabor(
          rows
            .filter((item) => item.kind === "CATALOG_SERVICE")
            .map((item) => ({
              catalogItemId: item.catalogItemId || "",
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
            })),
        );
        setHourlyServices(
          rows
            .filter((item) => item.kind === "HOURLY_SERVICE")
            .map((item) => ({
              description: item.description || "",
              hourType: item.hourType || "ONE_OFF",
              technicianType: item.technicianType || "",
              hours: String(item.hours || item.quantity),
              discountPercent: String(item.discountPercent || 0),
            })),
        );
        setOtherItems(
          rows
            .filter((item) => item.kind === "OTHER")
            .map((item) => ({
              description: item.description || "",
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
            })),
        );
        const catalogItems = rows.flatMap((item) =>
          item.catalogItem ? [item.catalogItem] : [],
        );
        setPartOptions((current) =>
          Array.from(
            new Map(
              [
                ...current,
                ...catalogItems.filter((item) => item.type === "PART"),
              ].map((item) => [item.id, item]),
            ).values(),
          ),
        );
        setServiceOptions((current) =>
          Array.from(
            new Map(
              [
                ...current,
                ...catalogItems.filter((item) => item.type === "SERVICE"),
              ].map((item) => [item.id, item]),
            ).values(),
          ),
        );
        setDraftLoaded(true);
        if (draft.salesOpportunityId) {
          const response = await apiFetch(
            `/crm/opportunities/${draft.salesOpportunityId}`,
            { cache: "no-store" },
          );
          if (response.ok && !cancelled)
            setLinkedOpportunity((await response.json()) as LinkedOpportunity);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFeedback({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "Erro ao carregar rascunho.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadScopeTemplates = useCallback(async () => {
    setScopeTemplatesLoading(true);
    setScopeTemplatesError("");
    try {
      const response = await apiFetch(apiUrl("/proposals/scope-templates"), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao carregar os escopos."),
        );
      }
      setScopeTemplates((await response.json()) as ScopeTemplate[]);
    } catch (error: unknown) {
      setScopeTemplatesError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar os escopos.",
      );
    } finally {
      setScopeTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScopeTemplates();
  }, [loadScopeTemplates]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [
          clientsRes,
          partsRes,
          servicesRes,
          pricingRes,
          paymentProfilesRes,
          controlOptions,
        ] = await Promise.all([
          apiFetch(apiUrl("/clients/lookup?take=10"), { cache: "no-store" }),
          apiFetch(apiUrl("/catalogs/lookup?type=PART&take=10"), {
            cache: "no-store",
          }),
          apiFetch(apiUrl("/catalogs/lookup?type=SERVICE&take=10"), {
            cache: "no-store",
          }),
          apiFetch(apiUrl("/proposals/pricing-options"), { cache: "no-store" }),
          apiFetch(apiUrl("/proposals/payment-profiles"), {
            cache: "no-store",
          }),
          loadControlOptions(["PAYMENT_TERM"]),
        ]);

        if (clientsRes.ok) setClients((await clientsRes.json()) as Client[]);
        if (partsRes.ok) {
          const options = (await partsRes.json()) as CatalogItem[];
          setPartOptions((current) =>
            Array.from(
              new Map(
                [...options, ...current].map((item) => [item.id, item]),
              ).values(),
            ),
          );
        }
        if (servicesRes.ok) {
          const options = (await servicesRes.json()) as CatalogItem[];
          setServiceOptions((current) =>
            Array.from(
              new Map(
                [...options, ...current].map((item) => [item.id, item]),
              ).values(),
            ),
          );
        }
        if (pricingRes.ok) {
          const pricing = (await pricingRes.json()) as {
            hourTypes?: PricingOption[];
            technicianTypes?: PricingOption[];
            rates?: HourlyRateOption[];
          };
          setHourTypes(pricing.hourTypes || []);
          setTechnicianTypes(pricing.technicianTypes || []);
          setHourlyRates(pricing.rates || []);
        }
        if (paymentProfilesRes.ok)
          setPaymentProfiles(
            (await paymentProfilesRes.json()) as PaymentProfile[],
          );
        setPaymentTermOptions(controlOptions.PAYMENT_TERM || []);
        if (!clientsRes.ok || !partsRes.ok || !servicesRes.ok) {
          setFeedback({
            kind: "error",
            text: "Nao foi possivel carregar todos os dados base da proposta.",
          });
        }
      } catch {
        setFeedback({
          kind: "error",
          text: "Nao foi possivel carregar os dados base da proposta.",
        });
      }
    }

    void fetchData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientIdFromUrl = params.get("clientId");
    const opportunityIdFromUrl = params.get("opportunityId");
    const renewalContractIdFromUrl = params.get("renewalContractId");
    const proposalTypeFromUrl = params.get("proposalType");

    if (proposalTypeFromUrl === "CONTRACT" || renewalContractIdFromUrl) {
      setProposalFormType("CONTRACT");
    }

    if (clientIdFromUrl) setSelectedClientId(clientIdFromUrl);
    const generatorIdFromUrl = params.get("generatorId");
    if (generatorIdFromUrl && clientIdFromUrl && !params.get("editId")) {
      void apiFetch(
        apiUrl("/generators/" + encodeURIComponent(generatorIdFromUrl)),
        { cache: "no-store" },
      )
        .then(async (response) =>
          response.ok ? (response.json() as Promise<Generator>) : null,
        )
        .then((generator) => {
          if (!generator || generator.clientId !== clientIdFromUrl) return;
          setGenerators((current) => [
            generator,
            ...current.filter((item) => item.id !== generator.id),
          ]);
          setSelectedEquipmentId(generator.id);
          setEquipmentSearch(formatGeneratorOption(generator));
        })
        .catch(() => undefined);
    }
    if (renewalContractIdFromUrl) {
      setScope(
        (current) =>
          current ||
          `Renovacao contratual vinculada ao contrato ${renewalContractIdFromUrl}. Revisar escopo, periodo, valores e equipamentos antes do envio.`,
      );
      setInternalNotes(
        (current) =>
          current ||
          `Proposta iniciada a partir da renovacao do contrato ${renewalContractIdFromUrl}.`,
      );
      setFeedback({
        kind: "success",
        text: "Proposta de renovacao iniciada. Confira escopo, valores e equipamentos antes de enviar.",
      });
    }
    if (!opportunityIdFromUrl) return;

    let cancelled = false;

    async function fetchOpportunity() {
      setLoadingOpportunity(true);
      setLinkedOpportunityError("");
      try {
        const res = await apiFetch(
          apiUrl(`/crm/opportunities/${opportunityIdFromUrl}`),
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(
              res,
              "Nao foi possivel carregar a oportunidade vinculada.",
            ),
          );
        }

        const data = (await res.json()) as LinkedOpportunity;
        if (cancelled) return;

        setLinkedOpportunity(data);
        setSelectedClientId(data.client.id);
        setClientSearch(data.client.companyName || data.client.tradeName || "");
        if (data.assignedSeller?.id) {
          setSelectedSellerId(data.assignedSeller.id);
          setSellerSearch(data.assignedSeller.name || "");
          setSellers([data.assignedSeller]);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setLinkedOpportunityError(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar a oportunidade vinculada.",
        );
      } finally {
        if (!cancelled) setLoadingOpportunity(false);
      }
    }

    void fetchOpportunity();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = clients.find((c) => c.id === selectedClientId);
    if (selected) setClientSearch(selected.companyName || "");
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    let cancelled = false;

    void apiFetch(apiUrl(`/clients/${selectedClientId}`), { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()) as Client) : null,
      )
      .then((client) => {
        if (!client || cancelled) return;
        setClients((current) => [
          client,
          ...current.filter((item) => item.id !== client.id),
        ]);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (linkedOpportunity) return;
    const handle = window.setTimeout(async () => {
      setClientLookupLoading(true);
      try {
        const params = new URLSearchParams({ take: "10" });
        if (clientSearch.trim()) params.set("q", clientSearch.trim());
        const res = await apiFetch(
          apiUrl(`/clients/lookup?${params.toString()}`),
          {
            cache: "no-store",
          },
        );
        if (res.ok) setClients((await res.json()) as Client[]);
      } finally {
        setClientLookupLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [clientSearch, linkedOpportunity]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      setEquipmentLookupLoading(true);
      try {
        const params = new URLSearchParams({ take: "10" });
        if (equipmentSearch.trim()) params.set("q", equipmentSearch.trim());
        if (selectedClientId) params.set("clientId", selectedClientId);
        const res = await apiFetch(
          apiUrl(`/proposals/generator-lookup?${params.toString()}`),
          { cache: "no-store" },
        );
        if (res.ok) {
          const items = (await res.json()) as Generator[];
          setGenerators((current) => [
            ...items,
            ...current.filter(
              (item) =>
                item.id === selectedEquipmentId &&
                !items.some((option) => option.id === item.id),
            ),
          ]);
        }
      } finally {
        setEquipmentLookupLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [equipmentSearch, selectedClientId, selectedEquipmentId]);

  useEffect(() => {
    if (linkedOpportunity?.assignedSeller?.id) return;
    const handle = window.setTimeout(async () => {
      setSellerLookupLoading(true);
      try {
        const params = new URLSearchParams({ take: "10" });
        if (sellerSearch.trim()) params.set("q", sellerSearch.trim());
        const res = await apiFetch(
          apiUrl(`/crm/sellers?${params.toString()}`),
          {
            cache: "no-store",
          },
        );
        if (res.ok) setSellers((await res.json()) as SellerOption[]);
      } finally {
        setSellerLookupLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [sellerSearch, linkedOpportunity]);

  const availableGenerators = useMemo(
    () => generators.filter((g) => g.clientId === selectedClientId),
    [generators, selectedClientId],
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const clientHasCommercialHistory = Boolean(selectedClient?._count?.proposals);

  const paymentTermBlockReason = useCallback(
    (option: ControlOption) => {
      const normalizedName = normalizeCommercialTerm(option.name);
      const normalizedCode = normalizeCommercialTerm(option.code);
      const blockedForClient = (selectedClient?.blockedPaymentTerms || []).some(
        (term) => {
          const normalized = normalizeCommercialTerm(term);
          return normalized === normalizedName || normalized === normalizedCode;
        },
      );
      if (blockedForClient) return "Bloqueada para este cliente";
      if (option.isBlockedForNewClients && !clientHasCommercialHistory) {
        return "Bloqueada para cliente sem historico";
      }
      return "";
    },
    [clientHasCommercialHistory, selectedClient],
  );

  useEffect(() => {
    if (!selectedClient) return;
    const currentOption = paymentTermOptions.find(
      (option) =>
        normalizeCommercialTerm(option.name) ===
          normalizeCommercialTerm(paymentTerm) ||
        normalizeCommercialTerm(option.code) ===
          normalizeCommercialTerm(paymentTerm),
    );
    if (currentOption && paymentTermBlockReason(currentOption)) {
      setPaymentTerm("");
      return;
    }
    if (paymentTerm) return;
    const defaultOption = paymentTermOptions.find(
      (option) =>
        normalizeCommercialTerm(option.name) ===
          normalizeCommercialTerm(selectedClient.paymentTermDefault) ||
        normalizeCommercialTerm(option.code) ===
          normalizeCommercialTerm(selectedClient.paymentTermDefault),
    );
    if (defaultOption && !paymentTermBlockReason(defaultOption)) {
      setPaymentTerm(defaultOption.name);
      setPaymentPlan(
        (current) =>
          current || planFromLegacy({ paymentTerm: defaultOption.name }),
      );
    }
  }, [paymentTerm, paymentTermBlockReason, paymentTermOptions, selectedClient]);

  const addPart = () =>
    setParts((prev) => [
      ...prev,
      { catalogItemId: "", quantity: "1", unitPrice: "", origin: "GENERAL" },
    ]);
  const removePart = (index: number) => {
    if (!confirmDeletion("esta peca da proposta")) return;
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePart = (index: number, field: keyof RowItem, value: string) => {
    setParts((prev) => {
      if (
        field === "catalogItemId" &&
        value &&
        (prev.some(
          (item, itemIndex) =>
            itemIndex !== index && item.catalogItemId === value,
        ) ||
          labor.some((item) => item.catalogItemId === value))
      ) {
        setFeedback({
          kind: "error",
          text: "Este item ja foi incluido na proposta.",
        });
        return prev;
      }
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = partOptions.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
        copy[index].origin = "GENERAL";
      }
      return copy;
    });
  };

  const addLabor = () =>
    setLabor((prev) => [
      ...prev,
      { catalogItemId: "", quantity: "1", unitPrice: "", origin: "GENERAL" },
    ]);
  const removeLabor = (index: number) => {
    if (!confirmDeletion("este servico da proposta")) return;
    setLabor((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLabor = (index: number, field: keyof RowItem, value: string) => {
    setLabor((prev) => {
      if (
        field === "catalogItemId" &&
        value &&
        (prev.some(
          (item, itemIndex) =>
            itemIndex !== index && item.catalogItemId === value,
        ) ||
          parts.some((item) => item.catalogItemId === value))
      ) {
        setFeedback({
          kind: "error",
          text: "Este item ja foi incluido na proposta.",
        });
        return prev;
      }
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = serviceOptions.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
        copy[index].origin = "GENERAL";
      }
      return copy;
    });
  };

  async function lookupCatalog(type: "PART" | "SERVICE", term: string) {
    const params = new URLSearchParams({ type, take: "10" });
    if (term.trim()) params.set("q", term.trim());
    const res = await apiFetch(
      apiUrl(`/catalogs/lookup?${params.toString()}`),
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return;
    const payload = (await res.json()) as CatalogItem[];
    if (type === "PART")
      setPartOptions((current) =>
        Array.from(
          new Map(
            [...current, ...payload].map((item) => [item.id, item]),
          ).values(),
        ),
      );
    if (type === "SERVICE")
      setServiceOptions((current) =>
        Array.from(
          new Map(
            [...current, ...payload].map((item) => [item.id, item]),
          ).values(),
        ),
      );
  }

  const hourlyRateFor = (
    item: Pick<HourlyItem, "hourType" | "technicianType">,
  ) =>
    hourlyRates.find(
      (rate) =>
        rate.hourType === item.hourType &&
        rate.technicianType === item.technicianType,
    )?.unitPrice ?? 0;
  const addHourlyService = () => {
    const firstRate = hourlyRates[0];
    if (!firstRate) {
      setFeedback({
        kind: "error",
        text: "Configure e ative as tarifas de hora no Manitec Studio antes de adicionar horas.",
      });
      return;
    }
    setHourlyServices((prev) => [
      ...prev,
      {
        description: "Servico por hora",
        hourType: firstRate.hourType,
        technicianType: firstRate.technicianType,
        hours: "1",
        discountPercent: defaultHourlyDiscount(firstRate.hourType),
      },
    ]);
  };
  const removeHourlyService = (index: number) => {
    if (!confirmDeletion("este servico por hora")) return;
    setHourlyServices((prev) => prev.filter((_, i) => i !== index));
  };
  const updateHourlyService = (
    index: number,
    field: keyof HourlyItem,
    value: string,
  ) => {
    setHourlyServices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "hourType") {
        copy[index].discountPercent = defaultHourlyDiscount(value);
        if (!hourlyRateFor(copy[index])) {
          copy[index].technicianType =
            hourlyRates.find((rate) => rate.hourType === value)
              ?.technicianType || "";
        }
      }
      return copy;
    });
  };

  const addOtherItem = () =>
    setOtherItems((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "" },
    ]);
  const removeOtherItem = (index: number) => {
    if (!confirmDeletion("este item adicional")) return;
    setOtherItems((prev) => prev.filter((_, i) => i !== index));
  };
  const updateOtherItem = (
    index: number,
    field: keyof OtherItem,
    value: string,
  ) => {
    setOtherItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  async function handleCreateQuickClient() {
    const state = quickClient.state.trim().toUpperCase();
    if (
      !quickClient.companyName.trim() ||
      onlyDigits(quickClient.cnpj).length < 11 ||
      !quickClient.phone.trim() ||
      !quickClient.address.trim() ||
      !quickClient.city.trim() ||
      state.length !== 2
    ) {
      setFeedback({
        kind: "error",
        text: "Informe nome, CPF/CNPJ, telefone, endereco, cidade e UF.",
      });
      return;
    }

    setQuickClientSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch(apiUrl("/clients"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: quickClient.companyName.trim(),
          tradeName: quickClient.tradeName.trim() || undefined,
          cnpj: onlyDigits(quickClient.cnpj),
          email: quickClient.email.trim() || undefined,
          phone: quickClient.phone.trim(),
          address: quickClient.address.trim(),
          city: quickClient.city.trim(),
          state,
          clientType: "NO_CONTRACT",
          addresses: [
            {
              type: "INSTALLATION",
              street: quickClient.address.trim(),
              city: quickClient.city.trim(),
              state,
              country: "Brasil",
            },
          ],
          contacts: quickClient.contactName.trim()
            ? [
                {
                  name: quickClient.contactName.trim(),
                  status: "ACTIVE",
                  role: "Contato comercial",
                  phone: quickClient.phone.trim(),
                  email: quickClient.email.trim() || undefined,
                },
              ]
            : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao cadastrar cliente."),
        );
      }

      const created = (await res.json()) as Client;
      setSelectedClientId(created.id);
      setClientSearch(formatClientOption(created));
      setClients((current) => [
        created,
        ...current.filter((c) => c.id !== created.id),
      ]);
      setSelectedEquipmentId("");
      setEquipmentSearch("");
      setQuickClientOpen(false);
      setQuickClient({
        companyName: "",
        tradeName: "",
        cnpj: "",
        phone: "",
        email: "",
        contactName: "",
        address: "",
        city: "",
        state: "",
      });
      setFeedback({
        kind: "success",
        text: "Cliente cadastrado e selecionado.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Falha ao cadastrar cliente.",
      });
    } finally {
      setQuickClientSaving(false);
    }
  }

  async function handleCreateQuickGenerator() {
    if (!selectedClientId) {
      setFeedback({
        kind: "error",
        text: "Selecione o cliente antes da maquina.",
      });
      return;
    }
    if (selectedClient?.proposalCreationBlocked) {
      setFeedback({
        kind: "error",
        text: selectedClient.proposalBlockReason
          ? `Propostas bloqueadas para este cliente: ${selectedClient.proposalBlockReason}`
          : "Propostas bloqueadas para este cliente. Consulte o responsavel comercial.",
      });
      return;
    }
    if (!quickGenerator.name.trim()) {
      setFeedback({
        kind: "error",
        text: "Informe o nome/apelido da maquina.",
      });
      return;
    }

    setQuickGeneratorSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch(apiUrl("/proposals/quick-generator"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          name: quickGenerator.name.trim(),
          assetTag: quickGenerator.assetTag.trim() || undefined,
          brand: quickGenerator.brand.trim() || undefined,
          modelName: quickGenerator.modelName.trim() || undefined,
          serialNumber: quickGenerator.serialNumber.trim() || undefined,
          power: quickGenerator.power
            ? Number(quickGenerator.power)
            : undefined,
          voltage: quickGenerator.voltage.trim() || undefined,
          installationSite: quickGenerator.installationSite.trim() || undefined,
          notes: quickGenerator.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao cadastrar maquina."),
        );
      }

      const created = (await res.json()) as Generator;
      setSelectedEquipmentId(created.id);
      setEquipmentSearch(formatGeneratorOption(created));
      setGenerators((current) => [
        created,
        ...current.filter((g) => g.id !== created.id),
      ]);
      setQuickGeneratorOpen(false);
      setQuickGenerator({
        name: "",
        assetTag: "",
        brand: "",
        modelName: "",
        serialNumber: "",
        power: "",
        voltage: "",
        installationSite: "",
        notes: "",
      });
      setFeedback({
        kind: "success",
        text: "Maquina cadastrada e selecionada.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Falha ao cadastrar maquina.",
      });
    } finally {
      setQuickGeneratorSaving(false);
    }
  }

  const selectedScopeTemplates = useMemo(
    () =>
      scopeTemplates.filter((template) =>
        selectedScopeTemplateIds.includes(template.id),
      ),
    [scopeTemplates, selectedScopeTemplateIds],
  );
  const combinedScopeText = useMemo(
    () =>
      joinScopeTexts(
        selectedScopeTemplates.map((template) => template.scopeText),
      ),
    [selectedScopeTemplates],
  );
  function appendScopeTemplates() {
    if (!combinedScopeText) return;
    const additions = selectedScopeTemplates
      .map((template) => template.scopeText.trim())
      .filter((text) => text && !scope.includes(text));
    setScope([scope.trim(), ...additions].filter(Boolean).join("\n\n"));
    setSelectedScopeTemplateIds([]);
  }

  async function uploadScopeTxt(file?: File) {
    if (!file) return;
    setScopeUploadBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiFetch("/proposals/scope-templates/upload", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao importar o TXT."),
        );
      }
      const imported = (await response.json()) as ScopeTemplate;
      setScopeTemplates((current) => [...current, imported]);
      setScopeTemplatesError("");
      setScopeSearch("");
      setSelectedScopeTemplateIds((current) => [...current, imported.id]);
      setFeedback({
        kind: "success",
        text: `Escopo “${imported.name}” importado. Selecione Adicionar ao escopo para usar.`,
      });
    } catch (cause: unknown) {
      setFeedback({
        kind: "error",
        text:
          cause instanceof Error ? cause.message : "Falha ao importar o TXT.",
      });
    } finally {
      setScopeUploadBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setMachineBaseItems([]);
    setSelectedMachineBaseItemIds([]);
    if (!selectedEquipmentId || !serviceType) return;

    setLoadingBaseItems(true);
    void apiFetch(
      apiUrl(
        `/generators/${selectedEquipmentId}/base-items?group=${serviceType}`,
      ),
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, "Falha ao buscar itens da maquina."),
          );
        }
        const payload = (await res.json()) as MachineBaseItem[];
        if (cancelled) return;
        setMachineBaseItems(payload);
        setSelectedMachineBaseItemIds(payload.map((item) => item.id));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            text:
              loadError instanceof Error
                ? loadError.message
                : "Erro ao carregar itens da maquina.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBaseItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEquipmentId, serviceType]);

  const addItemsFromEquipmentBase = () => {
    const selectedItems = machineBaseItems.filter((item) =>
      selectedMachineBaseItemIds.includes(item.id),
    );
    if (selectedItems.length === 0) {
      setFeedback({
        kind: "error",
        text: "Selecione ao menos um item da maquina.",
      });
      return;
    }

    const existingIds = new Set(
      [...parts, ...labor].map((item) => item.catalogItemId).filter(Boolean),
    );
    const uniqueItems = selectedItems.filter(
      (item) => !existingIds.has(item.catalogItemId),
    );
    const duplicates = selectedItems.length - uniqueItems.length;
    const toPart: RowItem[] = uniqueItems
      .filter((item) => item.catalogItem?.type !== "SERVICE")
      .map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: String(item.quantity ?? 1),
        unitPrice: String(item.catalogItem?.basePrice ?? 0),
        origin: "MACHINE",
      }));
    const toLabor: RowItem[] = uniqueItems
      .filter((item) => item.catalogItem?.type === "SERVICE")
      .map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: String(item.quantity ?? 1),
        unitPrice: String(item.catalogItem?.basePrice ?? 0),
        origin: "MACHINE",
      }));

    setPartOptions((current) =>
      mergeCatalogOptions(current, toPart, machineBaseItems),
    );
    setServiceOptions((current) =>
      mergeCatalogOptions(current, toLabor, machineBaseItems),
    );
    setParts((current) => [...current, ...toPart]);
    setLabor((current) => [...current, ...toLabor]);
    setFeedback({
      kind: "success",
      text: `${uniqueItems.length} item(ns) da maquina adicionado(s)${duplicates ? `; ${duplicates} duplicado(s) ignorado(s)` : ""}.`,
    });
  };

  const selectedPartItems = useMemo(
    () => [
      ...parts.flatMap((row) => {
        const item = partOptions.find(
          (option) => option.id === row.catalogItemId,
        );
        return item
          ? [{ name: item.name, quantity: Number(row.quantity || 0) }]
          : [];
      }),
      ...otherItems
        .filter((row) => row.description.trim())
        .map((row) => ({
          name: row.description,
          quantity: Number(row.quantity || 0),
        })),
    ],
    [parts, partOptions, otherItems],
  );

  const accessoryWarnings = useMemo(
    () =>
      buildProposalAccessoryWarnings(
        accessoryRules,
        selectedPartItems,
        selectedPartItems,
      ),
    [accessoryRules, selectedPartItems],
  );
  const accessoryWarningKeys = accessoryWarnings
    .map((warning) => `${warning.rule.id}:${warning.rule.name}`)
    .join("|");

  useEffect(() => {
    setAssistanceReviews((current) => {
      const valid = Object.entries(current).filter(([id, review]) =>
        accessoryWarnings.some(
          (warning) =>
            warning.rule.id === id && warning.signature === review.signature,
        ),
      );
      return valid.length === Object.keys(current).length
        ? current
        : Object.fromEntries(valid);
    });
  }, [accessoryWarnings]);

  useEffect(() => {
    const pending = accessoryWarnings.filter(
      (warning) => !(warning.rule.id in accessoryCandidates),
    );
    if (pending.length === 0) return;
    let cancelled = false;

    void Promise.all(
      pending.map(async (warning) => {
        const terms = Array.from(
          new Set([
            warning.rule.name,
            normalizeProposalItemName(warning.rule.name).toLowerCase(),
          ]),
        );
        const responses = await Promise.allSettled(
          terms.map(async (term) => {
            const params = new URLSearchParams({
              type: "PART",
              take: "10",
              q: term,
            });
            const response = await apiFetch(
              apiUrl(`/catalogs/lookup?${params.toString()}`),
              { cache: "no-store" },
            );
            return response.ok
              ? ((await response.json()) as CatalogItem[])
              : [];
          }),
        );
        const options = responses.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        );
        const needle = normalizeProposalItemName(warning.rule.name);
        return [
          warning.rule.id,
          Array.from(
            new Map(
              options
                .filter((item) =>
                  normalizeProposalItemName(item.name).includes(needle),
                )
                .map((item) => [item.id, item]),
            ).values(),
          ).slice(0, 4),
        ] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      setAccessoryCandidates((current) => ({
        ...current,
        ...Object.fromEntries(results),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [accessoryWarningKeys, accessoryWarnings, accessoryCandidates]);

  function addSuggestedAccessory(
    warning: ProposalAccessoryWarning,
    item: CatalogItem,
  ) {
    if (!Number.isFinite(item.basePrice) || Number(item.basePrice) <= 0) {
      setFeedback({
        kind: "error",
        text: "Este acessório está sem preço no catálogo. Revise o cadastro antes de incluí-lo.",
      });
      return;
    }
    setPartOptions((current) =>
      Array.from(
        new Map(
          [...current, item].map((option) => [option.id, option]),
        ).values(),
      ),
    );
    setParts((current) => {
      const existingIndex = current.findIndex(
        (row) => row.catalogItemId === item.id,
      );
      if (existingIndex < 0) {
        return [
          ...current,
          {
            catalogItemId: item.id,
            quantity: String(warning.missingQuantity),
            unitPrice: String(item.basePrice ?? 0),
            origin: "GENERAL",
          },
        ];
      }
      return current.map((row, index) =>
        index === existingIndex
          ? {
              ...row,
              quantity: String(
                Number(row.quantity || 0) + warning.missingQuantity,
              ),
            }
          : row,
      );
    });
    setFeedback({
      kind: "success",
      text: `${item.name} incluído na proposta para conferência.`,
    });
  }

  function reviewAccessoryWarning(warning: ProposalAccessoryWarning) {
    const reason = (
      assistanceReasons[warning.rule.id] ??
      assistanceReviews[warning.rule.id]?.reason ??
      ""
    ).trim();
    if (reason.length < 8) {
      setFeedback({
        kind: "error",
        text: "Explique em pelo menos 8 caracteres por que o acessório não será incluído.",
      });
      return;
    }
    setAssistanceReviews((current) => ({
      ...current,
      [warning.rule.id]: { signature: warning.signature, reason },
    }));
    setFeedback(null);
  }

  const partsTotal = useMemo(
    () =>
      parts.reduce(
        (acc, item) =>
          acc + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    [parts],
  );
  const laborTotal = useMemo(
    () =>
      labor.reduce(
        (acc, item) =>
          acc + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    [labor],
  );
  const hourlyTotal = useMemo(
    () =>
      hourlyServices.reduce((acc, item) => {
        const rate =
          hourlyRates.find(
            (entry) =>
              entry.hourType === item.hourType &&
              entry.technicianType === item.technicianType,
          )?.unitPrice ?? 0;
        const gross = Number(item.hours || 0) * rate;
        const discount = Math.min(
          100,
          Math.max(0, Number(item.discountPercent || 0)),
        );
        return acc + gross * (1 - discount / 100);
      }, 0),
    [hourlyServices, hourlyRates],
  );
  const otherTotal = useMemo(
    () =>
      otherItems.reduce(
        (acc, item) =>
          acc + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    [otherItems],
  );
  const expensesTotal = roundMoney(
    operationalExpensesTotal(operationalExpenses),
  );
  const partsSubtotal = roundMoney(partsTotal);
  const servicesSubtotal = roundMoney(laborTotal + hourlyTotal + otherTotal);
  const subtotal = roundMoney(expensesTotal + partsSubtotal + servicesSubtotal);
  const discountableSubtotal = roundMoney(
    partsSubtotal +
      servicesSubtotal +
      (allowOperationalExpenseDiscount ? expensesTotal : 0),
  );

  const maxDiscountAllowed =
    USER_ROLE === "ADMIN"
      ? discountableSubtotal
      : roundMoney(discountableSubtotal * 0.07);

  const finalDiscount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      let percent = Math.min(100, Math.max(0, Number(discountInput) || 0));
      if (USER_ROLE === "NORMAL" && percent > 7) percent = 7;
      return roundMoney(discountableSubtotal * (percent / 100));
    }

    let value = Math.max(0, Number(discountInput) || 0);
    value = Math.min(value, discountableSubtotal);
    if (USER_ROLE === "NORMAL" && value > maxDiscountAllowed)
      value = maxDiscountAllowed;
    return roundMoney(value);
  }, [
    discountInput,
    discountType,
    discountableSubtotal,
    maxDiscountAllowed,
    USER_ROLE,
  ]);

  const commercialBreakdown = useMemo(
    () =>
      buildCommercialBreakdown(
        [
          {
            key: "EXPENSES",
            label: "Despesas operacionais",
            subtotal: expensesTotal,
            discountEligible: allowOperationalExpenseDiscount,
          },
          {
            key: "PARTS",
            label: "Peças e materiais",
            subtotal: partsSubtotal,
            discountEligible: true,
          },
          {
            key: "SERVICES",
            label: "Serviços",
            subtotal: servicesSubtotal,
            discountEligible: true,
          },
        ],
        finalDiscount,
      ),
    [
      allowOperationalExpenseDiscount,
      expensesTotal,
      finalDiscount,
      partsSubtotal,
      servicesSubtotal,
    ],
  );
  const grandTotal = roundMoney(
    commercialBreakdown.reduce((sum, entry) => sum + entry.total, 0),
  );
  const effectiveDiscountPercent =
    discountableSubtotal > 0 ? (finalDiscount / discountableSubtotal) * 100 : 0;
  const composedPayment = paymentComposition(grandTotal, paymentPlan);
  const entryAmount = paymentPlan
    ? composedPayment.entry
    : hasDownPayment
      ? Math.min(grandTotal, Math.max(0, Number(downPaymentAmount || 0)))
      : 0;
  const remainingAfterEntry = Math.max(0, grandTotal - entryAmount);
  const installments = paymentPlan
    ? Math.max(1, composedPayment.count)
    : Math.max(1, Number(installmentCount || 1));
  const installmentValue = remainingAfterEntry / installments;

  const hitDiscountLimit =
    USER_ROLE === "NORMAL" &&
    ((discountType === "PERCENTAGE" && Number(discountInput) > 7) ||
      (discountType === "VALUE" && Number(discountInput) > maxDiscountAllowed));
  const latestInspection = linkedOpportunity?.inspections?.[0] || null;

  function changeStep(next: number) {
    setStep(Math.max(0, Math.min(PROPOSAL_STEPS.length - 1, next)));
    setFeedback(null);
    focusProposalStep();
  }

  function showStepError(target: number, text: string) {
    setStep(target);
    setFeedback({ kind: "error", text });
    focusProposalStep();
  }

  function validateStep(target: number, final = false): string | null {
    if (target === 0) {
      if (paymentPlan?.preset === "CUSTOM" && !paymentTerm.trim())
        return "Descreva a condição especial de pagamento.";
      if (
        paymentPlan &&
        (!Number.isFinite(paymentPlan.entryValue) ||
          paymentPlan.entryValue < 0 ||
          (paymentPlan.entryType === "PERCENTAGE" &&
            paymentPlan.entryValue > 100))
      )
        return "Informe uma entrada válida entre 0 e 100%, ou em valor.";
      if (
        paymentPlan &&
        final &&
        paymentPlan.entryType === "VALUE" &&
        paymentPlan.entryValue > grandTotal
      )
        return "A entrada não pode ser maior que o total da proposta.";
      if (
        paymentPlan &&
        (!Number.isInteger(paymentPlan.balanceInstallments) ||
          paymentPlan.balanceInstallments < 0 ||
          paymentPlan.balanceInstallments > 36 ||
          (final &&
            composedPayment.balance > 0 &&
            paymentPlan.balanceInstallments < 1))
      )
        return "Informe de 1 a 36 parcelas para o saldo.";
      if (!selectedClientId)
        return "Selecione um cliente na lista de resultados.";
      if (selectedClient?.proposalCreationBlocked)
        return (
          selectedClient.proposalBlockReason ||
          "Este cliente está bloqueado para novas propostas."
        );
      if (!selectedSellerId) return "Selecione um vendedor comercial.";
      if (
        final &&
        partsSubtotal > 0 &&
        paymentProfiles.some((p) => p.purpose === "PARTS") &&
        !partsPaymentProfileId
      )
        return "Selecione a conta Manitec para pagamento de peças.";
      if (
        final &&
        servicesSubtotal > 0 &&
        paymentProfiles.some((p) => p.purpose === "SERVICES") &&
        !servicesPaymentProfileId
      )
        return "Selecione a conta Manitec para pagamento de serviços.";
      if (!paymentPlan && hasDownPayment && Number(downPaymentAmount) <= 0)
        return "Informe um valor de entrada maior que zero.";
      if (
        !paymentPlan &&
        hasDownPayment &&
        final &&
        Number(downPaymentAmount) > grandTotal
      )
        return "A entrada não pode ser maior que o total da proposta.";
      if (
        !Number.isInteger(Number(installmentCount)) ||
        Number(installmentCount) < 1
      )
        return "Informe uma quantidade de parcelas maior ou igual a 1.";
      if (
        !Number.isInteger(Number(installmentIntervalDays)) ||
        Number(installmentIntervalDays) < 1
      )
        return "Informe um intervalo entre parcelas maior ou igual a 1 dia.";
      if (
        deliveryLeadTimeDays &&
        (!Number.isInteger(Number(deliveryLeadTimeDays)) ||
          Number(deliveryLeadTimeDays) < 0)
      )
        return "Informe um prazo de entrega válido em dias inteiros.";
    }
    if (target === 1) {
      if (parts.some((item) => !item.catalogItemId))
        return "Selecione cada peça na lista de resultados do catálogo.";
      if (
        parts.some(
          (item) =>
            !Number.isFinite(Number(item.quantity)) ||
            Number(item.quantity) < 1,
        )
      )
        return "Informe uma quantidade válida para cada peça.";
      if (assistanceLoadState !== "ready")
        return "Carregue a conferência de itens complementares antes de continuar.";
      if (
        accessoryWarnings.some(
          (warning) =>
            assistanceReviews[warning.rule.id]?.signature !== warning.signature,
        )
      )
        return "Revise os itens complementares antes de continuar.";
    }
    if (target === 2) {
      if (
        parts.length +
          labor.length +
          hourlyServices.length +
          otherItems.length ===
        0
      )
        return "Adicione pelo menos uma peça ou serviço à proposta.";
      if (labor.some((item) => !item.catalogItemId))
        return "Selecione cada serviço na lista de resultados do catálogo.";
      if (labor.some((item) => Number(item.unitPrice) <= 0))
        return "Há um serviço sem preço cadastrado no catálogo.";
      if (
        labor.some(
          (item) =>
            !Number.isFinite(Number(item.quantity)) ||
            Number(item.quantity) < 1,
        )
      )
        return "Informe uma quantidade válida para cada serviço.";
      if (hourlyServices.some((item) => hourlyRateFor(item) <= 0))
        return "Há um serviço por hora sem tarifa ativa no Manitec Studio.";
      if (
        hourlyServices.some(
          (item) =>
            !Number.isFinite(Number(item.hours)) || Number(item.hours) <= 0,
        )
      )
        return "Informe a quantidade de horas de cada serviço.";
      if (
        otherItems.some(
          (item) =>
            !item.description.trim() ||
            Number(item.quantity) < 1 ||
            !Number.isFinite(Number(item.quantity)) ||
            Number(item.unitPrice) < 0 ||
            !Number.isFinite(Number(item.unitPrice)),
        )
      )
        return "Preencha a descrição, a quantidade e o valor dos outros itens.";
    }
    return null;
  }

  function nextStep() {
    const issue = validateStep(step);
    if (issue) {
      showStepError(step, issue);
      return;
    }
    changeStep(step + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (step < PROPOSAL_STEPS.length - 1) {
      nextStep();
      return;
    }
    for (let index = 0; index < 3; index += 1) {
      const issue = validateStep(index, true);
      if (issue) {
        showStepError(index, issue);
        return;
      }
    }

    const assistanceAudit = accessoryWarnings
      .map(
        (warning) =>
          `- ${warning.rule.code} → ${warning.rule.name}: ${assistanceReviews[warning.rule.id]?.reason ?? ""}`,
      )
      .join("\n");

    setIsSubmitting(true);
    setFeedback(null);

    const allItems = [
      ...parts
        .filter((item) => item.catalogItemId)
        .map((item) => ({
          kind: "PART_MATERIAL",
          catalogItemId: item.catalogItemId,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
      ...labor
        .filter((item) => item.catalogItemId)
        .map((item) => ({
          kind: "CATALOG_SERVICE",
          catalogItemId: item.catalogItemId,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
      ...hourlyServices.map((item) => ({
        kind: "HOURLY_SERVICE",
        description: item.description || "Servico por hora",
        hourType: item.hourType,
        technicianType: item.technicianType,
        hours: Number(item.hours || 0),
        unitPrice: hourlyRateFor(item),
        discountPercent: Number(item.discountPercent || 0),
      })),
      ...otherItems.map((item) => ({
        kind: "OTHER",
        description: item.description,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      })),
    ];

    const payload = {
      clientId: selectedClientId,
      salesOpportunityId: linkedOpportunity?.id || undefined,
      generatorId: selectedEquipmentId || undefined,
      userId: selectedSellerId,
      type: proposalFormType,
      scope,
      freight,
      validUntil: validUntil || undefined,
      paymentTerm: paymentTerm || undefined,
      deliveryLeadTimeDays: deliveryLeadTimeDays
        ? Number(deliveryLeadTimeDays)
        : undefined,
      partsPaymentProfileId: partsPaymentProfileId || undefined,
      servicesPaymentProfileId: servicesPaymentProfileId || undefined,
      paymentPlan: paymentPlan || undefined,
      hasDownPayment: entryAmount > 0,
      downPaymentAmount: entryAmount > 0 ? entryAmount : undefined,
      installmentCount: installments,
      installmentIntervalDays:
        !paymentPlan && installmentIntervalDays
          ? Number(installmentIntervalDays)
          : undefined,
      firstDueDate: !paymentPlan && firstDueDate ? firstDueDate : undefined,
      internalNotes: [
        internalNotes.trim(),
        assistanceAudit
          ? `Conferência de itens complementares (não incluídos):\n${assistanceAudit}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      externalNotes,
      discount: finalDiscount,
      allowOperationalExpenseDiscount,
      operationalExpenses: operationalExpenses
        .filter((item) => item.quantity > 0)
        .map((item) => ({
          expenseType: item.expenseType,
          quantity: item.quantity,
        })),
      items: allItems,
    };

    try {
      const res = await apiFetch(
        apiUrl(
          editingProposalId ? `/proposals/${editingProposalId}` : "/proposals",
        ),
        {
          method: editingProposalId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        setFeedback({
          kind: "error",
          text: await readApiErrorMessage(res, "Erro ao salvar a proposta."),
        });
        return;
      }

      const createdProposal = (await res.json().catch(() => null)) as {
        id?: string;
      } | null;
      setFeedback({
        kind: "success",
        text: editingProposalId
          ? "Rascunho salvo. Redirecionando..."
          : "Proposta gerada com sucesso. Redirecionando...",
      });
      router.push(
        createdProposal?.id || editingProposalId
          ? `/dashboard/proposals/${createdProposal?.id || editingProposalId}`
          : "/dashboard/proposals",
      );
      router.refresh();
    } catch {
      setFeedback({
        kind: "error",
        text: "Erro de comunicacao com o servidor.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  if (!accessReady)
    return (
      <div className="dashboard-page p-6 text-sm text-slate-500">
        Carregando permissões...
      </div>
    );
  if (
    !canUsePortfolio(
      proposalFormType === "CONTRACT" ? "contracts" : "partsServices",
    )
  )
    return (
      <div className="dashboard-page p-6">
        Seu departamento não possui acesso a esta carteira de propostas.
      </div>
    );
  return (
    <div className="dashboard-page proposal-flow-page space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title={
          editingProposalId
            ? `Editar rascunho ${editingProposalCode || ""}`
            : proposalFormType === "CONTRACT"
              ? "Nova proposta de contrato"
              : "Nova proposta de peças e serviços"
        }
        description="Prepare a proposta por etapas e acompanhe os valores enquanto edita."
        actions={
          <Link
            href={
              editingProposalId
                ? "/dashboard/proposals/" + editingProposalId
                : "/dashboard/proposals"
            }
            className="proposal-context-link"
          >
            Voltar às propostas
          </Link>
        }
      />

      {loadingOpportunity ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Carregando oportunidade vinculada...
        </div>
      ) : null}

      {linkedOpportunityError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {linkedOpportunityError}
        </div>
      ) : null}

      {linkedOpportunity ? (
        <section
          className="proposal-opportunity"
          aria-label="Oportunidade vinculada"
        >
          <div className="proposal-opportunity-main">
            <span className="proposal-opportunity-icon" aria-hidden>
              ↗
            </span>
            <div className="min-w-0">
              <p>
                Oportunidade vinculada ·{" "}
                {commercialLabel(linkedOpportunity.stage)}
              </p>
              <strong>{linkedOpportunity.title}</strong>
            </div>
            <Link
              href={
                "/dashboard/opportunities?opportunityId=" + linkedOpportunity.id
              }
              className="proposal-context-link"
            >
              Ver oportunidade ↗
            </Link>
          </div>
          <details>
            <summary>Mais informações</summary>
            <dl className="proposal-review-grid">
              <div>
                <dt>Carteira comercial</dt>
                <dd>{commercialLabel(linkedOpportunity.pipeline)}</dd>
              </div>
              <div>
                <dt>Tipo de atendimento</dt>
                <dd>{commercialLabel(linkedOpportunity.opportunityType)}</dd>
              </div>
              <div>
                <dt>Responsável comercial</dt>
                <dd>
                  {linkedOpportunity.assignedSeller?.name || "Não definido"}
                </dd>
              </div>
              {linkedOpportunity.proposals?.[0] ? (
                <div>
                  <dt>Última proposta</dt>
                  <dd>
                    <Link
                      className="proposal-context-link"
                      href={
                        "/dashboard/proposals/" +
                        linkedOpportunity.proposals[0].id
                      }
                    >
                      {linkedOpportunity.proposals[0].code}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
            {latestInspection ? (
              <div className="mt-4 text-sm text-slate-600">
                <strong>Última vistoria: {latestInspection.code}</strong> ·{" "}
                {INSPECTION_STATUS_LABEL[latestInspection.status] ||
                  commercialLabel(latestInspection.status)}
                {latestInspection.technicalNotes ? (
                  <p className="mt-2">{latestInspection.technicalNotes}</p>
                ) : null}
              </div>
            ) : null}
          </details>
        </section>
      ) : null}

      <form
        id="proposal-form"
        onSubmit={handleSubmit}
        noValidate
        className="proposal-wizard space-y-5"
      >
        <p className="text-xs text-slate-500">
          Alçada de desconto:{" "}
          {getDetailedAccess().unrestricted
            ? "administrativa"
            : getDetailedAccess().discountLimit + "%"}
          . Descontos dos itens e do total são considerados em conjunto.
        </p>
        <ProposalSteps
          steps={PROPOSAL_STEPS}
          current={step}
          onChange={changeStep}
        />
        {feedback ? (
          <div
            role="alert"
            className={`rounded-xl px-4 py-3 text-sm ${
              feedback.kind === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="space-y-5">
            <div className="proposal-form-section">
              <h2 className="mb-5 text-base font-bold text-slate-900">
                Cliente e atendimento
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Cliente
                  </label>
                  {linkedOpportunity ? (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <p className="text-sm font-semibold text-zinc-800">
                        {linkedOpportunity.client.companyName}
                      </p>
                      <p className="mt-1 text-xs text-sky-700">
                        Cliente da oportunidade selecionada.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => {
                          setClientSearch(e.target.value);
                          setSelectedClientId("");
                          setSelectedEquipmentId("");
                          setClientDropdownOpen(true);
                        }}
                        onFocus={() => setClientDropdownOpen(true)}
                        onBlur={() =>
                          setTimeout(() => setClientDropdownOpen(false), 150)
                        }
                        placeholder="Pesquisar cliente por nome, fantasia ou CNPJ"
                        className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
                        aria-label="Cliente"
                      />
                      {clientDropdownOpen ? (
                        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl">
                          {clientLookupLoading ? (
                            <p className="p-3 text-sm text-zinc-500">
                              Buscando clientes...
                            </p>
                          ) : clients.length === 0 ? (
                            <p className="p-3 text-sm text-zinc-500">
                              Nenhum cliente encontrado.
                            </p>
                          ) : (
                            clients.slice(0, 10).map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setSelectedClientId(c.id);
                                  setSelectedEquipmentId("");
                                  setEquipmentSearch("");
                                  setClientSearch(formatClientOption(c));
                                  setClientDropdownOpen(false);
                                }}
                                className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-emerald-50 last:border-0"
                              >
                                <p className="text-sm font-semibold text-zinc-800">
                                  {c.companyName}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {c.tradeName || "-"}
                                  {c.cnpj ? ` | ${c.cnpj}` : ""}
                                </p>
                                {c.proposalCreationBlocked ? (
                                  <p className="mt-1 text-xs font-semibold text-rose-600">
                                    Propostas bloqueadas
                                  </p>
                                ) : null}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {!linkedOpportunity ? (
                    <button
                      type="button"
                      onClick={() => setQuickClientOpen((current) => !current)}
                      className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-600"
                    >
                      {quickClientOpen
                        ? "Fechar cliente rapido"
                        : "Cliente rapido"}
                    </button>
                  ) : null}
                  {selectedClient?.proposalCreationBlocked ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      Bloqueio comercial:{" "}
                      {selectedClient.proposalBlockReason ||
                        "consulte o responsavel comercial"}
                      .
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Equipamento
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={equipmentSearch}
                      onChange={(e) => {
                        setEquipmentSearch(e.target.value);
                        setSelectedEquipmentId("");
                        setEquipmentDropdownOpen(true);
                      }}
                      onFocus={() => setEquipmentDropdownOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setEquipmentDropdownOpen(false), 150)
                      }
                      disabled={!selectedClientId}
                      placeholder={
                        selectedClientId
                          ? "Pesquisar maquina"
                          : "Escolha o cliente"
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-500 disabled:bg-zinc-100"
                      aria-label="Equipamento"
                    />
                    {equipmentDropdownOpen &&
                    selectedClientId &&
                    !selectedEquipmentId ? (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl">
                        {equipmentLookupLoading ? (
                          <p className="p-3 text-sm text-zinc-500">
                            Buscando maquinas...
                          </p>
                        ) : availableGenerators.length === 0 ? (
                          <p className="p-3 text-sm text-zinc-500">
                            Nenhuma maquina encontrada.
                          </p>
                        ) : (
                          availableGenerators.slice(0, 10).map((gen) => (
                            <button
                              key={gen.id}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setSelectedEquipmentId(gen.id);
                                setEquipmentSearch(formatGeneratorOption(gen));
                                setEquipmentDropdownOpen(false);
                              }}
                              className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-emerald-50 last:border-0"
                            >
                              <p className="text-sm font-semibold text-zinc-800">
                                {gen.name || "Maquina"}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {[
                                  gen.assetTag,
                                  gen.serialNumber,
                                  gen.power ? `${gen.power} kVA` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" | ") || "Sem tag/serie"}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickGeneratorOpen((current) => !current)}
                    disabled={!selectedClientId}
                    className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-600 disabled:text-zinc-400"
                  >
                    {quickGeneratorOpen
                      ? "Fechar maquina rapida"
                      : "Maquina rapida"}
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Vendedor
                  </label>
                  {linkedOpportunity?.assignedSeller ? (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <p className="text-sm font-semibold text-zinc-800">
                        {linkedOpportunity.assignedSeller.name}
                      </p>
                      <p className="mt-1 text-xs text-sky-700">
                        Herdado da oportunidade.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={sellerSearch}
                        onChange={(e) => {
                          setSellerSearch(e.target.value);
                          setSelectedSellerId("");
                          setSellerDropdownOpen(true);
                        }}
                        onFocus={() => setSellerDropdownOpen(true)}
                        onBlur={() =>
                          setTimeout(() => setSellerDropdownOpen(false), 150)
                        }
                        placeholder="Pesquisar vendedor comercial"
                        className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
                        aria-label="Vendedor"
                      />
                      {sellerDropdownOpen && !selectedSellerId ? (
                        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl">
                          {sellerLookupLoading ? (
                            <p className="p-3 text-sm text-zinc-500">
                              Buscando vendedores...
                            </p>
                          ) : sellers.length === 0 ? (
                            <p className="p-3 text-sm text-zinc-500">
                              Nenhum vendedor encontrado.
                            </p>
                          ) : (
                            sellers.slice(0, 10).map((seller) => (
                              <button
                                key={seller.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setSelectedSellerId(seller.id);
                                  setSellerSearch(seller.name || "");
                                  setSellerDropdownOpen(false);
                                }}
                                className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-emerald-50 last:border-0"
                              >
                                <p className="text-sm font-semibold text-zinc-800">
                                  {seller.name}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {seller.department ||
                                    seller.email ||
                                    "Comercial"}
                                </p>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Tipo de Servico
                  </label>
                  <SelectField
                    searchable
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    disabled={!selectedEquipmentId}
                    className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 font-semibold text-emerald-700 disabled:bg-zinc-100"
                    aria-label="Tipo de serviço"
                  >
                    <option value="">Selecione</option>
                    <option value="TBC">TBC - bateria e carregador</option>
                    <option value="TOF">TOF - troca de oleo e filtros</option>
                    <option value="TROCA_MANGUEIRAS">
                      Troca de mangueiras
                    </option>
                    <option value="ARREFECIMENTO">
                      Sistema de arrefecimento
                    </option>
                    <option value="TM">TM</option>
                    <option value="TB">TB</option>
                    <option value="TMA">TMA</option>
                    <option value="OUTROS">Outros</option>
                  </SelectField>
                </div>
              </div>

              {quickClientOpen && !linkedOpportunity ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Razao social/nome"
                      value={quickClient.companyName}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          companyName: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Nome fantasia"
                      value={quickClient.tradeName}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          tradeName: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="CPF/CNPJ"
                      value={quickClient.cnpj}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          cnpj: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Telefone"
                      value={quickClient.phone}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          phone: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="E-mail"
                      value={quickClient.email}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          email: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Contato"
                      value={quickClient.contactName}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          contactName: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm md:col-span-2"
                      placeholder="Endereco"
                      value={quickClient.address}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          address: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Cidade"
                      value={quickClient.city}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          city: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="UF"
                      maxLength={2}
                      value={quickClient.state}
                      onChange={(e) =>
                        setQuickClient((current) => ({
                          ...current,
                          state: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={quickClientSaving}
                      onClick={handleCreateQuickClient}
                      className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {quickClientSaving ? "Salvando..." : "Salvar cliente"}
                    </button>
                  </div>
                </div>
              ) : null}

              {quickGeneratorOpen && selectedClientId ? (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Nome/apelido"
                      value={quickGenerator.name}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          name: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Tag patrimonial"
                      value={quickGenerator.assetTag}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          assetTag: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Fabricante"
                      value={quickGenerator.brand}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          brand: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Modelo"
                      value={quickGenerator.modelName}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          modelName: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Numero de serie"
                      value={quickGenerator.serialNumber}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          serialNumber: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Potencia kVA"
                      type="number"
                      min="0"
                      value={quickGenerator.power}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          power: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Tensao"
                      value={quickGenerator.voltage}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          voltage: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm"
                      placeholder="Local/site"
                      value={quickGenerator.installationSite}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          installationSite: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="rounded border border-sky-200 bg-white p-2 text-sm md:col-span-3"
                      placeholder="Observacao"
                      value={quickGenerator.notes}
                      onChange={(e) =>
                        setQuickGenerator((current) => ({
                          ...current,
                          notes: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={quickGeneratorSaving}
                      onClick={handleCreateQuickGenerator}
                      className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                    >
                      {quickGeneratorSaving ? "Salvando..." : "Salvar maquina"}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedEquipmentId && serviceType ? (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-sky-950">
                        Itens cadastrados nesta maquina
                      </p>
                      <p className="text-xs text-sky-700">
                        Escolha o que deve entrar na proposta. Duplicidades
                        serao ignoradas.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">
                      Origem: maquina instalada
                    </span>
                  </div>
                  {loadingBaseItems ? (
                    <p className="mt-3 text-sm text-sky-700">
                      Carregando itens...
                    </p>
                  ) : machineBaseItems.length === 0 ? (
                    <p className="mt-3 rounded-md bg-white p-3 text-sm text-zinc-500">
                      Nenhum item cadastrado para este tipo de manutencao.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {machineBaseItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-sky-100 bg-white p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedMachineBaseItemIds.includes(
                              item.id,
                            )}
                            onChange={(event) =>
                              setSelectedMachineBaseItemIds((current) =>
                                event.target.checked
                                  ? [...current, item.id]
                                  : current.filter((id) => id !== item.id),
                              )
                            }
                          />
                          <span>
                            <span className="block text-sm font-semibold text-zinc-800">
                              {item.catalogItem?.name || "Item do catalogo"}
                            </span>
                            <span className="block text-xs text-zinc-500">
                              Qtd. {item.quantity}{" "}
                              {item.isCustomized
                                ? "| personalizada"
                                : item.sourceModelBaseItemId
                                  ? "| herdada do modelo"
                                  : "| exclusiva da maquina"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addItemsFromEquipmentBase}
                    disabled={
                      loadingBaseItems ||
                      selectedMachineBaseItemIds.length === 0
                    }
                    className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Adicionar selecionados
                  </button>
                </div>
              ) : null}
            </div>
            <ProposalFormSection
              title="Manitec e pagamento"
              description="Escolha a empresa emitente de cada conta e as condições de pagamento."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Validade
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2.5"
                    aria-label="Validade"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Prazo de entrega (dias)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryLeadTimeDays}
                    onChange={(e) => setDeliveryLeadTimeDays(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2.5"
                    aria-label="Prazo de entrega (dias)"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Frete
                  </label>
                  <SelectField
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2.5"
                    aria-label="Frete"
                  >
                    <option value="FOB">{freightLabel("FOB")}</option>
                    <option value="CIF">{freightLabel("CIF")}</option>
                    <option value="SEM_FRETE">Sem frete</option>
                  </SelectField>
                </div>
                <div className="grid gap-4 md:col-span-4 lg:grid-cols-2">
                  <PaymentProfileSelector
                    label="Pagamento de peças"
                    purpose="PARTS"
                    profiles={paymentProfiles}
                    value={partsPaymentProfileId}
                    onChange={setPartsPaymentProfileId}
                  />
                  <PaymentProfileSelector
                    label="Pagamento de serviços"
                    purpose="SERVICES"
                    profiles={paymentProfiles}
                    value={servicesPaymentProfileId}
                    onChange={setServicesPaymentProfileId}
                  />
                </div>
                <div className="md:col-span-4">
                  <PaymentPlanEditor
                    value={paymentPlan}
                    onChange={setPaymentPlan}
                    paymentTerm={paymentTerm}
                    onTermChange={setPaymentTerm}
                    total={grandTotal}
                    options={paymentTermOptions}
                    blockReason={paymentTermBlockReason}
                  />
                </div>
              </div>
            </ProposalFormSection>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-5">
            <div id="proposal-parts-section" className="proposal-form-section">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">
                    Peças e materiais
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Itens adicionais usam a base geral do sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addPart}
                  className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100"
                >
                  + Adicionar peca
                </button>
              </div>

              {parts.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhuma peca adicionada.
                </p>
              ) : null}

              {parts.map((part, index) => (
                <div key={`part-${index}`} className="proposal-item-row">
                  <div className="proposal-item-name">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Peça{" "}
                      {part.origin === "MACHINE"
                        ? "· sugerida para o equipamento"
                        : ""}
                    </label>
                    <SearchableSelect
                      items={partOptions}
                      value={part.catalogItemId}
                      onChange={(val) =>
                        updatePart(index, "catalogItemId", val)
                      }
                      onSearch={(term) => void lookupCatalog("PART", term)}
                      placeholder="Nome ou codigo"
                    />
                  </div>
                  <div className="w-20">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Qtd
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={part.quantity}
                      onChange={(e) =>
                        updatePart(index, "quantity", e.target.value)
                      }
                      className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Preco (R$)
                    </label>
                    <input
                      type="number"
                      value={part.unitPrice}
                      disabled
                      className="w-full rounded-md border border-zinc-200 bg-zinc-100 p-2 text-sm font-medium text-zinc-500"
                    />
                  </div>
                  <div className="w-32">
                    <span className="mb-1 block text-xs text-slate-500">
                      Total do item
                    </span>
                    <output className="block py-2 text-sm font-semibold tabular-nums text-slate-900">
                      R${" "}
                      {formatMoney(
                        Number(part.quantity || 0) *
                          Number(part.unitPrice || 0),
                      )}
                    </output>
                  </div>
                  <button
                    type="button"
                    aria-label={"Remover peça " + (index + 1)}
                    onClick={() => removePart(index)}
                    className="p-2 text-lg text-red-500 hover:text-slate-700"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <section
              id="proposal-assistance"
              className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm sm:p-6"
              aria-label="Conferência de itens complementares"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">
                    Auxílio à proposta
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    Conferência de itens complementares
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    O sistema pergunta por acessórios comuns quando identifica
                    uma peça relacionada. Confirme cada caso antes de salvar.
                  </p>
                </div>
                {assistanceLoadState === "ready" ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${accessoryWarnings.some((warning) => assistanceReviews[warning.rule.id]?.signature !== warning.signature) ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {
                      accessoryWarnings.filter(
                        (warning) =>
                          assistanceReviews[warning.rule.id]?.signature !==
                          warning.signature,
                      ).length
                    }{" "}
                    pendência(s)
                  </span>
                ) : null}
              </div>

              {assistanceLoadState === "loading" ? (
                <p className="mt-4 text-sm text-slate-600">
                  Carregando lembretes...
                </p>
              ) : null}
              {assistanceLoadState === "error" ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-white p-4">
                  <p className="text-sm text-slate-700">
                    Não foi possível carregar as regras de conferência.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadAccessoryRules()}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}
              {assistanceLoadState === "ready" &&
              accessoryWarnings.length === 0 ? (
                <p className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800">
                  Nenhum item complementar pendente para as peças selecionadas.
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {accessoryWarnings.map((warning) => {
                  const review = assistanceReviews[warning.rule.id];
                  const reviewed = review?.signature === warning.signature;
                  const candidates = accessoryCandidates[warning.rule.id];
                  return (
                    <div
                      key={warning.rule.id}
                      className={`rounded-xl border bg-white p-4 ${reviewed ? "border-emerald-200" : "border-amber-300"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                            Conferir {warning.rule.name}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {warning.rule.description ||
                              `Este item precisa de ${warning.rule.name}?`}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {warning.rule.code}: {warning.triggerQuantity} un.{" "}
                            {warning.rule.name} na proposta:{" "}
                            {warning.accessoryQuantity} un. Quantidade a
                            conferir: {warning.missingQuantity} un.
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${reviewed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                        >
                          {reviewed ? "Justificado" : "Aguardando revisão"}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {candidates === undefined ? (
                          <span className="text-xs text-slate-500">
                            Buscando acessórios no catálogo...
                          </span>
                        ) : null}
                        {candidates?.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() =>
                              addSuggestedAccessory(warning, candidate)
                            }
                            disabled={
                              !Number.isFinite(candidate.basePrice) ||
                              Number(candidate.basePrice) <= 0
                            }
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-900 hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            {Number(candidate.basePrice) > 0
                              ? `+ Incluir ${candidate.name} · ${warning.missingQuantity} un.`
                              : `${candidate.name} · sem preço cadastrado`}
                          </button>
                        ))}
                        {candidates?.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              addPart();
                              document
                                .getElementById("proposal-parts-section")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Adicionar peça manualmente
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <label
                          htmlFor={`assistance-reason-${warning.rule.id}`}
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Se não se aplica, explique o motivo
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            id={`assistance-reason-${warning.rule.id}`}
                            maxLength={500}
                            value={
                              assistanceReasons[warning.rule.id] ??
                              review?.reason ??
                              ""
                            }
                            onChange={(event) => {
                              setAssistanceReasons((current) => ({
                                ...current,
                                [warning.rule.id]: event.target.value,
                              }));
                              setAssistanceReviews((current) => {
                                const next = { ...current };
                                delete next[warning.rule.id];
                                return next;
                              });
                            }}
                            placeholder="Ex.: mangueira já vem com fixação integrada"
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => reviewAccessoryWarning(warning)}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                          >
                            Registrar justificativa
                          </button>
                        </div>
                        {reviewed ? (
                          <p className="mt-2 text-xs text-emerald-700">
                            Justificativa registrada nas observações internas da
                            proposta ao salvar.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-5">
            <div className="proposal-form-section">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">
                    Serviços do catálogo
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Servicos adicionais usam a base geral do sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addLabor}
                  className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100"
                >
                  + Adicionar servico
                </button>
              </div>

              {labor.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhum servico adicionado.
                </p>
              ) : null}

              {labor.map((lab, index) => (
                <div key={`labor-${index}`} className="proposal-item-row">
                  <div className="proposal-item-name">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Serviço{" "}
                      {lab.origin === "MACHINE"
                        ? "· sugerido para o equipamento"
                        : ""}
                    </label>
                    <SearchableSelect
                      items={serviceOptions}
                      value={lab.catalogItemId}
                      onChange={(val) =>
                        updateLabor(index, "catalogItemId", val)
                      }
                      onSearch={(term) => void lookupCatalog("SERVICE", term)}
                      placeholder="Nome ou codigo"
                    />
                  </div>
                  <div className="w-20">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Qtd
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={lab.quantity}
                      onChange={(e) =>
                        updateLabor(index, "quantity", e.target.value)
                      }
                      className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-blue-600">
                      Valor (R$)
                    </label>
                    <output
                      className="block w-full rounded-md border border-zinc-300 bg-white p-2 text-sm font-bold text-purple-700"
                      aria-label="Valor definido no cadastro do servico"
                    >
                      {lab.catalogItemId
                        ? `R$ ${formatMoney(Number(lab.unitPrice || 0))}`
                        : "Selecione"}
                    </output>
                  </div>
                  <div className="w-32">
                    <span className="mb-1 block text-xs text-slate-500">
                      Total do item
                    </span>
                    <output className="block py-2 text-sm font-semibold tabular-nums text-slate-900">
                      R${" "}
                      {formatMoney(
                        Number(lab.quantity || 0) * Number(lab.unitPrice || 0),
                      )}
                    </output>
                  </div>
                  <button
                    type="button"
                    aria-label={"Remover serviço " + (index + 1)}
                    onClick={() => removeLabor(index)}
                    className="p-2 text-lg text-red-500 hover:text-slate-700"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <div className="proposal-form-section">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">
                    Serviços por hora
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Tarifa de venda definida no Manitec Studio. O vendedor
                    informa apenas o tipo e as horas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addHourlyService}
                  disabled={hourlyRates.length === 0}
                  className="rounded-md bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Adicionar hora
                </button>
              </div>

              {hourlyRates.length === 0 ? (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Ainda não há tarifas de hora ativas. Um responsável deve
                  cadastrá-las no Manitec Studio.
                </p>
              ) : null}

              {hourlyServices.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhum servico por hora adicionado.
                </p>
              ) : null}

              {hourlyServices.map((item, index) => {
                const unitPrice = hourlyRateFor(item);
                const gross = Number(item.hours || 0) * unitPrice;
                const discount = Math.min(
                  100,
                  Math.max(0, Number(item.discountPercent || 0)),
                );
                const total = gross * (1 - discount / 100);
                return (
                  <div
                    key={`hourly-${index}`}
                    className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3 md:grid-cols-6"
                  >
                    <input
                      className="rounded-md border border-amber-200 bg-white p-2 text-sm md:col-span-2"
                      placeholder="Descricao"
                      value={item.description}
                      onChange={(e) =>
                        updateHourlyService(
                          index,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                    <SelectField
                      value={item.hourType}
                      onChange={(e) =>
                        updateHourlyService(index, "hourType", e.target.value)
                      }
                      className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                    >
                      {hourTypes
                        .filter((option) =>
                          hourlyRates.some(
                            (rate) => rate.hourType === option.value,
                          ),
                        )
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </SelectField>
                    <SelectField
                      value={item.technicianType}
                      onChange={(e) =>
                        updateHourlyService(
                          index,
                          "technicianType",
                          e.target.value,
                        )
                      }
                      className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                    >
                      {technicianTypes
                        .filter((option) =>
                          hourlyRates.some(
                            (rate) =>
                              rate.hourType === item.hourType &&
                              rate.technicianType === option.value,
                          ),
                        )
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </SelectField>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={item.hours}
                      onChange={(e) =>
                        updateHourlyService(index, "hours", e.target.value)
                      }
                      className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                      placeholder="Horas"
                    />
                    <output
                      className="rounded-md border border-amber-200 bg-white p-2 text-sm font-semibold text-amber-900"
                      aria-label="Valor da hora definido no Studio"
                    >
                      R$ {formatMoney(unitPrice)} / hora
                    </output>
                    <div className="flex items-center gap-2 md:col-span-6">
                      <output
                        className="rounded-md border border-amber-200 bg-white p-2 text-sm text-amber-900"
                        aria-label="Desconto da hora definido pela regra comercial"
                      >
                        Desconto: {discount}%
                      </output>
                      <span className="text-sm font-semibold text-amber-800">
                        Total: R$ {formatMoney(total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeHourlyService(index)}
                        className="ml-auto p-2 text-lg text-red-500 hover:text-slate-700"
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="proposal-form-section">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-800">
                  Outros itens
                </h2>
                <button
                  type="button"
                  onClick={addOtherItem}
                  className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  + Adicionar outro
                </button>
              </div>
              {otherItems.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhum item avulso adicionado.
                </p>
              ) : null}
              {otherItems.map((item, index) => (
                <div
                  key={`other-${index}`}
                  className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:grid-cols-[1fr_100px_140px_auto]"
                >
                  <input
                    className="rounded-md border border-zinc-300 p-2 text-sm"
                    placeholder="Descricao do item"
                    value={item.description}
                    onChange={(e) =>
                      updateOtherItem(index, "description", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="1"
                    className="rounded-md border border-zinc-300 p-2 text-sm"
                    placeholder="Qtd"
                    value={item.quantity}
                    onChange={(e) =>
                      updateOtherItem(index, "quantity", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-md border border-zinc-300 p-2 text-sm"
                    placeholder="Valor"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateOtherItem(index, "unitPrice", e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeOtherItem(index)}
                    className="p-2 text-lg text-red-500 hover:text-slate-700"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <div className="proposal-form-section">
              <h2 className="mb-5 text-base font-bold text-slate-900">
                Despesas da operação
              </h2>
              <OperationalExpensesEditor
                value={operationalExpenses}
                onChange={setOperationalExpenses}
              />
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-5">
            <ProposalFormSection
              title="Confira os dados comerciais"
              description="Você pode voltar a qualquer etapa antes de salvar."
            >
              <dl className="proposal-review-grid">
                <div>
                  <dt>Cliente</dt>
                  <dd>
                    {selectedClient?.companyName ||
                      linkedOpportunity?.client.companyName ||
                      "Não selecionado"}
                  </dd>
                </div>
                <div>
                  <dt>Equipamento</dt>
                  <dd>{equipmentSearch || "Sem equipamento vinculado"}</dd>
                </div>
                <div>
                  <dt>Vendedor</dt>
                  <dd>{sellerSearch || "Não selecionado"}</dd>
                </div>
                <div>
                  <dt>Pagamento</dt>
                  <dd>
                    {commercialLabel(paymentTerm, "A combinar")} ·{" "}
                    {installments} parcela(s)
                  </dd>
                </div>
              </dl>
            </ProposalFormSection>
            <ProposalFormSection
              title="Escopo e observações"
              description="Defina o que será entregue e as informações que o cliente verá na proposta."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Escopo
                  </label>
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                        Biblioteca de escopos prontos
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <label className="cursor-pointer rounded border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800">
                          {scopeUploadBusy
                            ? "Importando..."
                            : "Selecionar TXT do computador"}
                          <input
                            type="file"
                            accept=".txt,text/plain"
                            disabled={scopeUploadBusy}
                            className="sr-only"
                            onChange={(event) => {
                              void uploadScopeTxt(event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={appendScopeTemplates}
                          disabled={selectedScopeTemplates.length === 0}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Adicionar ao escopo
                        </button>
                      </div>
                    </div>
                    <p className="mb-2 text-xs leading-5 text-zinc-600">
                      A pesquisa mostra apenas escopos já importados. Selecione
                      um arquivo .txt do seu computador para salvá-lo nesta
                      biblioteca.
                    </p>
                    <input
                      type="search"
                      value={scopeSearch}
                      onChange={(event) => setScopeSearch(event.target.value)}
                      placeholder="Pesquisar escopos por nome, arquivo ou categoria"
                      className="mb-3 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm"
                    />
                    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3">
                      {scopeTemplates
                        .filter((template) =>
                          `${template.name} ${template.category || ""} ${template.sourceFileName || ""}`
                            .toLocaleLowerCase("pt-BR")
                            .includes(
                              scopeSearch.trim().toLocaleLowerCase("pt-BR"),
                            ),
                        )
                        .map((template) => (
                          <label
                            key={template.id}
                            className="flex items-start gap-2 rounded border border-zinc-200 bg-white p-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedScopeTemplateIds.includes(
                                template.id,
                              )}
                              onChange={(e) => {
                                setSelectedScopeTemplateIds((current) =>
                                  e.target.checked
                                    ? [...current, template.id]
                                    : current.filter(
                                        (id) => id !== template.id,
                                      ),
                                );
                              }}
                            />
                            <span>
                              <span className="block font-semibold text-zinc-800">
                                {template.name}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {template.sourceFileName ||
                                  template.category ||
                                  "Escopo comercial"}
                              </span>
                            </span>
                          </label>
                        ))}
                    </div>
                    {scopeTemplatesLoading ? (
                      <p className="mt-2 text-sm text-zinc-500">
                        Carregando escopos...
                      </p>
                    ) : scopeTemplatesError ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span>{scopeTemplatesError}</span>
                        <button
                          type="button"
                          onClick={() => void loadScopeTemplates()}
                          className="underline"
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : scopeTemplates.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-500">
                        Ainda não há TXT importado. Use “Selecionar TXT do
                        computador” para adicionar o primeiro.
                      </p>
                    ) : !scopeTemplates.some((template) =>
                        `${template.name} ${template.category || ""} ${template.sourceFileName || ""}`
                          .toLocaleLowerCase("pt-BR")
                          .includes(
                            scopeSearch.trim().toLocaleLowerCase("pt-BR"),
                          ),
                      ) ? (
                      <p className="mt-2 text-sm text-zinc-500">
                        Nenhum escopo corresponde à pesquisa.
                      </p>
                    ) : null}
                    {combinedScopeText ? (
                      <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-700">
                        {combinedScopeText}
                      </pre>
                    ) : null}
                  </div>
                  <textarea
                    rows={8}
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-3 text-sm"
                    aria-label="Escopo da proposta"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Observações para o cliente
                  </label>
                  <textarea
                    rows={2}
                    value={externalNotes}
                    onChange={(e) => setExternalNotes(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
                    aria-label="Observações para o cliente"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Observações internas
                  </label>
                  <textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
                    aria-label="Observações internas"
                  />
                </div>
              </div>
            </ProposalFormSection>
            <ProposalFormSection
              title="Desconto comercial"
              description="Confira o desconto aplicado e a composição do valor final."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div className="md:col-span-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <label className="col-span-2 flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allowOperationalExpenseDiscount}
                      onChange={(event) =>
                        setAllowOperationalExpenseDiscount(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 accent-rose-600"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        Permitir desconto nas despesas operacionais
                      </span>
                      <span className="block text-xs leading-5 text-slate-500">
                        Desmarcado, o desconto será aplicado somente em peças e
                        serviços.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Tipo desconto
                    </label>
                    <SelectField
                      value={discountType}
                      onChange={(e) => {
                        setDiscountType(
                          e.target.value as "PERCENTAGE" | "VALUE",
                        );
                        setDiscountInput("");
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm font-semibold text-slate-700"
                      aria-label="Tipo de desconto"
                    >
                      <option value="PERCENTAGE">Porcentagem (%)</option>
                      <option value="VALUE">Valor fixo (R$)</option>
                    </SelectField>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Aplicar desconto
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className={`w-full rounded-md border p-2 text-sm font-bold focus:outline-none ${
                        hitDiscountLimit
                          ? "border-red-500 bg-red-100 text-slate-700"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                      placeholder={
                        discountType === "PERCENTAGE" ? "Ex: 5" : "Ex: 150.00"
                      }
                      aria-label="Aplicar desconto"
                    />
                  </div>

                  {hitDiscountLimit ? (
                    <p className="col-span-2 mt-1 text-xs font-bold text-red-500">
                      Limite de vendedor atingido. Max:{" "}
                      {discountType === "PERCENTAGE"
                        ? "7%"
                        : `R$ ${formatMoney(maxDiscountAllowed)}`}
                    </p>
                  ) : null}
                </div>
              </div>
            </ProposalFormSection>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Resumo financeiro da proposta
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {allowOperationalExpenseDiscount
                    ? "O desconto também será distribuído nas despesas operacionais."
                    : "As despesas estão protegidas; o desconto será distribuído somente em peças e serviços."}
                </p>
              </div>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="overflow-x-auto p-4 md:p-5">
                  <div className="min-w-[580px] overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white">
                      <span>Categoria</span>
                      <span className="text-right">Subtotal</span>
                      <span className="text-right">Desconto aplicado</span>
                      <span className="text-right">Total líquido</span>
                    </div>
                    {commercialBreakdown.map((entry) => (
                      <div
                        key={entry.key}
                        className="grid grid-cols-[1.1fr_1fr_1fr_1fr] items-center border-t border-slate-100 px-4 py-3 first:border-t-0"
                      >
                        <span className="font-semibold text-slate-800">
                          {entry.label}
                          {!entry.discountEligible ? (
                            <small className="mt-0.5 block font-normal text-emerald-700">
                              Protegida de desconto
                            </small>
                          ) : null}
                        </span>
                        <span className="text-right tabular-nums text-slate-600">
                          R$ {formatMoney(entry.subtotal)}
                        </span>
                        <span
                          className={`flex flex-col text-right tabular-nums ${
                            entry.discount > 0
                              ? "font-semibold text-rose-600"
                              : "text-slate-400"
                          }`}
                        >
                          {entry.discountEligible ? (
                            <>
                              - R$ {formatMoney(entry.discount)}
                              <small className="font-normal text-slate-400">
                                {entry.subtotal > 0
                                  ? `${effectiveDiscountPercent.toLocaleString(
                                      "pt-BR",
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      },
                                    )}%`
                                  : "—"}
                              </small>
                            </>
                          ) : (
                            <span className="font-medium text-emerald-700">
                              Não aplicado
                            </span>
                          )}
                        </span>
                        <span className="text-right font-bold tabular-nums text-slate-950">
                          R$ {formatMoney(entry.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Subtotal bruto:{" "}
                      <strong>R$ {formatMoney(subtotal)}</strong>
                    </span>
                    <span>
                      Desconto sobre a base permitida:{" "}
                      {effectiveDiscountPercent.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      % (- R$ {formatMoney(finalDiscount)})
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-between border-t border-slate-200 bg-emerald-50/70 p-5 lg:border-l lg:border-t-0">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                      Investimento total
                    </p>
                    <p className="mt-2 text-3xl font-extrabold tabular-nums text-emerald-700">
                      R$ {formatMoney(grandTotal)}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-emerald-800/75">
                      Despesas + peças + serviços − descontos aplicados
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <ProposalFinancialDock
          lines={[
            { label: "Peças", value: partsSubtotal },
            { label: "Serviços", value: servicesSubtotal },
            { label: "Despesas", value: expensesTotal },
            { label: "Desconto", value: finalDiscount, negative: true },
          ]}
          total={grandTotal}
          payment={
            entryAmount > 0
              ? "Entrada de R$ " +
                formatMoney(entryAmount) +
                (remainingAfterEntry > 0
                  ? " + saldo em " + installments + " parcela(s)"
                  : " · antecipado")
              : installments + "x de R$ " + formatMoney(installmentValue)
          }
          current={step}
          steps={PROPOSAL_STEPS.length}
          onBack={() => changeStep(step - 1)}
          onNext={nextStep}
          saving={isSubmitting}
          disabled={
            (Boolean(editingProposalId) && !draftLoaded) ||
            Boolean(selectedClient?.proposalCreationBlocked)
          }
          saveLabel={
            editingProposalId ? "Salvar alterações" : "Salvar proposta"
          }
          formId="proposal-form"
        />
      </form>
    </div>
  );
}
