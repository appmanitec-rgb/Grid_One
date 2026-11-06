"use client";
import {
  canUsePortfolio,
  canScreenAction,
  getDetailedAccess,
} from "@/lib/access-rules";

import {
  SelectField,
  SearchLookup,
} from "@/app/dashboard/components/SelectField";
import { PageHeader, FormField } from "../../components/DashboardPageKit";
import { InterfaceIcon } from "../../components/InterfaceIcon";
import EquipmentItemsPicker from "./EquipmentItemsPicker";
import ProposalConference from "./ProposalConference";
import CommercialDraftTools from "../CommercialDraftTools";
import PublishedTemplatePicker from "../PublishedTemplatePicker";
import { useProposalEditingDraft } from "./useProposalEditingDraft";
import { insertEquipmentItems } from "./equipment-item-insertion";
import {
  financialComposition,
  reviewProposal,
  moneyCents,
  paymentSummary,
  type ReviewIssue,
  type ReviewAcknowledgement,
  type ReviewLine,
} from "@/lib/proposal-review";
import { getAccessFromToken } from "@/lib/access";
import EditOverlay from "../../components/EditOverlay";
import { formatCurrency } from "@/lib/formatters";
import { selectedLookupRecord } from "@/lib/search";
import PdfPreview from "../../components/PdfPreview";
import { readPreviewWithRetry } from "@/lib/pdf-preview";
import TechnicalScopeGenerator from "../TechnicalScopeGenerator";
import TechnicalServiceClassificationPanel from "../TechnicalServiceClassificationPanel";
import {
  storedTechnicalClassifications,
  type TechnicalServiceClassification,
} from "@/lib/technical-scopes";
import type {
  TechnicalScopeRequest,
  TechnicalScopeReview,
} from "@/lib/technical-scopes";
import {
  buildEquipmentItemSets,
  toggleEquipmentItemSetSelection,
} from "./equipment-item-sets";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, type ControlOption } from "@/lib/control-options";
import { confirmDeletion } from "@/lib/confirm-action";
import OperationalExpensesEditor, {
  type OperationalExpenseSelection,
} from "../OperationalExpensesEditor";
import {
  buildProposalAccessoryWarnings,
  normalizeProposalItemName,
  type ProposalAccessoryRule,
  type ProposalAccessoryWarning,
} from "./proposal-assistance";

type CatalogItem = {
  description?: string | null;
  commercialDescription?: string | null;
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
  updatedAt?: string;
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
  technicalScopeSnapshot?: unknown;
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

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCommercialTerm(value?: string | null) {
  return commercialLabel(value, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
        label: [
          item.code || item.sku,
          item.name,
          item.type === "SERVICE" ? formatCurrency(item.basePrice || 0) : null,
          item.type === "SERVICE"
            ? item.commercialDescription || item.description
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
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
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState("");
  const [reviewAcknowledgements, setReviewAcknowledgements] = useState<
    ReviewAcknowledgement[]
  >([]);
  const [serverIssues, setServerIssues] = useState<ReviewIssue[] | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewRenderedKey, setPreviewRenderedKey] = useState("");
  const submitAction = useRef<"submit" | "preview" | null>(null);
  const submissionLock = useRef(false);
  const [equipmentUndo, setEquipmentUndo] = useState<{
    parts: RowItem[];
    labor: RowItem[];
    after: string;
  } | null>(null);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState("");
  const [editingProposalCode, setEditingProposalCode] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [proposalFormType, setProposalFormType] = useState<
    "PARTS_AND_SERVICES" | "CONTRACT"
  >("PARTS_AND_SERVICES");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientDetails, setSelectedClientDetails] =
    useState<Client | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
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
  const [loadingBaseItems, setLoadingBaseItems] = useState(false);
  const [equipmentItemsOpen, setEquipmentItemsOpen] = useState(false);
  const [machineBaseItemsError, setMachineBaseItemsError] = useState("");
  const [baseItemsReload, setBaseItemsReload] = useState(0);
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
  const [technicalScopeClassifications, setTechnicalScopeClassifications] =
    useState<TechnicalServiceClassification[]>([]);
  const [technicalScopeSnapshot, setTechnicalScopeSnapshot] =
    useState<unknown>(null);
  const [technicalScopeReview, setTechnicalScopeReview] = useState<
    TechnicalScopeReview | undefined
  >(undefined);
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
        setExpectedUpdatedAt(draft.updatedAt || "");
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
        setTechnicalScopeSnapshot(draft.technicalScopeSnapshot ?? null);
        setTechnicalScopeClassifications(
          storedTechnicalClassifications(draft.technicalScopeSnapshot),
        );
        setTechnicalScopeReview(undefined);
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
              "Não foi possivel carregar a oportunidade vinculada.",
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
        setSelectedClientDetails(client);
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
    () =>
      selectedLookupRecord(clients, selectedClientId, selectedClientDetails),
    [clients, selectedClientId, selectedClientDetails],
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
        description: "Serviço por hora",
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
          await readApiErrorMessage(res, "Falha ao cadastrar máquina."),
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
    const controller = new AbortController();
    setMachineBaseItems([]);
    setSelectedMachineBaseItemIds([]);
    setMachineBaseItemsError("");
    if (!selectedEquipmentId) {
      setLoadingBaseItems(false);
      setEquipmentItemsOpen(false);
      return;
    }

    setLoadingBaseItems(true);
    void apiFetch(
      apiUrl("/generators/" + selectedEquipmentId + "/base-items"),
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(
              res,
              "Falha ao buscar itens do equipamento.",
            ),
          );
        }
        const payload = (await res.json()) as MachineBaseItem[];
        if (cancelled) return;
        if (!Array.isArray(payload))
          throw new Error("Não foi possível ler os itens do equipamento.");
        setMachineBaseItems(payload);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setMachineBaseItemsError(
            loadError instanceof Error
              ? loadError.message
              : "Erro ao carregar itens do equipamento.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBaseItems(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedEquipmentId, baseItemsReload]);

  const existingEquipmentCatalogIds = useMemo(
    () =>
      new Set(
        [...parts, ...labor].map((item) => item.catalogItemId).filter(Boolean),
      ),
    [parts, labor],
  );
  const equipmentItemSetDefinitions = useMemo(
    () => buildEquipmentItemSets(machineBaseItems),
    [machineBaseItems],
  );
  const equipmentPickerItems = useMemo(
    () =>
      machineBaseItems.map((item) => ({
        id: item.id,
        catalogItemId: item.catalogItemId,
        alreadyAdded: existingEquipmentCatalogIds.has(item.catalogItemId),
        name: item.catalogItem?.name || "Item sem cadastro disponível",
        sku: item.catalogItem?.sku || item.catalogItem?.code,
        quantity: item.quantity,
        searchTerms: equipmentItemSetDefinitions
          .filter((group) => group.itemIds.includes(item.id))
          .map((group) => group.id + " " + group.label)
          .join(" "),
        group:
          item.serviceGroup === "OUTROS"
            ? "Outros"
            : item.serviceGroup === "TROCA_MANGUEIRAS"
              ? "TM"
              : item.serviceGroup,
        disabled: !item.catalogItem,
        disabledReason: !item.catalogItem
          ? "Cadastro do item indisponível"
          : existingEquipmentCatalogIds.has(item.catalogItemId)
            ? "Já incluído na proposta"
            : undefined,
      })),
    [
      machineBaseItems,
      existingEquipmentCatalogIds,
      equipmentItemSetDefinitions,
    ],
  );
  const availableEquipmentItemIds = useMemo(
    () =>
      new Set(
        equipmentPickerItems
          .filter((item) => !item.disabled)
          .map((item) => item.id),
      ),
    [equipmentPickerItems],
  );
  const equipmentItemSets = useMemo(
    () =>
      equipmentItemSetDefinitions.map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((id) =>
          availableEquipmentItemIds.has(id),
        ),
      })),
    [equipmentItemSetDefinitions, availableEquipmentItemIds],
  );

  function selectEquipmentItemSet(groupId: string) {
    const group = equipmentItemSets.find((item) => item.id === groupId);
    if (!group) return;
    setSelectedMachineBaseItemIds((current) =>
      toggleEquipmentItemSetSelection(current, group.itemIds),
    );
  }

  function toggleEquipmentItem(id: string) {
    if (!availableEquipmentItemIds.has(id)) return;
    setSelectedMachineBaseItemIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  }

  function openEquipmentItemPicker() {
    setSelectedMachineBaseItemIds((current) =>
      current.filter((id) => availableEquipmentItemIds.has(id)),
    );
    setEquipmentItemsOpen(true);
  }

  const addItemsFromEquipmentBase = (
    mode: "add" | "sum" | "separate" = "add",
    reason = "",
  ) => {
    const selected = machineBaseItems.filter(
      (item) =>
        selectedMachineBaseItemIds.includes(item.id) && item.catalogItem,
    );
    if (!selected.length) return;
    if (mode === "separate" && reason.trim().length < 8) {
      setFeedback({
        kind: "error",
        text: "Explique por que as linhas precisam ficar separadas.",
      });
      return;
    }
    try {
      const next = insertEquipmentItems(parts, labor, selected, mode);
      setPartOptions((current) =>
        mergeCatalogOptions(current, next.parts, machineBaseItems),
      );
      setServiceOptions((current) =>
        mergeCatalogOptions(current, next.services, machineBaseItems),
      );
      setEquipmentUndo({
        parts,
        labor,
        after: JSON.stringify([next.parts, next.services]),
      });
      setParts(next.parts);
      setLabor(next.services);
      if (mode === "separate") {
        const duplicates = reviewProposal({
          items: [
            ...next.parts.map((row) => ({
              kind: "PART_MATERIAL",
              catalogItemId: row.catalogItemId,
              quantity: Number(row.quantity),
              unitPrice: Number(row.unitPrice),
            })),
            ...next.services.map((row) => ({
              kind: "CATALOG_SERVICE",
              catalogItemId: row.catalogItemId,
              quantity: Number(row.quantity),
              unitPrice: Number(row.unitPrice),
            })),
          ],
        }).issues.filter((issue) => issue.code === "DUPLICATE_ITEM");
        setReviewAcknowledgements((current) => [
          ...current.filter((ack) => ack.code !== "DUPLICATE_ITEM"),
          ...duplicates.map((issue) => ({
            code: issue.code,
            signature: issue.signature,
            reason: reason.trim(),
          })),
        ]);
      }
      setEquipmentItemsOpen(false);
      setSelectedMachineBaseItemIds([]);
      setFeedback({
        kind: "success",
        text: selected.length + " item(ns) conferido(s) e adicionado(s).",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Confira os itens selecionados.",
      });
    }
  };

  const technicalScopeRequest = useMemo<TechnicalScopeRequest>(
    () => ({
      proposalId: editingProposalId || undefined,
      clientId: selectedClientId || undefined,
      generatorId: selectedEquipmentId || undefined,
      type: proposalFormType,
      technicalScopeClassifications,
      items: [
        ...parts
          .filter((item) => item.catalogItemId)
          .map((item, index) => ({
            key: "part-" + index,
            kind: "PART_MATERIAL",
            catalogItemId: item.catalogItemId,
            quantity: Number(item.quantity || 0),
          })),
        ...labor
          .filter((item) => item.catalogItemId)
          .map((item, index) => ({
            key: "service-" + index,
            kind: "CATALOG_SERVICE",
            catalogItemId: item.catalogItemId,
            quantity: Number(item.quantity || 0),
          })),
        ...hourlyServices
          .filter((item) => item.description.trim() || Number(item.hours) > 0)
          .map((item, index) => ({
            key: "hourly-" + index,
            kind: "HOURLY_SERVICE",
            description: item.description || "Serviço por hora",
            quantity: 1,
            hours: Number(item.hours || 0),
          })),
        ...otherItems
          .filter((item) => item.description.trim())
          .map((item, index) => ({
            key: "other-" + index,
            kind: "OTHER",
            description: item.description,
            quantity: Number(item.quantity || 0),
          })),
      ],
    }),
    [
      editingProposalId,
      selectedClientId,
      selectedEquipmentId,
      proposalFormType,
      parts,
      labor,
      hourlyServices,
      otherItems,
      technicalScopeClassifications,
    ],
  );

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

  const financialLines: ReviewLine[] = [
    ...parts
      .filter((row) => row.catalogItemId)
      .map((row) => ({
        kind: "PART_MATERIAL",
        catalogItemId: row.catalogItemId,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        referenceUnitPrice:
          partOptions.find((item) => item.id === row.catalogItemId)
            ?.basePrice || 0,
      })),
    ...labor
      .filter((row) => row.catalogItemId)
      .map((row) => ({
        kind: "CATALOG_SERVICE",
        catalogItemId: row.catalogItemId,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      })),
    ...hourlyServices.map((row) => ({
      kind: "HOURLY_SERVICE",
      description: row.description,
      quantity: 1,
      hours: Number(row.hours),
      unitPrice: hourlyRateFor(row),
      discountPercent: Number(row.discountPercent),
    })),
    ...otherItems
      .filter((row) => row.description.trim())
      .map((row) => ({
        kind: "OTHER",
        description: row.description,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      })),
  ];
  const undiscounted = financialComposition(
    financialLines,
    operationalExpenses,
    0,
    allowOperationalExpenseDiscount,
  );
  const partsSubtotal = undiscounted.parts,
    servicesSubtotal = undiscounted.services,
    expensesTotal = undiscounted.expenses,
    subtotal = undiscounted.subtotal,
    discountableSubtotal = undiscounted.eligible;
  const configuredDiscount = getDetailedAccess();
  const maxDiscountAllowed = configuredDiscount.unrestricted
    ? discountableSubtotal
    : roundMoney(
        (discountableSubtotal * configuredDiscount.discountLimit) / 100,
      );
  const finalDiscount = roundMoney(
    discountType === "PERCENTAGE"
      ? (discountableSubtotal * (Number(discountInput) || 0)) / 100
      : Number(discountInput) || 0,
  );
  const financial = financialComposition(
    financialLines,
    operationalExpenses,
    finalDiscount,
    allowOperationalExpenseDiscount,
  );
  const commercialBreakdown = financial.breakdown;
  const grandTotal = financial.total;
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
  const realPaymentSummary = paymentSummary(
    grandTotal,
    entryAmount,
    paymentPlan ? composedPayment.count : installments,
    firstDueDate,
    Number(installmentIntervalDays),
  );

  const hitDiscountLimit =
    !configuredDiscount.unrestricted && finalDiscount > maxDiscountAllowed;
  const latestInspection = linkedOpportunity?.inspections?.[0] || null;

  const restoreEditingDraft = useCallback((value: Record<string, unknown>) => {
    if (value.selectedClientId !== undefined)
      setSelectedClientId(value.selectedClientId as typeof selectedClientId);
    if (value.selectedEquipmentId !== undefined)
      setSelectedEquipmentId(
        value.selectedEquipmentId as typeof selectedEquipmentId,
      );
    if (value.selectedSellerId !== undefined)
      setSelectedSellerId(value.selectedSellerId as typeof selectedSellerId);
    if (value.clientSearch !== undefined)
      setClientSearch(value.clientSearch as typeof clientSearch);
    if (value.equipmentSearch !== undefined)
      setEquipmentSearch(value.equipmentSearch as typeof equipmentSearch);
    if (value.sellerSearch !== undefined)
      setSellerSearch(value.sellerSearch as typeof sellerSearch);
    if (value.proposalFormType !== undefined)
      setProposalFormType(value.proposalFormType as typeof proposalFormType);
    if (value.parts !== undefined) setParts(value.parts as typeof parts);
    if (value.labor !== undefined) setLabor(value.labor as typeof labor);
    if (value.hourlyServices !== undefined)
      setHourlyServices(value.hourlyServices as typeof hourlyServices);
    if (value.otherItems !== undefined)
      setOtherItems(value.otherItems as typeof otherItems);
    if (value.operationalExpenses !== undefined)
      setOperationalExpenses(
        value.operationalExpenses as typeof operationalExpenses,
      );
    if (value.scope !== undefined) setScope(value.scope as typeof scope);
    if (Array.isArray(value.technicalScopeClassifications))
      setTechnicalScopeClassifications(
        value.technicalScopeClassifications as TechnicalServiceClassification[],
      );
    if (value.technicalScopeReview !== undefined)
      setTechnicalScopeReview(
        value.technicalScopeReview as typeof technicalScopeReview,
      );
    if (value.technicalScopeSnapshot !== undefined)
      setTechnicalScopeSnapshot(
        value.technicalScopeSnapshot as typeof technicalScopeSnapshot,
      );
    if (value.freight !== undefined)
      setFreight(value.freight as typeof freight);
    if (value.validUntil !== undefined)
      setValidUntil(value.validUntil as typeof validUntil);
    if (value.paymentTerm !== undefined)
      setPaymentTerm(value.paymentTerm as typeof paymentTerm);
    if (value.deliveryLeadTimeDays !== undefined)
      setDeliveryLeadTimeDays(
        value.deliveryLeadTimeDays as typeof deliveryLeadTimeDays,
      );
    if (value.partsPaymentProfileId !== undefined)
      setPartsPaymentProfileId(
        value.partsPaymentProfileId as typeof partsPaymentProfileId,
      );
    if (value.servicesPaymentProfileId !== undefined)
      setServicesPaymentProfileId(
        value.servicesPaymentProfileId as typeof servicesPaymentProfileId,
      );
    if (value.paymentPlan !== undefined)
      setPaymentPlan(value.paymentPlan as typeof paymentPlan);
    if (value.hasDownPayment !== undefined)
      setHasDownPayment(value.hasDownPayment as typeof hasDownPayment);
    if (value.downPaymentAmount !== undefined)
      setDownPaymentAmount(value.downPaymentAmount as typeof downPaymentAmount);
    if (value.installmentCount !== undefined)
      setInstallmentCount(value.installmentCount as typeof installmentCount);
    if (value.installmentIntervalDays !== undefined)
      setInstallmentIntervalDays(
        value.installmentIntervalDays as typeof installmentIntervalDays,
      );
    if (value.firstDueDate !== undefined)
      setFirstDueDate(value.firstDueDate as typeof firstDueDate);
    if (value.internalNotes !== undefined)
      setInternalNotes(value.internalNotes as typeof internalNotes);
    if (value.externalNotes !== undefined)
      setExternalNotes(value.externalNotes as typeof externalNotes);
    if (value.discountType !== undefined)
      setDiscountType(value.discountType as typeof discountType);
    if (value.discountInput !== undefined)
      setDiscountInput(value.discountInput as typeof discountInput);
    if (value.allowOperationalExpenseDiscount !== undefined)
      setAllowOperationalExpenseDiscount(
        value.allowOperationalExpenseDiscount as typeof allowOperationalExpenseDiscount,
      );
    if (value.reviewAcknowledgements !== undefined)
      setReviewAcknowledgements(
        value.reviewAcknowledgements as typeof reviewAcknowledgements,
      );
    if (value.step !== undefined) setStep(value.step as typeof step);
    if (value.editingProposalId !== undefined)
      setEditingProposalId(value.editingProposalId as typeof editingProposalId);
    if (value.editingProposalCode !== undefined)
      setEditingProposalCode(
        value.editingProposalCode as typeof editingProposalCode,
      );
    if (value.expectedUpdatedAt !== undefined)
      setExpectedUpdatedAt(value.expectedUpdatedAt as typeof expectedUpdatedAt);
    if (value.assistanceReviews !== undefined)
      setAssistanceReviews(value.assistanceReviews as typeof assistanceReviews);
    if (value.assistanceReasons !== undefined)
      setAssistanceReasons(value.assistanceReasons as typeof assistanceReasons);
    if (Array.isArray(value.selectedParts))
      setPartOptions(value.selectedParts as CatalogItem[]);
    if (Array.isArray(value.selectedServices))
      setServiceOptions(value.selectedServices as CatalogItem[]);
    if (Array.isArray(value.selectedClients))
      setClients(value.selectedClients as Client[]);
    if (Array.isArray(value.selectedGenerators))
      setGenerators(value.selectedGenerators as Generator[]);
    if (Array.isArray(value.selectedSellers))
      setSellers(value.selectedSellers as SellerOption[]);
    setDraftLoaded(true);
  }, []);
  const editingFormData = {
    selectedClientId,
    selectedEquipmentId,
    selectedSellerId,
    clientSearch,
    equipmentSearch,
    sellerSearch,
    proposalFormType,
    parts,
    labor,
    hourlyServices,
    otherItems,
    operationalExpenses,
    scope,
    technicalScopeReview,
    technicalScopeClassifications,
    technicalScopeSnapshot,
    freight,
    validUntil,
    paymentTerm,
    deliveryLeadTimeDays,
    partsPaymentProfileId,
    servicesPaymentProfileId,
    paymentPlan,
    hasDownPayment,
    downPaymentAmount,
    installmentCount,
    installmentIntervalDays,
    firstDueDate,
    internalNotes,
    externalNotes,
    discountType,
    discountInput,
    allowOperationalExpenseDiscount,
    reviewAcknowledgements,
    step,
    editingProposalId,
    editingProposalCode,
    expectedUpdatedAt,
    assistanceReviews,
    assistanceReasons,
    discount: finalDiscount,
    selectedParts: partOptions.filter((item) =>
      parts.some((row) => row.catalogItemId === item.id),
    ),
    selectedServices: serviceOptions.filter((item) =>
      labor.some((row) => row.catalogItemId === item.id),
    ),
    selectedClients: clients.filter((item) => item.id === selectedClientId),
    selectedGenerators: generators.filter(
      (item) => item.id === selectedEquipmentId,
    ),
    selectedSellers: sellers.filter((item) => item.id === selectedSellerId),
  };
  const editor = useProposalEditingDraft(
    editingFormData,
    restoreEditingDraft,
    !editingProposalId || draftLoaded,
  );
  const canEditProposal = editingProposalId
    ? getAccessFromToken().proposals.update &&
      canScreenAction("proposals", "update")
    : getAccessFromToken().proposals.create &&
      canScreenAction("proposals", "create");
  const localReview = reviewProposal({
    clientId: selectedClientId,
    sellerId: selectedSellerId,
    type: proposalFormType,
    items: financialLines,
    expenses: operationalExpenses,
    discount: finalDiscount,
    allowExpenseDiscount: allowOperationalExpenseDiscount,
    paymentTerm,
    paymentPlan,
    hasDownPayment,
    downPaymentAmount: Number(downPaymentAmount),
    installmentCount: Number(installmentCount),
    discountLimit: configuredDiscount.discountLimit,
    unrestricted: configuredDiscount.unrestricted,
    paymentProfiles: paymentProfiles
      .filter((profile) =>
        [partsPaymentProfileId, servicesPaymentProfileId].includes(profile.id),
      )
      .map((profile) => ({
        purpose: profile.purpose,
        issuerCompanyId: profile.issuerCompany?.id,
      })),
    requiredPaymentPurposes: [
      ...(partsSubtotal > 0 &&
      paymentProfiles.some((profile) => profile.purpose === "PARTS")
        ? ["PARTS"]
        : []),
      ...(servicesSubtotal > 0 &&
      paymentProfiles.some((profile) => profile.purpose === "SERVICES")
        ? ["SERVICES"]
        : []),
    ],
    expenseRules: editor.context?.expenseRules,
    scopeText: scope,
    scopeSnapshot: technicalScopeSnapshot as Parameters<
      typeof reviewProposal
    >[0]["scopeSnapshot"],
    acknowledgements: reviewAcknowledgements,
  });
  const conferenceKey = JSON.stringify(editingFormData);
  useEffect(() => {
    if (!editor.enabled || step !== 3 || (editingProposalId && !draftLoaded))
      return;
    const controller = new AbortController();
    setServerIssues(null);
    setReviewError("");
    const timer = window.setTimeout(() => {
      setReviewBusy(true);
      void apiFetch("/proposals/editor/conference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: editingFormData,
          proposalId: editingProposalId || undefined,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              await readApiErrorMessage(response, "Falha na conferência."),
            );
          const report = (await response.json()) as { issues: ReviewIssue[] };
          if (!controller.signal.aborted) setServerIssues(report.issues);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setReviewError(
              error instanceof Error
                ? error.message
                : "Falha ao conferir. Tente novamente.",
            );
          if (!controller.signal.aborted)
            setFeedback({
              kind: "error",
              text:
                error instanceof Error
                  ? error.message
                  : "Confira a conexão para validar.",
            });
        })
        .finally(() => {
          if (!controller.signal.aborted) setReviewBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The serialized form intentionally controls incremental revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceKey, editor.enabled, step, reviewAttempt]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  function navigateIssue(issue: ReviewIssue) {
    changeStep(issue.step);
    window.setTimeout(() => {
      const selector =
        issue.field === "seller"
          ? "#proposal-review-seller"
          : issue.field === "client"
            ? "#proposal-review-client"
            : issue.field === "discount"
              ? "#proposal-review-discount"
              : issue.field === "expenses"
                ? '[aria-label^="Quantidade de"]'
                : issue.field === "serviceTechnical"
                  ? "#proposal-service-technical"
                  : issue.field === "scope"
                    ? "#proposal-review-scope"
                    : issue.field === "payment"
                      ? '[aria-label="Condição de pagamento"]'
                      : 'input:not([type="hidden"])';
      document
        .querySelector<HTMLElement>("#proposal-form " + selector)
        ?.focus();
    }, 80);
  }
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
    if (editor.enabled) {
      changeStep(step + 1);
      return;
    }
    const issue = validateStep(step);
    if (issue) {
      showStepError(step, issue);
      return;
    }
    changeStep(step + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || submissionLock.current) return;
    if (editor.enabled && !submitAction.current) {
      await editor.save().catch(() => {});
      return;
    }
    if (step < PROPOSAL_STEPS.length - 1) {
      nextStep();
      return;
    }
    for (let index = 0; !editor.enabled && index < 3; index += 1) {
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

    submissionLock.current = true;
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
      ...otherItems
        .filter((item) => item.description.trim())
        .map((item) => ({
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
      technicalScopeReview,
      technicalScopeClassifications,
      editingDraftId: undefined as string | undefined,
      expectedUpdatedAt:
        editor.enabled && editingProposalId
          ? expectedUpdatedAt || undefined
          : undefined,
      reviewAcknowledgements: editor.enabled
        ? reviewAcknowledgements
        : undefined,
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
      if (editor.enabled) {
        const draft = await editor.save();
        payload.editingDraftId = draft.id;
        const check = await apiFetch("/proposals/editor/conference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: editingFormData,
            proposalId: editingProposalId || undefined,
          }),
        });
        if (!check.ok)
          throw new Error(
            await readApiErrorMessage(
              check,
              "Não foi possível conferir a proposta.",
            ),
          );
        const report = (await check.json()) as {
          issues: ReviewIssue[];
          readyForApproval: boolean;
          totals: { total: number };
        };
        setServerIssues(report.issues);
        if (!report.readyForApproval) {
          setStep(3);
          setFeedback({
            kind: "error",
            text: "Confira as pendências indicadas antes de continuar. O rascunho foi salvo.",
          });
          return;
        }
        if (moneyCents(report.totals.total) !== moneyCents(grandTotal)) {
          setFeedback({
            kind: "error",
            text: "Uma tarifa ou preço do cadastro mudou. Confira os valores atuais antes de liberar; o preenchimento foi preservado.",
          });
          return;
        }
      }
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
        code?: string;
        updatedAt?: string;
      } | null;
      const savedId = createdProposal?.id || editingProposalId;
      if (savedId) setEditingProposalId(savedId);
      if (createdProposal?.code) setEditingProposalCode(createdProposal.code);
      if (createdProposal?.updatedAt)
        setExpectedUpdatedAt(createdProposal.updatedAt);
      // Persist the exact commercial version produced by this editor, not a later
      // version from another tab. Recovery retains the same concurrency baseline.
      if (
        editor.enabled &&
        savedId &&
        createdProposal?.updatedAt &&
        getAccessFromToken().proposals.update
      ) {
        await editor.save({
          editingProposalId: savedId,
          expectedUpdatedAt: createdProposal.updatedAt,
          editingProposalCode: createdProposal.code || editingProposalCode,
        });
      }
      if (editor.enabled && savedId && submitAction.current === "preview") {
        setPreviewRenderedKey("");
        const preview = await readPreviewWithRetry(() =>
          apiFetch(`/documents/proposals/${savedId}/draft-preview`, {
            method: "GET",
            cache: "no-store",
          }),
        );
        if (!preview.ok)
          throw new Error(
            await readApiErrorMessage(
              preview,
              "Não foi possível abrir a prévia.",
            ),
          );
        setPreviewUrl(URL.createObjectURL(await preview.blob()));
        setFeedback({
          kind: "success",
          text: "PDF da prévia recebido. Confira a renderização na janela aberta.",
        });
        return;
      }
      if (editor.enabled && savedId && submitAction.current === "submit") {
        const approval = await apiFetch(`/proposals/${savedId}/submit-board`, {
          method: "POST",
        });
        if (!approval.ok)
          throw new Error(
            await readApiErrorMessage(
              approval,
              "Rascunho salvo; confira as pendências antes de solicitar aprovação.",
            ),
          );
        editor.complete();
      }
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
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro de comunicacao com o servidor.",
      });
    } finally {
      submissionLock.current = false;
      submitAction.current = null;
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
        inert={isSubmitting}
        aria-busy={isSubmitting}
        onSubmit={handleSubmit}
        noValidate
        onClickCapture={() => {
          editor.metrics.current.clicks += 1;
        }}
        onChangeCapture={() => {
          editor.metrics.current.edits += 1;
        }}
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
        {editor.enabled && canEditProposal ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--text-muted)]" role="status">
              {editor.message ||
                "Você pode salvar um rascunho em qualquer etapa."}
            </p>
            {(!editor.loaded || editor.recoveryConflict) && editor.message ? (
              <button
                type="button"
                className="app-button app-button-secondary"
                onClick={editor.retryRecovery}
              >
                {editor.recoveryConflict
                  ? "Reabrir versão do sistema"
                  : "Tentar recuperar"}
              </button>
            ) : null}
            <button
              type="button"
              className="app-button app-button-secondary"
              disabled={editor.saving || isSubmitting || !editor.loaded}
              onClick={() => void editor.save().catch(() => {})}
            >
              {editor.saving ? "Salvando..." : "Salvar rascunho"}
            </button>
          </div>
        ) : null}
        {equipmentUndo &&
        equipmentUndo.after === JSON.stringify([parts, labor]) ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3 text-sm">
            <span>Itens do equipamento adicionados e conferidos.</span>
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={() => {
                setParts(equipmentUndo.parts);
                setLabor(equipmentUndo.labor);
                setEquipmentUndo(null);
                setFeedback({ kind: "success", text: "Inclusão desfeita." });
              }}
            >
              Desfazer inclusão
            </button>
          </div>
        ) : null}
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
                        id="proposal-review-client"
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
                            Buscando máquinas...
                          </p>
                        ) : availableGenerators.length === 0 ? (
                          <p className="p-3 text-sm text-zinc-500">
                            Nenhuma máquina encontrada.
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

                <div className="md:col-span-2">
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
                        id="proposal-review-seller"
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
              </div>

              {quickClientOpen && !linkedOpportunity ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <input
                      className="rounded border border-emerald-200 bg-white p-2 text-sm"
                      placeholder="Razão social/nome"
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
                      placeholder="Endereço"
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
                      placeholder="Número de série"
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
                      placeholder="Observação"
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
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Opcional nas regras atuais. Deixe vazio para manter a
                    proposta sem data de validade informada, ou defina a data
                    acordada.
                  </p>
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
            <CommercialDraftTools
              portfolio={
                proposalFormType === "CONTRACT" ? "contracts" : "partsServices"
              }
              revenue={grandTotal}
              lines={financialLines}
            />
            <div id="proposal-parts-section" className="proposal-form-section">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">
                    Peças e materiais
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Adicione itens do equipamento ou pesquise no catálogo geral.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openEquipmentItemPicker}
                    disabled={!selectedEquipmentId}
                    className="app-button app-button-secondary"
                  >
                    <InterfaceIcon name="plus" className="h-4 w-4" />
                    Adicionar itens do equipamento
                  </button>
                  <button
                    type="button"
                    onClick={addPart}
                    className="app-button app-button-primary"
                  >
                    <InterfaceIcon name="plus" className="h-4 w-4" />
                    Adicionar peça
                  </button>
                </div>
              </div>
              {!selectedEquipmentId ? (
                <p className="mb-4 text-sm text-slate-500">
                  Selecione um equipamento em Dados comerciais para consultar
                  seus itens.
                </p>
              ) : null}

              {parts.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhuma peça adicionada.
                </p>
              ) : null}

              {selectedEquipmentId && parts.length ? (
                <p
                  className="mb-3 text-sm text-[var(--text-muted)]"
                  role="note"
                >
                  Selecionar o equipamento não comprova a compatibilidade da
                  peça. Confira código, modelo e aplicação antes de contratar.
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
                      placeholder="Nome ou código"
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
                      aria-label={`Qtd da peça ${index + 1}`}
                      onChange={(e) =>
                        updatePart(index, "quantity", e.target.value)
                      }
                      className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Preço (R$)
                    </label>
                    <input
                      type="number"
                      value={part.unitPrice}
                      aria-label={`Preço da peça ${index + 1}`}
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
                    Serviços adicionais usam a base geral do sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addLabor}
                  className="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100"
                >
                  + Adicionar serviço
                </button>
              </div>

              {labor.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Nenhum serviço adicionado.
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
                      placeholder="Nome ou código"
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
                      aria-label={`Qtd do serviço ${index + 1}`}
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
                      aria-label="Valor definido no cadastro do serviço"
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
                  Nenhum serviço por hora adicionado.
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
                    <FormField
                      label="Descrição do atendimento"
                      className="md:col-span-2"
                    >
                      <input
                        className="rounded-md border border-amber-200 bg-white p-2 text-sm md:col-span-2"
                        placeholder="Descrição"
                        value={item.description}
                        onChange={(e) =>
                          updateHourlyService(
                            index,
                            "description",
                            e.target.value,
                          )
                        }
                      />
                    </FormField>
                    <FormField label="Tipo de hora">
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
                    </FormField>
                    <FormField label="Tipo de técnico">
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
                    </FormField>
                    <FormField label="Horas">
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
                    </FormField>
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
                  <FormField label="Descrição do item">
                    <input
                      className="rounded-md border border-zinc-300 p-2 text-sm"
                      placeholder="Descrição do item"
                      value={item.description}
                      onChange={(e) =>
                        updateOtherItem(index, "description", e.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Quantidade">
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
                  </FormField>
                  <FormField label="Valor unitário (R$)">
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
                  </FormField>
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
            {editor.enabled && technicalScopeRequest.items.length > 0 ? (
              <>
                <TechnicalServiceClassificationPanel
                  request={technicalScopeRequest}
                  disabled={isSubmitting}
                  onChange={(value) => {
                    setTechnicalScopeClassifications(value);
                    setTechnicalScopeReview(undefined);
                  }}
                />
                <TechnicalScopeGenerator
                  request={technicalScopeRequest}
                  scope={scope}
                  snapshot={technicalScopeSnapshot}
                  canGenerate={Boolean(selectedClientId)}
                  onApply={(text, review) => {
                    setScope(text);
                    setTechnicalScopeReview(review);
                  }}
                />
              </>
            ) : null}
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
            <CommercialDraftTools
              mode="costs"
              portfolio={
                proposalFormType === "CONTRACT" ? "contracts" : "partsServices"
              }
              revenue={grandTotal}
              lines={financialLines}
            />
            {editor.enabled ? (
              <>
                <p
                  className="text-sm text-[var(--text-muted)]"
                  aria-label="Plano real de pagamento"
                >
                  {realPaymentSummary}
                </p>
                <ProposalConference
                  issues={serverIssues ?? localReview.issues}
                  acknowledgements={reviewAcknowledgements}
                  busy={reviewBusy || (serverIssues === null && !reviewError)}
                  error={reviewError}
                  onRetry={() => setReviewAttempt((attempt) => attempt + 1)}
                  documentRendered={previewRenderedKey === conferenceKey}
                  onNavigate={navigateIssue}
                  onAcknowledge={(value) =>
                    setReviewAcknowledgements((current) => [
                      ...current.filter(
                        (ack) =>
                          !(
                            ack.code === value.code &&
                            ack.signature === value.signature
                          ),
                      ),
                      value,
                    ])
                  }
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="app-button app-button-secondary"
                    disabled={
                      isSubmitting ||
                      editor.saving ||
                      !editor.loaded ||
                      !canEditProposal
                    }
                    onClick={() => {
                      submitAction.current = "preview";
                      (
                        document.getElementById(
                          "proposal-form",
                        ) as HTMLFormElement
                      ).requestSubmit();
                    }}
                    ref={previewButtonRef}
                  >
                    Visualizar proposta
                  </button>
                  {getAccessFromToken().proposals.update &&
                  canScreenAction("proposals", "update") ? (
                    <button
                      type="button"
                      className="app-button app-button-primary"
                      disabled={
                        isSubmitting ||
                        editor.saving ||
                        reviewBusy ||
                        !editor.loaded ||
                        !canEditProposal
                      }
                      onClick={() => {
                        submitAction.current = "submit";
                        (
                          document.getElementById(
                            "proposal-form",
                          ) as HTMLFormElement
                        ).requestSubmit();
                      }}
                    >
                      Solicitar aprovação
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
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
              <PublishedTemplatePicker
                proposalId={editingProposalId || undefined}
                portfolio={
                  proposalFormType === "CONTRACT"
                    ? "contracts"
                    : "partsServices"
                }
                category={
                  labor.length || hourlyServices.length
                    ? "SERVICE_SCOPE"
                    : "PARTS_SCOPE"
                }
                previewValues={{
                  "cliente.nome":
                    selectedClient?.companyName ||
                    selectedClient?.tradeName ||
                    "Cliente não selecionado",
                  "vendedor.nome": sellerSearch || "Vendedor não selecionado",
                  "proposta.codigo": editingProposalCode || "Rascunho",
                  "proposta.total": formatCurrency(grandTotal),
                  "proposta.validade": validUntil
                    ? new Date(validUntil + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                      )
                    : "Validade não informada",
                  "proposta.itens": financialLines
                    .map(
                      (line, index) =>
                        line.description ||
                        [...partOptions, ...serviceOptions].find(
                          (item) => item.id === line.catalogItemId,
                        )?.name ||
                        `Item ${index + 1}`,
                    )
                    .join("\n"),
                  "proposta.escopo": scope || "Escopo ainda não preenchido",
                  "equipamento.nome":
                    equipmentSearch || "Equipamento não selecionado",
                }}
                onApply={(value) => {
                  setScope(value.body);
                  setTechnicalScopeReview(undefined);
                  setReviewAcknowledgements([]);
                }}
              />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Escopo
                  </label>
                  <TechnicalScopeGenerator
                    request={technicalScopeRequest}
                    scope={scope}
                    snapshot={technicalScopeSnapshot}
                    canGenerate={
                      Boolean(selectedClientId) &&
                      technicalScopeRequest.items.length > 0
                    }
                    onApply={(text, review) => {
                      setScope(text);
                      setTechnicalScopeReview(review);
                    }}
                  />
                  <details className="mb-3 rounded-xl border border-slate-200 p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Modelos anteriores e importação
                    </summary>
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
                        A pesquisa mostra apenas escopos já importados.
                        Selecione um arquivo .txt do seu computador para
                        salvá-lo nesta biblioteca.
                      </p>
                      <label
                        htmlFor="proposal-scope-search"
                        className="mb-1 block text-xs font-medium text-zinc-600"
                      >
                        Pesquisar escopos
                      </label>
                      <input
                        id="proposal-scope-search"
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
                  </details>
                  <textarea
                    rows={8}
                    value={scope}
                    id="proposal-review-scope"
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
                      id="proposal-review-discount"
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
                      Acima da sua alçada. Limite para liberação:{" "}
                      {discountType === "PERCENTAGE"
                        ? configuredDiscount.discountLimit + "%"
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
            editor.enabled
              ? realPaymentSummary
              : entryAmount > 0
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
          saving={isSubmitting || editor.saving}
          disabled={
            (Boolean(editingProposalId) && !draftLoaded) ||
            (!editor.enabled &&
              Boolean(selectedClient?.proposalCreationBlocked)) ||
            (editor.enabled && (!editor.loaded || !canEditProposal))
          }
          saveLabel={
            editor.enabled
              ? "Salvar rascunho"
              : editingProposalId
                ? "Salvar alterações"
                : "Salvar proposta"
          }
          formId={editor.enabled ? undefined : "proposal-form"}
          onSave={
            editor.enabled
              ? () => void editor.save().catch(() => {})
              : undefined
          }
        />
      </form>
      {previewUrl ? (
        <EditOverlay
          open
          title="Prévia da proposta para o cliente"
          eyebrow="Conferência interna"
          returnFocusRef={previewButtonRef}
          onClose={() => setPreviewUrl("")}
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-[var(--text-muted)]">
              Prévia com os dados públicos e o modelo do documento. A proposta
              ainda depende das aprovações; esta ação não envia nem publica.
            </p>
            <PdfPreview
              url={previewUrl}
              onRendered={() => setPreviewRenderedKey(conferenceKey)}
            />
          </div>
        </EditOverlay>
      ) : null}
      {equipmentItemsOpen ? (
        <EquipmentItemsPicker
          open
          equipmentName={equipmentSearch || undefined}
          items={equipmentPickerItems}
          groups={equipmentItemSets}
          selectedIds={selectedMachineBaseItemIds}
          onToggleItem={toggleEquipmentItem}
          onGroupSelect={selectEquipmentItemSet}
          onConfirm={addItemsFromEquipmentBase}
          onClose={() => setEquipmentItemsOpen(false)}
          onClearSelection={() => setSelectedMachineBaseItemIds([])}
          loading={loadingBaseItems}
          error={machineBaseItemsError}
          onRetry={() => setBaseItemsReload((current) => current + 1)}
        />
      ) : null}
    </div>
  );
}
