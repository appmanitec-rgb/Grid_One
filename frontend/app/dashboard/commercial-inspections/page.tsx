"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

const API_URL = apiUrl("");

const STATUS_OPTIONS = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;

type InspectionStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_LABEL: Record<InspectionStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluida",
  CANCELED: "Cancelada",
};

type OpportunityOption = {
  id: string;
  title: string;
  stage: string;
  client: { companyName: string };
};

type Collaborator = {
  id: string;
  name: string;
};

type Inspection = {
  id: string;
  code: string;
  status: InspectionStatus;
  scheduledAt?: string | null;
  requiredPowerKva?: number | null;
  voltage?: string | null;
  qtaDistanceMeters?: number | null;
  needsMunck: boolean;
  accessNotes?: string | null;
  technicalNotes?: string | null;
  opportunity: { id: string; title: string; stage: string };
  client: { id: string; companyName: string };
  inspectorUser?: { id: string; name: string } | null;
  media: Array<{ id: string; fileUrl: string }>;
};

function authHeaders(json = false) {
  const token = localStorage.getItem("manitec_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export default function CommercialInspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [mediaInputById, setMediaInputById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [opportunityId, setOpportunityId] = useState("");
  const [inspectorUserId, setInspectorUserId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [requiredPowerKva, setRequiredPowerKva] = useState("");
  const [voltage, setVoltage] = useState("");
  const [qtaDistanceMeters, setQtaDistanceMeters] = useState("");
  const [needsMunck, setNeedsMunck] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");

  async function loadAll() {
    setError("");
    setMessage("");

    try {
      const [inspectionsRes, opportunitiesRes, collaboratorsRes] =
        await Promise.all([
          apiFetch(`${API_URL}/crm/inspections`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          apiFetch(`${API_URL}/crm/opportunities`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          apiFetch(`${API_URL}/hr-admin/collaborators`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
        ]);

      if (!inspectionsRes.ok || !opportunitiesRes.ok || !collaboratorsRes.ok) {
        throw new Error("Falha ao carregar vistorias comerciais.");
      }

      setInspections((await inspectionsRes.json()) as Inspection[]);
      setOpportunities((await opportunitiesRes.json()) as OpportunityOption[]);
      setCollaborators((await collaboratorsRes.json()) as Collaborator[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar vistorias.",
      );
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleCreateInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opportunityId) {
      setError("Selecione uma oportunidade para criar a vistoria.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await apiFetch(`${API_URL}/crm/inspections`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          opportunityId,
          inspectorUserId: inspectorUserId || undefined,
          scheduledAt: toIso(scheduledAt),
          requiredPowerKva: requiredPowerKva ? Number(requiredPowerKva) : undefined,
          voltage: voltage || undefined,
          qtaDistanceMeters: qtaDistanceMeters
            ? Number(qtaDistanceMeters)
            : undefined,
          needsMunck,
          accessNotes: accessNotes || undefined,
          technicalNotes: technicalNotes || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message || "Falha ao criar vistoria.");
      }

      setOpportunityId("");
      setInspectorUserId("");
      setScheduledAt("");
      setRequiredPowerKva("");
      setVoltage("");
      setQtaDistanceMeters("");
      setNeedsMunck(false);
      setAccessNotes("");
      setTechnicalNotes("");
      setMessage("Vistoria comercial criada com sucesso.");
      await loadAll();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao criar vistoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: InspectionStatus) {
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(`${API_URL}/crm/inspections/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message || "Falha ao atualizar status.");
      }

      setMessage("Status da vistoria atualizado.");
      await loadAll();
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Falha ao atualizar status.",
      );
    }
  }

  async function handleAddMedia(inspectionId: string) {
    const fileUrl = mediaInputById[inspectionId]?.trim();
    if (!fileUrl) return;

    setError("");
    setMessage("");

    try {
      const res = await apiFetch(`${API_URL}/crm/inspections/${inspectionId}/media`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ fileUrl }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message || "Falha ao anexar midia.");
      }

      setMediaInputById((prev) => ({ ...prev, [inspectionId]: "" }));
      setMessage("Midia anexada na vistoria.");
      await loadAll();
    } catch (mediaError: unknown) {
      setError(
        mediaError instanceof Error ? mediaError.message : "Falha ao anexar midia.",
      );
    }
  }

  return (
    <div className="space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-zinc-900">Vistorias Comerciais</h1>
        <p className="text-sm text-zinc-600">
          Fluxo tecnico vinculado a oportunidade, cliente e local para orcamento
          sem erro de escopo.
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

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-bold text-zinc-900">Nova vistoria</h2>
        <form
          onSubmit={(event) => void handleCreateInspection(event)}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6"
        >
          <select
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
            required
          >
            <option value="">Oportunidade</option>
            {opportunities.map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.title} - {opportunity.client.companyName}
              </option>
            ))}
          </select>
          <select
            value={inspectorUserId}
            onChange={(event) => setInspectorUserId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Responsavel pela vistoria</option>
            {collaborators.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Potencia kVA"
            value={requiredPowerKva}
            onChange={(event) => setRequiredPowerKva(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Tensao"
            value={voltage}
            onChange={(event) => setVoltage(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Distancia QTA (m)"
            value={qtaDistanceMeters}
            onChange={(event) => setQtaDistanceMeters(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Observacoes de acesso"
            value={accessNotes}
            onChange={(event) => setAccessNotes(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Notas tecnicas"
            value={technicalNotes}
            onChange={(event) => setTechnicalNotes(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
          />
          <label className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={needsMunck}
              onChange={(event) => setNeedsMunck(event.target.checked)}
            />
            Necessita munck/icamento
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Criar vistoria"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Codigo</th>
                <th className="px-2 py-2">Oportunidade / Cliente</th>
                <th className="px-2 py-2">Agendamento</th>
                <th className="px-2 py-2">Checklist tecnico</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Midia</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-zinc-100 align-top">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{inspection.code}</td>
                  <td className="px-2 py-2 text-zinc-700">
                    <p className="font-semibold text-zinc-800">{inspection.opportunity.title}</p>
                    <p className="text-xs text-zinc-600">{inspection.client.companyName}</p>
                    <p className="text-xs text-zinc-500">
                      Inspetor: {inspection.inspectorUser?.name || "Nao definido"}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-zinc-700">
                    {inspection.scheduledAt
                      ? new Date(inspection.scheduledAt).toLocaleString("pt-BR")
                      : "-"}
                  </td>
                  <td className="px-2 py-2 text-zinc-700">
                    <p>kVA: {inspection.requiredPowerKva ?? "-"}</p>
                    <p>Tensao: {inspection.voltage || "-"}</p>
                    <p>QTA: {inspection.qtaDistanceMeters ?? "-"} m</p>
                    <p>Munck: {inspection.needsMunck ? "Sim" : "Nao"}</p>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={inspection.status}
                      onChange={(event) =>
                        void handleStatusChange(
                          inspection.id,
                          event.target.value as InspectionStatus,
                        )
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <p className="text-xs text-zinc-600">
                      {inspection.media.length} anexos
                    </p>
                    <div className="mt-1 flex gap-1">
                      <input
                        value={mediaInputById[inspection.id] || ""}
                        onChange={(event) =>
                          setMediaInputById((prev) => ({
                            ...prev,
                            [inspection.id]: event.target.value,
                          }))
                        }
                        placeholder="URL da foto/arquivo"
                        className="w-44 rounded border border-zinc-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddMedia(inspection.id)}
                        className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      >
                        Anexar
                      </button>
                    </div>
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
