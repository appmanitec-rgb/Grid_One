
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";

type CatalogItem = {
  id: string;
  name: string;
  code?: string | null;
  basePrice?: number | null;
  type?: string | null;
};

type Client = {
  id: string;
  companyName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
};

type Generator = {
  id: string;
  name?: string | null;
  clientId?: string | null;
};

type LinkedOpportunity = {
  id: string;
  title: string;
  stage: string;
  estimatedValue?: number | null;
  client: { id: string; companyName: string; tradeName?: string | null };
  assignedSeller?: { id: string; name: string } | null;
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

function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: CatalogItem[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const selected = items.find((i) => i.id === value);
    if (selected) {
      setSearch(`${selected.code ? `[${selected.code}] ` : ""}${selected.name}`);
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
          setSearch(e.target.value);
          setIsOpen(true);
          onChange("");
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
                  {item.code || "S/COD"}
                </span>
                <span className="text-zinc-700">{item.name}</span>
              </li>
            ))
          ) : (
            <li className="p-2 text-sm text-zinc-500">Nenhum item encontrado.</li>
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
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [linkedOpportunity, setLinkedOpportunity] = useState<LinkedOpportunity | null>(null);
  const [loadingOpportunity, setLoadingOpportunity] = useState(false);
  const [linkedOpportunityError, setLinkedOpportunityError] = useState("");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [loadingBaseItems, setLoadingBaseItems] = useState(false);

  const [parts, setParts] = useState<RowItem[]>([]);
  const [labor, setLabor] = useState<RowItem[]>([]);

  const [scope, setScope] = useState("");
  const [freight, setFreight] = useState("FOB");
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [deliveryLeadTimeDays, setDeliveryLeadTimeDays] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [hasDownPayment, setHasDownPayment] = useState(false);
  const [downPaymentAmount, setDownPaymentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [externalNotes, setExternalNotes] = useState("");

  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "VALUE">("PERCENTAGE");
  const [discountInput, setDiscountInput] = useState("");
  useEffect(() => {
    async function fetchData() {
      try {
        const [clientsRes, catalogRes, generatorsRes] = await Promise.all([
          apiFetch(apiUrl("/clients")),
          apiFetch(apiUrl("/catalogs")),
          apiFetch(apiUrl("/generators")),
        ]);

        if (clientsRes.ok) setClients((await clientsRes.json()) as Client[]);
        if (catalogRes.ok) setCatalogItems((await catalogRes.json()) as CatalogItem[]);
        if (generatorsRes.ok) setGenerators((await generatorsRes.json()) as Generator[]);
        if (!clientsRes.ok || !catalogRes.ok || !generatorsRes.ok) {
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

    if (clientIdFromUrl) setSelectedClientId(clientIdFromUrl);
    if (!opportunityIdFromUrl) return;

    let cancelled = false;

    async function fetchOpportunity() {
      setLoadingOpportunity(true);
      setLinkedOpportunityError("");
      try {
        const res = await apiFetch(apiUrl(`/crm/opportunities/${opportunityIdFromUrl}`), {
          cache: "no-store",
        });

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

  const availableParts = useMemo(
    () => catalogItems.filter((item) => item.type !== "SERVICE"),
    [catalogItems],
  );
  const availableServices = useMemo(
    () => catalogItems.filter((item) => item.type === "SERVICE"),
    [catalogItems],
  );
  const availableGenerators = useMemo(
    () => generators.filter((g) => g.clientId === selectedClientId),
    [generators, selectedClientId],
  );

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients.slice(0, 30);

    return clients
      .filter(
        (c) =>
          (c.companyName || "").toLowerCase().includes(term) ||
          (c.tradeName || "").toLowerCase().includes(term) ||
          (c.cnpj || "").toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [clients, clientSearch]);

  const addPart = () =>
    setParts((prev) => [...prev, { catalogItemId: "", quantity: "1", unitPrice: "" }]);
  const removePart = (index: number) =>
    setParts((prev) => prev.filter((_, i) => i !== index));

  const updatePart = (index: number, field: keyof RowItem, value: string) => {
    setParts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = catalogItems.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
      }
      return copy;
    });
  };

  const addLabor = () =>
    setLabor((prev) => [...prev, { catalogItemId: "", quantity: "1", unitPrice: "" }]);
  const removeLabor = (index: number) =>
    setLabor((prev) => prev.filter((_, i) => i !== index));

  const updateLabor = (index: number, field: keyof RowItem, value: string) => {
    setLabor((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "catalogItemId") {
        const itemInfo = catalogItems.find((i) => i.id === value);
        copy[index].unitPrice = String(itemInfo?.basePrice ?? "");
      }
      return copy;
    });
  };

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
        apiUrl(`/generators/${selectedEquipmentId}/base-items?group=${serviceType}`),
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
    () => parts.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [parts],
  );
  const laborTotal = useMemo(
    () => labor.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [labor],
  );
  const subtotal = partsTotal + laborTotal;

  const maxDiscountAllowed = USER_ROLE === "ADMIN" ? subtotal : subtotal * 0.07;

  const finalDiscount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      let percent = Number(discountInput) || 0;
      if (USER_ROLE === "NORMAL" && percent > 7) percent = 7;
      return subtotal * (percent / 100);
    }

    let value = Number(discountInput) || 0;
    if (USER_ROLE === "NORMAL" && value > maxDiscountAllowed) value = maxDiscountAllowed;
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
    if (parts.length === 0 && labor.length === 0) {
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

    const allItems = [...parts, ...labor].filter((item) => item.catalogItemId);
    const token = getStoredAccessToken();
    const tokenPayload = token ? decodeJwtPayload<{ sub?: string }>(token) : null;

    const payload = {
      clientId: selectedClientId,
      salesOpportunityId: linkedOpportunity?.id || undefined,
      generatorId: selectedEquipmentId || undefined,
      userId: tokenPayload?.sub,
      type: "PARTS_AND_SERVICES",
      scope,
      freight,
      validUntil: validUntil || undefined,
      paymentTerm: paymentTerm || undefined,
      deliveryLeadTimeDays: deliveryLeadTimeDays ? Number(deliveryLeadTimeDays) : undefined,
      paymentDetails: paymentDetails || undefined,
      hasDownPayment,
      downPaymentAmount: hasDownPayment ? entryAmount : undefined,
      installmentCount: installments,
      installmentIntervalDays: installmentIntervalDays ? Number(installmentIntervalDays) : undefined,
      firstDueDate: firstDueDate || undefined,
      internalNotes,
      externalNotes,
      discount: finalDiscount,
      items: allItems.map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      })),
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

      const createdProposal = (await res.json().catch(() => null)) as { id?: string } | null;
      setFeedback({
        kind: "success",
        text: "Proposta gerada com sucesso. Redirecionando...",
      });
      router.push(createdProposal?.id ? `/dashboard/proposals/${createdProposal.id}` : "/dashboard/proposals");
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Nova Proposta</h1>
          <p className="mt-1 text-zinc-500">
            Monte itens, condicoes comerciais e pagamento com simulacao de entrada e parcelas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/proposals")}
          className="rounded px-4 py-2 font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
        >
          Voltar
        </button>
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
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">Origem CRM</p>
              <h2 className="mt-2 text-xl font-bold text-zinc-900">{linkedOpportunity.title}</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Cliente: {linkedOpportunity.client.companyName} | Etapa: {OPPORTUNITY_STAGE_LABEL[linkedOpportunity.stage] || linkedOpportunity.stage}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Vendedor: {linkedOpportunity.assignedSeller?.name || "Nao definido"} | Valor estimado: R$ {Number(linkedOpportunity.estimatedValue || 0).toLocaleString("pt-BR")}
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
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Ultima vistoria vinculada</p>
              <p className="mt-2 text-sm font-semibold text-zinc-800">
                {latestInspection.code} | {INSPECTION_STATUS_LABEL[latestInspection.status] || latestInspection.status}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {latestInspection.finishedAt
                  ? `Concluida em ${new Date(latestInspection.finishedAt).toLocaleDateString("pt-BR")}`
                  : latestInspection.scheduledAt
                    ? `Agendada para ${new Date(latestInspection.scheduledAt).toLocaleDateString("pt-BR")}`
                    : "Sem data registrada"}
              </p>
              {latestInspection.technicalNotes ? (
                <p className="mt-2 text-sm leading-6 text-zinc-700">{latestInspection.technicalNotes}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">1. Cliente e Equipamento</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Cliente</label>
              {linkedOpportunity ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-sm font-semibold text-zinc-800">{linkedOpportunity.client.companyName}</p>
                  <p className="mt-1 text-xs text-sky-700">Cliente travado pela oportunidade vinculada.</p>
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
                    onBlur={() => setTimeout(() => setClientDropdownOpen(false), 150)}
                    placeholder="Pesquisar cliente por nome, fantasia ou CNPJ"
                    className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                  {clientDropdownOpen ? (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl">
                      {filteredClients.length === 0 ? (
                        <p className="p-3 text-sm text-zinc-500">Nenhum cliente encontrado.</p>
                      ) : (
                        filteredClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setSelectedClientId(c.id);
                              setSelectedEquipmentId("");
                              setClientSearch(c.companyName || "");
                              setClientDropdownOpen(false);
                            }}
                            className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-emerald-50 last:border-0"
                          >
                            <p className="text-sm font-semibold text-zinc-800">{c.companyName}</p>
                            <p className="text-xs text-zinc-500">
                              {c.tradeName || "-"}
                              {c.cnpj ? ` | ${c.cnpj}` : ""}
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
              <label className="mb-1 block text-sm font-medium text-zinc-700">Equipamento</label>
              <select
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                disabled={!selectedClientId}
                className="w-full rounded-lg border border-zinc-300 bg-white p-2.5 disabled:bg-zinc-100"
              >
                <option value="">{selectedClientId ? "Selecione a maquina" : "Escolha o cliente"}</option>
                {availableGenerators.map((gen) => (
                  <option key={gen.id} value={gen.id}>
                    {gen.name || "Equipamento"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Tipo de Servico</label>
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

          <div className="mt-3">
            <button
              type="button"
              onClick={addItemsFromEquipmentBase}
              disabled={!selectedEquipmentId || !serviceType || loadingBaseItems}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingBaseItems ? "Carregando base..." : "Adicionar itens da base"}
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

          {parts.length === 0 ? <p className="text-sm italic text-zinc-500">Nenhuma peca adicionada.</p> : null}

          {parts.map((part, index) => (
            <div
              key={`part-${index}`}
              className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:flex-nowrap"
            >
              <div className="min-w-[250px] flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-500">Buscar peca</label>
                <SearchableSelect
                  items={availableParts}
                  value={part.catalogItemId}
                  onChange={(val) => updatePart(index, "catalogItemId", val)}
                  placeholder="Nome ou codigo"
                />
              </div>
              <div className="w-20">
                <label className="mb-1 block text-xs font-medium text-zinc-500">Qtd</label>
                <input
                  type="number"
                  min="1"
                  value={part.quantity}
                  onChange={(e) => updatePart(index, "quantity", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-zinc-500">Preco (R$)</label>
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
            <h2 className="text-lg font-bold text-zinc-800">3. Mao de obra / servicos</h2>
            <button
              type="button"
              onClick={addLabor}
              className="rounded-md bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-600 hover:bg-purple-100"
            >
              + Adicionar servico
            </button>
          </div>

          {labor.length === 0 ? <p className="text-sm italic text-zinc-500">Nenhum servico adicionado.</p> : null}

          {labor.map((lab, index) => (
            <div
              key={`labor-${index}`}
              className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:flex-nowrap"
            >
              <div className="min-w-[250px] flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-500">Buscar servico</label>
                <SearchableSelect
                  items={availableServices}
                  value={lab.catalogItemId}
                  onChange={(val) => updateLabor(index, "catalogItemId", val)}
                  placeholder="Nome ou codigo"
                />
              </div>
              <div className="w-20">
                <label className="mb-1 block text-xs font-medium text-zinc-500">Qtd</label>
                <input
                  type="number"
                  min="1"
                  value={lab.quantity}
                  onChange={(e) => updateLabor(index, "quantity", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-purple-600">Valor (R$)</label>
                <input
                  type="number"
                  value={lab.unitPrice}
                  onChange={(e) => updateLabor(index, "unitPrice", e.target.value)}
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
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">4. Condicoes comerciais e financeiras</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="md:col-span-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Escopo</label>
              <textarea
                rows={2}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-3 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Frete</label>
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
              <label className="mb-1 block text-sm font-medium text-zinc-700">Validade</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Prazo de entrega (dias)</label>
              <input
                type="number"
                min="0"
                value={deliveryLeadTimeDays}
                onChange={(e) => setDeliveryLeadTimeDays(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Condicao de pagamento</label>
              <input
                type="text"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                placeholder="Ex: 30/60, 21 dias, boleto"
                className="w-full rounded-lg border border-zinc-300 p-2.5"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Dados para pagamento</label>
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
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">Valor entrada</label>
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
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">Intervalo (dias)</label>
                  <input
                    type="number"
                    min="1"
                    value={installmentIntervalDays}
                    onChange={(e) => setInstallmentIntervalDays(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white p-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-blue-700">Primeiro vencimento</label>
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
                  Entrada: <span className="font-bold">R$ {formatMoney(entryAmount)}</span>
                </p>
                <p className="rounded border border-blue-100 bg-white px-3 py-2">
                  Saldo: <span className="font-bold">R$ {formatMoney(remainingAfterEntry)}</span>
                </p>
                <p className="rounded border border-blue-100 bg-white px-3 py-2">
                  Parcela ({installments}x): <span className="font-bold">R$ {formatMoney(installmentValue)}</span>
                </p>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Observacoes internas</label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Observacoes para cliente</label>
              <textarea
                rows={2}
                value={externalNotes}
                onChange={(e) => setExternalNotes(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 p-2.5 text-sm"
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-red-100 bg-red-50 p-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-red-600">Tipo desconto</label>
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
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-red-600">Aplicar desconto</label>
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
                  placeholder={discountType === "PERCENTAGE" ? "Ex: 5" : "Ex: 150.00"}
                />
              </div>

              {hitDiscountLimit ? (
                <p className="col-span-2 mt-1 text-xs font-bold text-red-500">
                  Limite de vendedor atingido. Max: {discountType === "PERCENTAGE" ? "7%" : `R$ ${formatMoney(maxDiscountAllowed)}`}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-8">
            {finalDiscount > 0 ? (
              <div className="hidden text-zinc-400 md:block">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider">Subtotal</p>
                <p className="text-xl line-through">R$ {formatMoney(subtotal)}</p>
              </div>
            ) : null}

            {finalDiscount > 0 ? (
              <div className="rounded-lg bg-red-50 px-3 py-1 text-red-500">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider">Desconto</p>
                <p className="text-lg font-bold">- R$ {formatMoney(finalDiscount)}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-sm font-bold text-zinc-500">
                {finalDiscount > 0 ? "Total final" : "Valor total"}
              </p>
              <p className="text-3xl font-extrabold text-emerald-600">R$ {formatMoney(grandTotal)}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !selectedClientId}
            className="rounded-lg bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSubmitting ? "Gerando..." : "Salvar proposta"}
          </button>
        </div>
      </form>
    </div>
  );
}
