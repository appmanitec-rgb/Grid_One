"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";
import {
  MaintenanceOrderOption,
  REPORT_STATUS_LABELS,
  ReportStatus,
  ServiceReport,
  formatServiceReportDate,
  reportStatusTone,
  serviceReportsGet,
  serviceReportsPost,
} from "@/lib/service-reports";
import {
  DataPill,
  FormField,
  PageHero,
  SectionCard,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";
import ListPagination, {
  useListPagination,
} from "../components/ListPagination";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_OPTIONS: Array<"ALL" | ReportStatus> = [
  "ALL",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "RELEASED_TO_CUSTOMER",
  "CANCELED",
];

const INITIAL_FORM = {
  maintenanceOrderId: "",
  title: "",
  diagnosis: "",
  performedServices: "",
  recommendations: "",
  observations: "",
};

export default function ServiceReportsPage() {
  const router = useRouter();
  const access = useMemo(() => getAccessFromToken(), []);
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [orders, setOrders] = useState<MaintenanceOrderOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>("ALL");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportRows, orderRows] = await Promise.all([
        serviceReportsGet<ServiceReport[]>(),
        fetchJson<MaintenanceOrderOption[]>("/maintenance-orders"),
      ]);
      setReports(reportRows);
      setOrders(orderRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar laudos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== "ALL" && report.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        report.code,
        report.title,
        report.client?.tradeName,
        report.client?.companyName,
        report.generator?.name,
        report.maintenanceOrder?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, reports, statusFilter]);
  const { paginatedItems: paginatedReports, paginationProps } =
    useListPagination(filteredReports, `${query}|${statusFilter}`);

  const stats = useMemo(() => {
    const released = reports.filter(
      (report) => report.status === "RELEASED_TO_CUSTOMER",
    ).length;
    const pending = reports.filter((report) =>
      ["DRAFT", "IN_REVIEW"].includes(report.status),
    ).length;
    const approved = reports.filter((report) => report.status === "APPROVED").length;
    return { released, pending, approved };
  }, [reports]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.maintenanceOrderId) {
      setError("Selecione a OS que recebera o laudo.");
      return;
    }
    if (!form.diagnosis.trim() || !form.performedServices.trim()) {
      setError("Diagnostico e servico realizado sao obrigatorios.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const report = await serviceReportsPost<ServiceReport>("", {
        ...form,
        title: form.title.trim() || undefined,
        recommendations: form.recommendations.trim() || undefined,
        observations: form.observations.trim() || undefined,
      });
      setSuccess(`Laudo ${report.code} criado.`);
      setForm(INITIAL_FORM);
      router.push(`/dashboard/relatorios-tecnicos/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar laudo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Operacao tecnica"
        title="Laudos tecnicos"
        description="Checklist, diagnostico, evidencias, assinatura e liberacao controlada para o Portal do Cliente."
        stats={[
          { label: "Total", value: String(reports.length), tone: "slate" },
          { label: "Pendentes", value: String(stats.pending), tone: "amber" },
          { label: "Aprovados", value: String(stats.approved), tone: "blue" },
          { label: "No portal", value: String(stats.released), tone: "emerald" },
        ]}
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      {access.serviceReports.create ? (
        <SectionCard
          title="Novo laudo"
          description="O cliente, equipamento, contrato e tecnico sao herdados da OS selecionada."
        >
          <form onSubmit={createReport} className="grid gap-4 lg:grid-cols-2">
            <FormField label="OS">
              <select
                value={form.maintenanceOrderId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maintenanceOrderId: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              >
                <option value="">Selecione uma OS</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.title} - {order.generator?.name || "sem equipamento"}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Titulo">
              <TextInput
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Laudo tecnico de atendimento"
              />
            </FormField>
            <FormField label="Diagnostico" className="lg:col-span-2">
              <TextAreaInput
                value={form.diagnosis}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    diagnosis: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Diagnostico tecnico observado em campo"
              />
            </FormField>
            <FormField label="Servico realizado" className="lg:col-span-2">
              <TextAreaInput
                value={form.performedServices}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    performedServices: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Atividades executadas, testes e validacoes"
              />
            </FormField>
            <FormField label="Recomendacoes">
              <TextAreaInput
                value={form.recommendations}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recommendations: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Proximas acoes recomendadas"
              />
            </FormField>
            <FormField label="Observacoes">
              <TextAreaInput
                value={form.observations}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    observations: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Observacoes para historico tecnico"
              />
            </FormField>
            <div className="lg:col-span-2">
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={submitting}
              >
                {submitting ? "Criando..." : "Criar laudo"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Fila de laudos"
        description="Somente laudos aprovados e liberados aparecem para o cliente."
        actions={
          <button type="button" onClick={() => void load()} className={SECONDARY_BUTTON}>
            Atualizar
          </button>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, OS, equipamento ou codigo"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "ALL" | ReportStatus)
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? "Todos os status" : REPORT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {loading ? <EmptyState text="Carregando laudos..." /> : null}
        {!loading && filteredReports.length === 0 ? (
          <EmptyState text="Nenhum laudo encontrado." />
        ) : null}

        {!loading && filteredReports.length > 0 ? (
          <div className="mb-4">
            <ListPagination {...paginationProps} />
          </div>
        ) : null}

        <div className="grid gap-3">
          {paginatedReports.map((report) => (
            <Link
              key={report.id}
              href={`/dashboard/relatorios-tecnicos/${report.id}`}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 md:grid-cols-[1.2fr_1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-slate-950">{report.code}</strong>
                  <DataPill tone={reportStatusTone(report.status)}>
                    {REPORT_STATUS_LABELS[report.status]}
                  </DataPill>
                  {report.customerVisible ? (
                    <DataPill tone="emerald">Visivel no portal</DataPill>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {report.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {report.maintenanceOrder?.title || "OS nao informada"}
                </p>
              </div>
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-800">
                  {report.client?.tradeName || report.client?.companyName || "Cliente"}
                </p>
                <p>{report.generator?.name || "Equipamento nao informado"}</p>
                <p>{report.technician?.user?.name || "Tecnico nao atribuido"}</p>
              </div>
              <div className="text-right text-sm font-semibold text-slate-600">
                {formatServiceReportDate(report.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

async function fetchJson<T>(path: string) {
  const response = await apiFetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "Falha ao carregar dados."));
  }
  return (await response.json()) as T;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600">
      {text}
    </div>
  );
}
