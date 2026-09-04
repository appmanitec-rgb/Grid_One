"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

const ASSET_TYPES = ["EPI", "TOOL"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  EPI: "EPI",
  TOOL: "Ferramenta",
};

const ASSET_STATUS = ["ACTIVE", "RETURNED", "LOST", "EXPIRED"] as const;
type AssetStatus = (typeof ASSET_STATUS)[number];

const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: "Ativo",
  RETURNED: "Devolvido",
  LOST: "Perdido",
  EXPIRED: "Vencido",
};

const ACTIVE_STATUS = new Set<AssetStatus>(["ACTIVE", "EXPIRED"]);

type AssetTypeFilter = "ALL" | AssetType;
type AssetStatusFilter = "ALL" | AssetStatus;

type HrAssetRow = {
  id: string;
  assetType: AssetType;
  title: string;
  caCode?: string | null;
  deliveredAt: string;
  expiresAt?: string | null;
  status: AssetStatus;
  signedTermUrl?: string | null;
  user: { id: string; name: string; department?: string | null };
  catalogItem?: { id: string; name: string; sku?: string | null } | null;
};

type Collaborator = {
  id: string;
  name: string;
};

type CatalogItem = {
  id: string;
  name: string;
  sku?: string | null;
  type: string;
  description?: string | null;
  commercialDescription?: string | null;
  category?: string | null;
  applicationNotes?: string | null;
  technicalSpecs?: Record<string, unknown> | null;
  stockCurrent?: number | null;
};

type SearchOption = {
  id: string;
  label: string;
  description?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isInCustody(item: HrAssetRow) {
  return ACTIVE_STATUS.has(item.status);
}

function isExpiringSoon(item: HrAssetRow) {
  if (!item.expiresAt || item.status !== "ACTIVE") return false;
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  const expires = new Date(item.expiresAt);
  return expires >= now && expires <= limit;
}

function matchesSearch(item: HrAssetRow, search: string) {
  if (!search.trim()) return true;
  const target = normalize(
    [
      item.user.name,
      item.user.department,
      item.title,
      item.caCode,
      item.catalogItem?.name,
      item.catalogItem?.sku,
      ASSET_TYPE_LABEL[item.assetType],
      ASSET_STATUS_LABEL[item.status],
    ]
      .filter(Boolean)
      .join(" "),
  );

  return target.includes(normalize(search));
}

function firstTextValue(values: unknown[]) {
  const found = values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return found?.trim() || "";
}

function extractCatalogCaCode(item: CatalogItem) {
  const specs = item.technicalSpecs && typeof item.technicalSpecs === "object"
    ? item.technicalSpecs
    : {};
  const specValue = firstTextValue([
    specs.caCode,
    specs.ca,
    specs.codigoCa,
    specs.codigoCA,
    specs.certificadoAprovacao,
  ]);
  if (specValue) return specValue;

  const text = `${item.description || ""} ${item.commercialDescription || ""} ${item.applicationNotes || ""}`;
  const match = text.match(/\bCA[\s:-]*(\d{3,8})\b/i);
  return match ? `CA-${match[1]}` : "";
}

function getCatalogDescription(item: CatalogItem) {
  return item.description || item.commercialDescription || item.name;
}

function getCatalogControlCode(item: CatalogItem, type: AssetType) {
  if (type === "EPI") return extractCatalogCaCode(item) || item.sku || "";
  return item.sku || "";
}

function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        {children}
      </select>
    </label>
  );
}

function SearchField({
  label,
  value,
  placeholder,
  options,
  emptyLabel,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SearchOption[];
  emptyLabel: string;
  onChange: (value: string) => void;
  onSelect: (option: SearchOption) => void;
}) {
  const [focused, setFocused] = useState(false);
  const showOptions = focused && value.trim().length >= 1;

  return (
    <label className="relative space-y-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-zinc-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      {showOptions ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-left shadow-xl">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs font-medium normal-case tracking-normal text-slate-500">
              {emptyLabel}
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  setFocused(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm normal-case tracking-normal text-slate-700 transition hover:bg-blue-50"
              >
                <span className="block font-semibold text-slate-900">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs font-medium text-slate-500">
                    {option.description}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "blue" | "amber" | "green";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "green"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-white text-zinc-900";

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const tone =
    status === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "EXPIRED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "LOST"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${tone}`}>
      {ASSET_STATUS_LABEL[status]}
    </span>
  );
}

export default function EpisToolsPage() {
  const [items, setItems] = useState<HrAssetRow[]>([]);
  const [expiring, setExpiring] = useState<HrAssetRow[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<AssetStatusFilter>("ALL");
  const [collaboratorFilter, setCollaboratorFilter] = useState("ALL");
  const [collaboratorFilterSearch, setCollaboratorFilterSearch] = useState("");
  const [selectedDossierUserId, setSelectedDossierUserId] = useState("");
  const [dossierSearch, setDossierSearch] = useState("");

  const [userId, setUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("EPI");
  const [title, setTitle] = useState("");
  const [caCode, setCaCode] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [signedTermUrl, setSignedTermUrl] = useState("");

  async function loadAll() {
    setError("");
    setMessage("");
    try {
      const [assetsRes, expiringRes, collaboratorsRes, catalogsRes] =
        await Promise.all([
          apiFetch("/hr-admin/assets", {
            cache: "no-store",
          }),
          apiFetch("/hr-admin/assets/expiring?days=30", {
            cache: "no-store",
          }),
          apiFetch("/hr-admin/collaborators", {
            cache: "no-store",
          }),
          apiFetch("/catalogs", {
            cache: "no-store",
          }),
        ]);

      if (!assetsRes.ok || !expiringRes.ok || !collaboratorsRes.ok || !catalogsRes.ok) {
        throw new Error("Falha ao carregar dados de EPIs e ferramentas.");
      }

      setItems((await assetsRes.json()) as HrAssetRow[]);
      setExpiring((await expiringRes.json()) as HrAssetRow[]);
      setCollaborators((await collaboratorsRes.json()) as Collaborator[]);
      setCatalogItems((await catalogsRes.json()) as CatalogItem[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar dados de EPIs.",
      );
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (selectedDossierUserId || items.length === 0) return;
    const firstActiveHolder = items.find(isInCustody)?.user || items[0]?.user;
    if (firstActiveHolder) {
      setSelectedDossierUserId(firstActiveHolder.id);
      setDossierSearch(firstActiveHolder.name);
    }
  }, [items, selectedDossierUserId]);

  const physicalCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.type !== "SERVICE"),
    [catalogItems],
  );

  const collaboratorOptions = useMemo(() => {
    const query = normalize(userSearch);
    if (!query) return [];
    return collaborators
      .filter((user) => normalize(user.name).includes(query))
      .slice(0, 8)
      .map((user) => ({ id: user.id, label: user.name }));
  }, [collaborators, userSearch]);

  const collaboratorFilterOptions = useMemo(() => {
    const query = normalize(collaboratorFilterSearch);
    if (!query) return [];
    return collaborators
      .filter((user) => normalize(user.name).includes(query))
      .slice(0, 8)
      .map((user) => ({ id: user.id, label: user.name }));
  }, [collaboratorFilterSearch, collaborators]);

  const dossierOptions = useMemo(() => {
    const query = normalize(dossierSearch);
    if (!query) return [];
    return collaborators
      .filter((user) => normalize(user.name).includes(query))
      .slice(0, 8)
      .map((user) => ({ id: user.id, label: user.name }));
  }, [collaborators, dossierSearch]);

  const catalogOptions = useMemo(() => {
    const query = normalize(catalogSearch);
    if (!query) return [];
    return physicalCatalogItems
      .filter((item) =>
        normalize(
          `${item.name} ${item.sku || ""} ${item.description || ""} ${item.category || ""}`,
        ).includes(query),
      )
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        label: item.name,
        description: [
          item.sku ? `SKU ${item.sku}` : null,
          item.stockCurrent != null ? `saldo ${item.stockCurrent}` : null,
          item.description || item.commercialDescription || null,
        ]
          .filter(Boolean)
          .join(" - "),
      }));
  }, [catalogSearch, physicalCatalogItems]);

  const selectedCatalogItem = useMemo(
    () => catalogItems.find((item) => item.id === catalogItemId),
    [catalogItemId, catalogItems],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!matchesSearch(item, search)) return false;
      if (typeFilter !== "ALL" && item.assetType !== typeFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (collaboratorFilter !== "ALL" && item.user.id !== collaboratorFilter) {
        return false;
      }
      return true;
    });
  }, [collaboratorFilter, items, search, statusFilter, typeFilter]);

  const activeItems = items.filter(isInCustody);
  const activeTools = activeItems.filter((item) => item.assetType === "TOOL");
  const activeEpis = activeItems.filter((item) => item.assetType === "EPI");
  const expiredItems = items.filter((item) => item.status === "EXPIRED");
  const expiringSoonCount = items.filter(isExpiringSoon).length;

  const selectedDossierItems = useMemo(() => {
    if (!selectedDossierUserId) return [];
    return items.filter((item) => item.user.id === selectedDossierUserId);
  }, [items, selectedDossierUserId]);

  const selectedDossierActiveItems = selectedDossierItems.filter(isInCustody);
  const selectedDossier = selectedDossierItems[0]?.user;
  const hasFilters =
    search.trim() ||
    typeFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    collaboratorFilter !== "ALL";

  function clearFilters() {
    setSearch("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setCollaboratorFilter("ALL");
    setCollaboratorFilterSearch("");
  }

  function handleCollaboratorFilterSearchChange(value: string) {
    setCollaboratorFilterSearch(value);
    if (
      collaboratorFilter !== "ALL" &&
      !collaborators.some(
        (user) => user.id === collaboratorFilter && user.name === value,
      )
    ) {
      setCollaboratorFilter("ALL");
    }
  }

  function handleUserSearchChange(value: string) {
    setUserSearch(value);
    if (userId && !collaborators.some((user) => user.id === userId && user.name === value)) {
      setUserId("");
    }
  }

  function handleCatalogSearchChange(value: string) {
    setCatalogSearch(value);
    if (
      catalogItemId &&
      !catalogItems.some((item) => item.id === catalogItemId && item.name === value)
    ) {
      setCatalogItemId("");
    }
  }

  function handleCatalogSelect(option: SearchOption) {
    const item = catalogItems.find((catalog) => catalog.id === option.id);
    if (!item) return;
    setCatalogItemId(item.id);
    setCatalogSearch(item.name);
    setTitle(getCatalogDescription(item));
    setCaCode(getCatalogControlCode(item, assetType));
  }

  function handleAssetTypeChange(type: AssetType) {
    setAssetType(type);
    if (selectedCatalogItem) {
      setCaCode(getCatalogControlCode(selectedCatalogItem, type));
    }
  }

  async function handleAssignAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !title.trim()) {
      setError("Informe colaborador e descricao do item.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await apiFetch("/hr-admin/assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          catalogItemId: catalogItemId || undefined,
          assetType,
          title: title.trim(),
          caCode: caCode || undefined,
          deliveredAt: new Date(deliveredAt).toISOString(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          signedTermUrl: signedTermUrl || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao registrar entrega."));
      }

      setUserId("");
      setUserSearch("");
      setCatalogItemId("");
      setCatalogSearch("");
      setAssetType("EPI");
      setTitle("");
      setCaCode("");
      setDeliveredAt(new Date().toISOString().slice(0, 10));
      setExpiresAt("");
      setSignedTermUrl("");
      setMessage("Entrega registrada com sucesso.");
      await loadAll();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao registrar entrega.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: AssetStatus) {
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(`/hr-admin/assets/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao atualizar status do item."),
        );
      }

      setMessage("Status do item atualizado.");
      await loadAll();
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Falha ao atualizar status.",
      );
    }
  }

  return (
    <div className="space-y-6 p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">
            Controle de EPIs e Ferramentas
          </h1>
          <p className="text-sm text-zinc-600">
            Ficha por tecnico, rastreio de posse, devolucao, vencimento e calibracao.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {showFilters ? "Fechar filtros" : "Abrir filtros"}
        </button>
      </header>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Itens em posse" value={activeItems.length} tone="blue" />
        <MetricCard label="EPIs ativos" value={activeEpis.length} tone="green" />
        <MetricCard label="Ferramentas" value={activeTools.length} />
        <MetricCard
          label="Prazos / vencidos"
          value={`${expiringSoonCount}/${expiredItems.length}`}
          tone="amber"
        />
      </section>

      {showFilters ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.3fr_0.75fr_0.75fr_1fr_auto] lg:items-end">
            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <span>Buscar item</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tecnico, item, CA, patrimonio, SKU ou departamento..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <SelectFilter
              label="Tipo"
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as AssetTypeFilter)}
            >
              <option value="ALL">Todos</option>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABEL[type]}
                </option>
              ))}
            </SelectFilter>
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as AssetStatusFilter)}
            >
              <option value="ALL">Todos</option>
              {ASSET_STATUS.map((status) => (
                <option key={status} value={status}>
                  {ASSET_STATUS_LABEL[status]}
                </option>
              ))}
            </SelectFilter>
            <SearchField
              label="Tecnico"
              value={collaboratorFilterSearch}
              onChange={handleCollaboratorFilterSearchChange}
              onSelect={(option) => {
                setCollaboratorFilter(option.id);
                setCollaboratorFilterSearch(option.label);
              }}
              options={collaboratorFilterOptions}
              placeholder="Buscar tecnico..."
              emptyLabel="Nenhum tecnico encontrado."
            />
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Limpar
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {filteredItems.length} resultado(s)
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Ficha do tecnico
              </p>
              <h2 className="mt-1 text-xl font-black text-zinc-900">
                {selectedDossier?.name || "Selecione um tecnico"}
              </h2>
              <p className="text-sm text-zinc-500">
                Itens sob responsabilidade e historico de devolucao.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <SearchField
                label="Buscar ficha"
                value={dossierSearch}
                onChange={(value) => {
                  setDossierSearch(value);
                  if (
                    selectedDossierUserId &&
                    !collaborators.some(
                      (user) =>
                        user.id === selectedDossierUserId && user.name === value,
                    )
                  ) {
                    setSelectedDossierUserId("");
                  }
                }}
                onSelect={(option) => {
                  setSelectedDossierUserId(option.id);
                  setDossierSearch(option.label);
                }}
                options={dossierOptions}
                placeholder="Digite o nome..."
                emptyLabel="Nenhum tecnico encontrado."
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <MetricCard label="Em posse" value={selectedDossierActiveItems.length} tone="blue" />
            <MetricCard
              label="EPIs"
              value={selectedDossierActiveItems.filter((item) => item.assetType === "EPI").length}
              tone="green"
            />
            <MetricCard
              label="Ferramentas"
              value={selectedDossierActiveItems.filter((item) => item.assetType === "TOOL").length}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Entrega</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedDossierItems.length === 0 ? (
                  <tr>
                    <td className="px-2 py-5 text-sm text-zinc-500" colSpan={4}>
                      Nenhum item encontrado para este tecnico.
                    </td>
                  </tr>
                ) : (
                  selectedDossierItems.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-100">
                      <td className="px-2 py-2">
                        <p className="font-semibold text-zinc-800">{item.title}</p>
                        <p className="text-xs text-zinc-500">
                          {item.caCode || item.catalogItem?.sku || "-"}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-zinc-700">
                        {ASSET_TYPE_LABEL[item.assetType]}
                      </td>
                      <td className="px-2 py-2 text-zinc-700">
                        {formatDate(item.deliveredAt)}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Rastreio de ferramentas
            </p>
            <h2 className="mt-1 text-xl font-black text-zinc-900">
              Quem esta com cada ferramenta
            </h2>
            <p className="text-sm text-zinc-500">
              Posse atual, saida registrada, devolucao e documento vinculado.
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Ferramenta</th>
                  <th className="px-2 py-2">Tecnico</th>
                  <th className="px-2 py-2">Saida</th>
                  <th className="px-2 py-2">Controle</th>
                </tr>
              </thead>
              <tbody>
                {activeTools.length === 0 ? (
                  <tr>
                    <td className="px-2 py-5 text-sm text-zinc-500" colSpan={4}>
                      Nenhuma ferramenta em posse no momento.
                    </td>
                  </tr>
                ) : (
                  activeTools.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-100">
                      <td className="px-2 py-2">
                        <p className="font-semibold text-zinc-800">{item.title}</p>
                        <p className="text-xs text-zinc-500">
                          {item.caCode || item.catalogItem?.sku || "Sem patrimonio"}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-semibold text-zinc-800">{item.user.name}</p>
                        <p className="text-xs text-zinc-500">
                          {item.user.department || "-"}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-zinc-700">
                        {formatDate(item.deliveredAt)}
                      </td>
                      <td className="px-2 py-2 text-zinc-700">
                        {item.signedTermUrl ? (
                          <a
                            href={item.signedTermUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-blue-700 underline"
                          >
                            Termo
                          </a>
                        ) : (
                          "Sem termo"
                        )}
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(item.id, "RETURNED")}
                          className="ml-3 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Devolver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Registrar saida</h2>
            <p className="text-sm text-zinc-500">
              Vincule EPI ou ferramenta ao tecnico responsavel.
            </p>
          </div>
        </div>
        <form
          onSubmit={(event) => void handleAssignAsset(event)}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-7"
        >
          <SearchField
            label="Tecnico"
            value={userSearch}
            onChange={handleUserSearchChange}
            onSelect={(option) => {
              setUserId(option.id);
              setUserSearch(option.label);
            }}
            options={collaboratorOptions}
            placeholder="Buscar tecnico..."
            emptyLabel="Nenhum tecnico encontrado."
          />
          <SearchField
            label="Item de estoque"
            value={catalogSearch}
            onChange={handleCatalogSearchChange}
            onSelect={handleCatalogSelect}
            options={catalogOptions}
            placeholder="Buscar item, SKU ou descricao..."
            emptyLabel="Nenhum item encontrado."
          />
          <select
            value={assetType}
            onChange={(event) => handleAssetTypeChange(event.target.value as AssetType)}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
          >
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {ASSET_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Descricao do item"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm md:col-span-2"
            required
          />
          <input
            value={caCode}
            onChange={(event) => setCaCode(event.target.value)}
            placeholder={assetType === "EPI" ? "Codigo CA" : "Patrimonio / serie"}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
          />
          <input
            type="date"
            value={deliveredAt}
            onChange={(event) => setDeliveredAt(event.target.value)}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
            required
          />
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <span>
              {assetType === "EPI" ? "Validade do EPI" : "Proxima calibracao"}
            </span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm normal-case tracking-normal text-zinc-800"
            />
          </label>
          <input
            value={signedTermUrl}
            onChange={(event) => setSignedTermUrl(event.target.value)}
            placeholder="URL do termo assinado"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm md:col-span-2"
          />
          {selectedCatalogItem ? (
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 md:col-span-3">
              A saida baixa 1 unidade do estoque. Ao devolver, 1 unidade volta ao almoxarifado principal.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-lg border border-blue-200 bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Registrar saida"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Historico geral</h2>
            <p className="text-sm text-zinc-500">
              Entregas, devolucoes, perdas, vencimentos e calibracoes.
            </p>
          </div>
          {expiring.length > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              {expiring.length} alerta(s) em 30 dias
            </span>
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Tecnico</th>
                <th className="px-2 py-2">Tipo / Item</th>
                <th className="px-2 py-2">CA / Patrimonio</th>
                <th className="px-2 py-2">Entrega</th>
                <th className="px-2 py-2">Validade / calibracao</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Termo</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td className="px-2 py-5 text-sm text-zinc-500" colSpan={7}>
                    Nenhum item encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-zinc-800">{item.user.name}</p>
                      <p className="text-xs text-zinc-500">{item.user.department || "-"}</p>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">
                      <p>{ASSET_TYPE_LABEL[item.assetType]}</p>
                      <p className="font-semibold text-zinc-800">{item.title}</p>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">
                      <p>{item.caCode || "-"}</p>
                      <p className="text-xs text-zinc-500">
                        {item.catalogItem
                          ? `${item.catalogItem.name}${item.catalogItem.sku ? ` (${item.catalogItem.sku})` : ""}`
                          : "-"}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">{formatDate(item.deliveredAt)}</td>
                    <td className="px-2 py-2 text-zinc-700">{formatDate(item.expiresAt)}</td>
                    <td className="px-2 py-2">
                      <select
                        value={item.status}
                        disabled={item.status === "RETURNED"}
                        onChange={(event) =>
                          void handleStatusChange(
                            item.id,
                            event.target.value as AssetStatus,
                          )
                        }
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        {(item.status === "RETURNED" ? ["RETURNED"] : ASSET_STATUS).map((status) => (
                          <option key={status} value={status}>
                            {ASSET_STATUS_LABEL[status as AssetStatus]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">
                      {item.signedTermUrl ? (
                        <a
                          href={item.signedTermUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-blue-700 underline"
                        >
                          Abrir
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
