"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

const API_URL = apiUrl("");

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
};

function authHeaders(json = false) {
  const token = localStorage.getItem("manitec_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

export default function EpisToolsPage() {
  const [items, setItems] = useState<HrAssetRow[]>([]);
  const [expiring, setExpiring] = useState<HrAssetRow[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
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
          apiFetch(`${API_URL}/hr-admin/assets`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          apiFetch(`${API_URL}/hr-admin/assets/expiring?days=30`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          apiFetch(`${API_URL}/hr-admin/collaborators`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          apiFetch(`${API_URL}/catalogs`, {
            headers: authHeaders(),
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
      const res = await apiFetch(`${API_URL}/hr-admin/assets`, {
        method: "POST",
        headers: authHeaders(true),
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
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message || "Falha ao registrar entrega.");
      }

      setUserId("");
      setCatalogItemId("");
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
      const res = await apiFetch(`${API_URL}/hr-admin/assets/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message || "Falha ao atualizar status do item.");
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
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-zinc-900">
          Controle de EPIs e Ferramentas
        </h1>
        <p className="text-sm text-zinc-600">
          Entrega rastreada por colaborador, validade e responsabilidade com trilha operacional.
        </p>
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

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-lg font-bold text-amber-900">Alertas de vencimento (30 dias)</h2>
        {expiring.length === 0 ? (
          <p className="mt-2 text-sm text-amber-800">Nenhum item com vencimento proximo.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {expiring.map((item) => (
              <span
                key={item.id}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800"
              >
                {item.user.name}: {item.title} ({formatDate(item.expiresAt)})
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-bold text-zinc-900">Registrar entrega</h2>
        <form
          onSubmit={(event) => void handleAssignAsset(event)}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-7"
        >
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            required
          >
            <option value="">Colaborador</option>
            {collaborators.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <select
            value={catalogItemId}
            onChange={(event) => setCatalogItemId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Item de estoque (opcional)</option>
            {catalogItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.sku ? ` (${item.sku})` : ""}
              </option>
            ))}
          </select>
          <select
            value={assetType}
            onChange={(event) => setAssetType(event.target.value as AssetType)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
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
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
            required
          />
          <input
            value={caCode}
            onChange={(event) => setCaCode(event.target.value)}
            placeholder="Codigo CA"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={deliveredAt}
            onChange={(event) => setDeliveredAt(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            required
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={signedTermUrl}
            onChange={(event) => setSignedTermUrl(event.target.value)}
            placeholder="URL do termo assinado"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Registrar entrega"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Colaborador</th>
                <th className="px-2 py-2">Tipo / Item</th>
                <th className="px-2 py-2">CA / Estoque</th>
                <th className="px-2 py-2">Entrega</th>
                <th className="px-2 py-2">Validade</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Termo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
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
                    <p>CA: {item.caCode || "-"}</p>
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
                      onChange={(event) =>
                        void handleStatusChange(
                          item.id,
                          event.target.value as AssetStatus,
                        )
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    >
                      {ASSET_STATUS.map((status) => (
                        <option key={status} value={status}>
                          {ASSET_STATUS_LABEL[status]}
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
                        className="text-blue-700 underline"
                      >
                        Abrir
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
