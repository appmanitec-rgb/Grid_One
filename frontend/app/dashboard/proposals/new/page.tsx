"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, type ControlOption } from "@/lib/control-options";

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
};

type HourlyItem = {
  description: string;
  hourType: string;
  technicianType: string;
  hours: string;
  unitPrice: string;
  discountPercent: string;
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
  tags?: string[];
  compatibleOpportunityTypes?: string[];
};

type PricingOption = {
  value: string;
  label: string;
  defaultDiscountPercent?: number;
};

const OPPORTUNITY_STAGE_LABEL: Record<string, string> = {
  PROSPECTION: "Prospeccao",
  SITE_SURVEY_SCHEDULED: "Vistoria Agendada",
  PROPOSAL_SENT: "Proposta Enviada",
  NEGOTIATION: "Em Negociacao",
  WON: "Ganha",
  LOST: "Perdida",
};

const INSPECTION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluida",
  CANCELED: "Cancelada",
};

function formatMoney(value: number) {
  return value.toFixed(2);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCommercialTerm(value?: string | null) {
  return (value ?? "")
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
  return unique.map((text) => `- ${text.replace(/^-+\s*/, "")}`).join("\n");
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
  onChange: (val: string) => void;
  onSearch?: (term: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const selected = items.find((i) => i.id === value);
    if (selected) {
      const code = selected.code || selected.sku;
      setSearch(`${code ? `[${code}] ` : ""}${selected.name}`);
    }
  }, [value, items]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(
      (i) =>
        (i.name || "").toLowerCase().includes(term) ||
        (i.code || "").toLowerCase().includes(term),
    );
  }, [items, search]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          const next = e.target.value;
          setSearch(next);
          setIsOpen(true);
          onChange("");
          onSearch?.(next);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 180)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 p-2 text-sm outline-none focus:border-emerald-500"
      />
      {isOpen && search && !value ? (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <li
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  setSearch(item.name);
                  setIsOpen(false);
                }}
                className="cursor-pointer border-b border-zinc-100 p-2 text-sm hover:bg-emerald-50 last:border-0"
              >
                <span className="mr-2 font-mono text-xs font-bold text-zinc-400">
                  {item.code || item.sku || "S/COD"}
                </span>
                <span className="text-zinc-700">{item.name}</span>
              </li>
            ))
          ) : (
            <li className="p-2 text-sm text-zinc-500">
              Nenhum item encontrado.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default function NewProposalPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const USER_ROLE = "NORMAL" as string;
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [partOptions, setPartOptions] = useState<CatalogItem[]>([]);
  const [serviceOptions, setServiceOptions] = useState<CatalogItem[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [scopeTemplates, setScopeTemplates] = useState<ScopeTemplate[]>([]);
  const [hourTypes, setHourTypes] = useState<PricingOption[]>([]);
  const [technicianTypes, setTechnicianTypes] = useState<PricingOption[]>([]);
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

  const [parts, setParts] = useState<RowItem[]>([]);
  const [labor, setLabor] = useState<RowItem[]>([]);
  const [hourlyServices, setHourlyServices] = useState<HourlyItem[]>([]);
  const [otherItems, setOtherItems] = useState<OtherItem[]>([]);

  const [scope, setScope] = useState("");
  const [selectedScopeTemplateIds, setSelectedScopeTemplateIds] = useState<
    string[]
  >([]);
  const [freight, setFreight] = useState("FOB");
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [paymentTermOptions, setPaymentTermOptions] = useState<ControlOption[]>(
    [],
  );
  const [deliveryLeadTimeDays, setDeliveryLeadTimeDays] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
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
  useEffect(() => {
    async function fetchData() {
      try {
        const [
          clientsRes,
          partsRes,
          servicesRes,
          pricingRes,
          scopesRes,
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
          apiFetch(apiUrl("/proposals/scope-templates"), { cache: "no-store" }),
          loadControlOptions(["PAYMENT_TERM"]),
        ]);

        if (clientsRes.ok) setClients((await clientsRes.json()) as Client[]);
        if (partsRes.ok)
          setPartOptions((await partsRes.json()) as CatalogItem[]);
        if (servicesRes.ok)
          setServiceOptions((await servicesRes.json()) as CatalogItem[]);
        if (pricingRes.ok) {
          const pricing = (await pricingRes.json()) as {
            hourTypes?: PricingOption[];
            technicianTypes?: PricingOption[];
          };
          setHourTypes(pricing.hourTypes || []);
          setTechnicianTypes(pricing.technicianTypes || []);
        }
        if (scopesRes.ok)
          setScopeTemplates((await scopesRes.json()) as ScopeTemplate[]);
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

    if (clientIdFromUrl) setSelectedClientId(clientIdFromUrl);
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
        if (res.ok) setGenerators((await res.json()) as Generator[]);
      } finally {
        setEquipmentLookupLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [equipmentSearch, selectedClientId]);

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
    }
  }, [paymentTerm, paymentTermBlockReason, paymentTermOptions, selectedClient]);

  const addPart = () =>
    setParts((prev) => [
      ...prev,
      { catalogItemId: "", quantity: "1", unitPrice: "" },
    ]);
  const removePart = (index: number) =>
    setParts((prev) => prev.filter((_, i) => i !== index));

  const updatePart = (index: number, field: keyof RowItem, value: string) => {
    setParts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = partOptions.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
      }
      return copy;
    });
  };

  const addLabor = () =>
    setLabor((prev) => [
      ...prev,
      { catalogItemId: "", quantity: "1", unitPrice: "" },
    ]);
  const removeLabor = (index: number) =>
    setLabor((prev) => prev.filter((_, i) => i !== index));

  const updateLabor = (index: number, field: keyof RowItem, value: string) => {
    setLabor((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = serviceOptions.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
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
    if (type === "PART") setPartOptions(payload);
    if (type === "SERVICE") setServiceOptions(payload);
  }

  const addHourlyService = () =>
    setHourlyServices((prev) => [
      ...prev,
      {
        description: "Servico por hora",
        hourType: "ONE_OFF",
        technicianType: "MID_LEVEL_TECHNICIAN",
        hours: "1",
        unitPrice: "",
        discountPercent: "0",
      },
    ]);
  const removeHourlyService = (index: number) =>
    setHourlyServices((prev) => prev.filter((_, i) => i !== index));
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
      }
      return copy;
    });
  };

  const addOtherItem = () =>
    setOtherItems((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "" },
    ]);
  const removeOtherItem = (index: number) =>
    setOtherItems((prev) => prev.filter((_, i) => i !== index));
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
    const currentParts = scope
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const next = joinScopeTexts([
      ...currentParts,
      ...selectedScopeTemplates.map((template) => template.scopeText),
    ]);
    setScope(next);
  }

  const addItemsFromEquipmentBase = async () => {
    if (!selectedEquipmentId) {
      setFeedback({ kind: "error", text: "Selecione um equipamento." });
      return;
    }
    if (!serviceType) {
      setFeedback({ kind: "error", text: "Selecione o tipo de servico." });
      return;
    }

    setLoadingBaseItems(true);
    setFeedback(null);
    try {
      const res = await apiFetch(
        apiUrl(
          `/generators/${selectedEquipmentId}/base-items?group=${serviceType}`,
        ),
        {},
      );

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao buscar itens base."),
        );
      }

      const baseItems = await res.json();
      if (!Array.isArray(baseItems) || baseItems.length === 0) {
        setFeedback({
          kind: "error",
          text: "Nenhum item base encontrado para este grupo.",
        });
        return;
      }

      const toPart = baseItems
        .filter((item: any) => item.catalogItem?.type !== "SERVICE")
        .map((item: any) => ({
          catalogItemId: item.catalogItemId,
          quantity: String(item.quantity ?? 1),
          unitPrice: String(item.catalogItem?.basePrice ?? 0),
        }));

      const toLabor = baseItems
        .filter((item: any) => item.catalogItem?.type === "SERVICE")
        .map((item: any) => ({
          catalogItemId: item.catalogItemId,
          quantity: String(item.quantity ?? 1),
          unitPrice: String(item.catalogItem?.basePrice ?? 0),
        }));

      setParts((prev) => [...prev, ...toPart]);
      setLabor((prev) => [...prev, ...toLabor]);
      setFeedback({
        kind: "success",
        text: `Itens base adicionados: ${baseItems.length}.`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro ao adicionar itens base.",
      });
    } finally {
      setLoadingBaseItems(false);
    }
  };

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
        const gross = Number(item.hours || 0) * Number(item.unitPrice || 0);
        const discount = Math.min(
          100,
          Math.max(0, Number(item.discountPercent || 0)),
        );
        return acc + gross * (1 - discount / 100);
      }, 0),
    [hourlyServices],
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
  const subtotal = partsTotal + laborTotal + hourlyTotal + otherTotal;

  const maxDiscountAllowed = USER_ROLE === "ADMIN" ? subtotal : subtotal * 0.07;

  const finalDiscount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      let percent = Number(discountInput) || 0;
      if (USER_ROLE === "NORMAL" && percent > 7) percent = 7;
      return subtotal * (percent / 100);
    }

    let value = Number(discountInput) || 0;
    if (USER_ROLE === "NORMAL" && value > maxDiscountAllowed)
      value = maxDiscountAllowed;
    return value;
  }, [discountInput, discountType, maxDiscountAllowed, subtotal, USER_ROLE]);

  const grandTotal = Math.max(0, subtotal - finalDiscount);
  const entryAmount = hasDownPayment
    ? Math.min(grandTotal, Math.max(0, Number(downPaymentAmount || 0)))
    : 0;
  const remainingAfterEntry = Math.max(0, grandTotal - entryAmount);
  const installments = Math.max(1, Number(installmentCount || 1));
  const installmentValue = remainingAfterEntry / installments;

  const hitDiscountLimit =
    USER_ROLE === "NORMAL" &&
    ((discountType === "PERCENTAGE" && Number(discountInput) > 7) ||
      (discountType === "VALUE" && Number(discountInput) > maxDiscountAllowed));
  const latestInspection = linkedOpportunity?.inspections?.[0] || null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setFeedback({ kind: "error", text: "Selecione um cliente." });
      return;
    }
    if (!selectedSellerId) {
      setFeedback({ kind: "error", text: "Selecione um vendedor comercial." });
      return;
    }
    if (
      parts.length === 0 &&
      labor.length === 0 &&
      hourlyServices.length === 0 &&
      otherItems.length === 0
    ) {
      setFeedback({
        kind: "error",
        text: "Adicione pelo menos um item ou servico.",
      });
      return;
    }
    if (hasDownPayment && entryAmount <= 0) {
      setFeedback({
        kind: "error",
        text: "Informe um valor de entrada maior que zero.",
      });
      return;
    }

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
        unitPrice: Number(item.unitPrice || 0),
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
      type: "PARTS_AND_SERVICES",
      scope,
      freight,
      validUntil: validUntil || undefined,
      paymentTerm: paymentTerm || undefined,
      deliveryLeadTimeDays: deliveryLeadTimeDays
        ? Number(deliveryLeadTimeDays)
        : undefined,
      paymentDetails: paymentDetails || undefined,
      hasDownPayment,
      downPaymentAmount: hasDownPayment ? entryAmount : undefined,
      installmentCount: installments,
      installmentIntervalDays: installmentIntervalDays
        ? Number(installmentIntervalDays)
        : undefined,
      firstDueDate: firstDueDate || undefined,
      internalNotes,
      externalNotes,
      discount: finalDiscount,
      items: allItems,
    };

    try {
      const res = await apiFetch(apiUrl("/proposals"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

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
        text: "Proposta gerada com sucesso. Redirecionando...",
      });
      router.push(
        createdProposal?.id
          ? `/dashboard/proposals/${createdProposal.id}`
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
  return (
    <div className="mx-auto max-w-6xl p-8 pb-10">
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Nova Proposta</h1>
          <p className="mt-1 text-zinc-500">
            Monte itens, condicoes comerciais e pagamento com simulacao de
            entrada e parcelas.
          </p>
        </div>
      </div>

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

      {feedback ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            feedback.kind === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {linkedOpportunity ? (
        <section className="rounded-xl border border-sky-200 bg-[linear-gradient(135deg,#f7fbff_0%,#eef7ff_100%)] p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">
                Origem CRM
              </p>
              <h2 className="mt-2 text-xl font-bold text-zinc-900">
                {linkedOpportunity.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Cliente: {linkedOpportunity.client.companyName} | Etapa:{" "}
                {OPPORTUNITY_STAGE_LABEL[linkedOpportunity.stage] ||
                  linkedOpportunity.stage}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Vendedor:{" "}
                {linkedOpportunity.assignedSeller?.name || "Nao definido"} |
                Valor estimado: R${" "}
                {Number(linkedOpportunity.estimatedValue || 0).toLocaleString(
                  "pt-BR",
                )}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Pipeline: {linkedOpportunity.pipeline || "Nao informado"} |
                Tipo: {linkedOpportunity.opportunityType || "Nao informado"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/opportunities?opportunityId=${linkedOpportunity.id}`}
                className="inline-flex rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                Abrir no funil
              </Link>
              {linkedOpportunity.proposals?.[0] ? (
                <Link
                  href={`/dashboard/proposals/${linkedOpportunity.proposals[0].id}`}
                  className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Ultima proposta: {linkedOpportunity.proposals[0].code}
                </Link>
              ) : null}
            </div>
          </div>

          {latestInspection ? (
            <div className="mt-4 rounded-lg border border-sky-100 bg-white/90 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                Ultima vistoria vinculada
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-800">
                {latestInspection.code} |{" "}
                {INSPECTION_STATUS_LABEL[latestInspection.status] ||
                  latestInspection.status}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {latestInspection.finishedAt
                  ? `Concluida em ${new Date(latestInspection.finishedAt).toLocaleDateString("pt-BR")}`
                  : latestInspection.scheduledAt
                    ? `Agendada para ${new Date(latestInspection.scheduledAt).toLocaleDateString("pt-BR")}`
                    : "Sem data registrada"}
              </p>
              {latestInspection.technicalNotes ? (
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  {latestInspection.technicalNotes}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">
            1. Cliente e Equipamento
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
                    Cliente travado pela oportunidade vinculada.
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
                        clients.map((c) => (
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
                  {quickClientOpen ? "Fechar cliente rapido" : "Cliente rapido"}
                </button>
              ) : null}
              {selectedClient?.proposalCreationBlocked ? (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  Bloqueio comercial: {selectedClient.proposalBlockReason || "consulte o responsavel comercial"}.
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
                    selectedClientId ? "Pesquisar maquina" : "Escolha o cliente"
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-500 disabled:bg-zinc-100"
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
                      availableGenerators.map((gen) => (
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
                        sellers.map((seller) => (
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
                              {seller.department || seller.email || "Comercial"}
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
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                disabled={!selectedEquipmentId}
                className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 font-semibold text-emerald-700 disabled:bg-zinc-100"
              >
                <option value="">Selecione</option>
                <option value="TOF">TOF</option>
                <option value="TM">TM</option>
                <option value="TB">TB</option>
                <option value="TMA">TMA</option>
                <option value="OUTROS">OUTROS</option>
              </select>
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

          <div className="mt-3">
            <button
              type="button"
              onClick={addItemsFromEquipmentBase}
              disabled={
                !selectedEquipmentId || !serviceType || loadingBaseItems
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingBaseItems
                ? "Carregando base..."
                : "Adicionar itens da base"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-bold text-zinc-800">2. Pecas</h2>
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
            <div
              key={`part-${index}`}
              className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:flex-nowrap"
            >
              <div className="min-w-[250px] flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-500">
                  Buscar peca
                </label>
                <SearchableSelect
                  items={partOptions}
                  value={part.catalogItemId}
                  onChange={(val) => updatePart(index, "catalogItemId", val)}
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
              <button
                type="button"
                onClick={() => removePart(index)}
                className="p-2 text-lg text-red-500 hover:text-red-700"
              >
                X
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-bold text-zinc-800">
              3. Mao de obra / servicos
            </h2>
            <button
              type="button"
              onClick={addLabor}
              className="rounded-md bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-600 hover:bg-purple-100"
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
            <div
              key={`labor-${index}`}
              className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:flex-nowrap"
            >
              <div className="min-w-[250px] flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-500">
                  Buscar servico
                </label>
                <SearchableSelect
                  items={serviceOptions}
                  value={lab.catalogItemId}
                  onChange={(val) => updateLabor(index, "catalogItemId", val)}
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
                <label className="mb-1 block text-xs font-medium text-purple-600">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  value={lab.unitPrice}
                  onChange={(e) =>
                    updateLabor(index, "unitPrice", e.target.value)
                  }
                  className="w-full rounded-md border border-zinc-300 p-2 text-sm font-bold text-purple-700"
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLabor(index)}
                className="p-2 text-lg text-red-500 hover:text-red-700"
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-2">
            <div>
              <h2 className="text-lg font-bold text-zinc-800">
                4. Servico por hora
              </h2>
              <p className="text-xs text-zinc-500">
                Valor de venda ao cliente. Custo interno nao e exibido.
              </p>
            </div>
            <button
              type="button"
              onClick={addHourlyService}
              className="rounded-md bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              + Adicionar hora
            </button>
          </div>

          {hourlyServices.length === 0 ? (
            <p className="text-sm italic text-zinc-500">
              Nenhum servico por hora adicionado.
            </p>
          ) : null}

          {hourlyServices.map((item, index) => {
            const gross = Number(item.hours || 0) * Number(item.unitPrice || 0);
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
                    updateHourlyService(index, "description", e.target.value)
                  }
                />
                <select
                  value={item.hourType}
                  onChange={(e) =>
                    updateHourlyService(index, "hourType", e.target.value)
                  }
                  className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                >
                  {(hourTypes.length
                    ? hourTypes
                    : [{ value: "ONE_OFF", label: "Hora avulsa" }]
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={item.technicianType}
                  onChange={(e) =>
                    updateHourlyService(index, "technicianType", e.target.value)
                  }
                  className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                >
                  {(technicianTypes.length
                    ? technicianTypes
                    : [
                        {
                          value: "MID_LEVEL_TECHNICIAN",
                          label: "Tecnico pleno",
                        },
                      ]
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) =>
                    updateHourlyService(index, "unitPrice", e.target.value)
                  }
                  className="rounded-md border border-amber-200 bg-white p-2 text-sm"
                  placeholder="Valor hora"
                />
                <div className="flex items-center gap-2 md:col-span-6">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discountPercent}
                    onChange={(e) =>
                      updateHourlyService(
                        index,
                        "discountPercent",
                        e.target.value,
                      )
                    }
                    className="w-28 rounded-md border border-amber-200 bg-white p-2 text-sm"
                    placeholder="Desc. %"
                  />
                  <span className="text-sm font-semibold text-amber-800">
                    Total: R$ {formatMoney(total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeHourlyService(index)}
                    className="ml-auto p-2 text-lg text-red-500 hover:text-red-700"
                  >
                    X
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-bold text-zinc-800">5. Outros itens</h2>
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
                className="p-2 text-lg text-red-500 hover:text-red-700"
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">
            6. Condicoes comerciais e financeiras
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="md:col-span-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Escopo
              </label>
              <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Escopos prontos
                  </p>
                  <button
                    type="button"
                    onClick={appendScopeTemplates}
                    disabled={selectedScopeTemplates.length === 0}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Adicionar ao escopo
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {scopeTemplates.map((template) => (
                    <label
                      key={template.id}
                      className="flex items-start gap-2 rounded border border-zinc-200 bg-white p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopeTemplateIds.includes(template.id)}
                        onChange={(e) => {
                          setSelectedScopeTemplateIds((current) =>
                            e.target.checked
                              ? [...current, template.id]
                              : current.filter((id) => id !== template.id),
                          );
                        }}
                      />
                      <span>
                        <span className="block font-semibold text-zinc-800">
                          {template.name}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {template.category || "Escopo comercial"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {combinedScopeText ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-700">
                    {combinedScopeText}
                  </pre>
                ) : null}
              </div>
              <textarea
                rows={6}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-3 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Frete
              </label>
              <select
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5"
              >
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="SEM_FRETE">Sem frete</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Validade
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5"
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
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Condicao de pagamento
              </label>
              <select
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5"
              >
                <option value="">Selecione uma condicao</option>
                {paymentTermOptions.map((option) => {
                  const blockReason = paymentTermBlockReason(option);
                  return (
                    <option
                      key={option.id}
                      value={option.name}
                      disabled={Boolean(blockReason)}
                    >
                      {option.name}
                      {blockReason ? ` - ${blockReason}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Dados para pagamento
              </label>
              <textarea
                rows={2}
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                placeholder="PIX, banco, agencia, conta, favorecido"
                className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
              />
            </div>

            <div className="md:col-span-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-blue-800 md:col-span-4">
                  <input
                    type="checkbox"
                    checked={hasDownPayment}
                    onChange={(e) => setHasDownPayment(e.target.checked)}
                  />
                  Possui entrada?
                </label>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">
                    Valor entrada
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!hasDownPayment}
                    value={downPaymentAmount}
                    onChange={(e) => setDownPaymentAmount(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2 disabled:bg-zinc-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">
                    Parcelas
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">
                    Intervalo (dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={installmentIntervalDays}
                    onChange={(e) => setInstallmentIntervalDays(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">
                    Primeiro vencimento
                  </label>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <p className="rounded border border-blue-100 bg-white px-3 py-2">
                  Entrada:{" "}
                  <span className="font-bold">
                    R$ {formatMoney(entryAmount)}
                  </span>
                </p>
                <p className="rounded border border-blue-100 bg-white px-3 py-2">
                  Saldo:{" "}
                  <span className="font-bold">
                    R$ {formatMoney(remainingAfterEntry)}
                  </span>
                </p>
                <p className="rounded border border-blue-100 bg-white px-3 py-2">
                  Parcela ({installments}x):{" "}
                  <span className="font-bold">
                    R$ {formatMoney(installmentValue)}
                  </span>
                </p>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Observacoes internas
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Observacoes para cliente
              </label>
              <textarea
                rows={2}
                value={externalNotes}
                onChange={(e) => setExternalNotes(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-red-100 bg-red-50 p-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-red-600">
                  Tipo desconto
                </label>
                <select
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value as "PERCENTAGE" | "VALUE");
                    setDiscountInput("");
                  }}
                  className="w-full rounded-md border border-red-300 bg-white p-2 text-sm font-semibold text-red-700"
                >
                  <option value="PERCENTAGE">Porcentagem (%)</option>
                  <option value="VALUE">Valor fixo (R$)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-red-600">
                  Aplicar desconto
                </label>
                <input
                  type="number"
                  min="0"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className={`w-full rounded-md border p-2 text-sm font-bold focus:outline-none ${
                    hitDiscountLimit
                      ? "border-red-500 bg-red-100 text-red-600"
                      : "border-red-300 bg-white text-red-700"
                  }`}
                  placeholder={
                    discountType === "PERCENTAGE" ? "Ex: 5" : "Ex: 150.00"
                  }
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
        </div>

        <div className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-8">
            {finalDiscount > 0 ? (
              <div className="hidden text-zinc-400 md:block">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider">
                  Subtotal
                </p>
                <p className="text-xl line-through">
                  R$ {formatMoney(subtotal)}
                </p>
              </div>
            ) : null}

            {finalDiscount > 0 ? (
              <div className="rounded-lg bg-red-50 px-3 py-1 text-red-500">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider">
                  Desconto
                </p>
                <p className="text-lg font-bold">
                  - R$ {formatMoney(finalDiscount)}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-sm font-bold text-zinc-500">
                {finalDiscount > 0 ? "Total final" : "Valor total"}
              </p>
              <p className="text-3xl font-extrabold text-emerald-600">
                R$ {formatMoney(grandTotal)}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !selectedClientId ||
              Boolean(selectedClient?.proposalCreationBlocked)
            }
            className="rounded-lg bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSubmitting ? "Gerando..." : "Salvar proposta"}
          </button>
        </div>
      </form>
    </div>
  );
}
