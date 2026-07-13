"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  customerPortalGet,
  customerPortalPost,
  formatPortalDate,
  PortalEquipment,
  PortalQuoteRequest,
  statusLabel,
} from "@/lib/customer-portal";

const INITIAL_FORM = {
  equipmentId: "",
  serviceType: "",
  description: "",
  urgency: "NORMAL",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

export default function PortalRequestsPage() {
  const [requests, setRequests] = useState<PortalQuoteRequest[]>([]);
  const [equipment, setEquipment] = useState<PortalEquipment[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [requestPayload, equipmentPayload] = await Promise.all([
        customerPortalGet<PortalQuoteRequest[]>("/quote-requests"),
        customerPortalGet<PortalEquipment[]>("/equipment"),
      ]);
      setRequests(requestPayload);
      setEquipment(equipmentPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar solicitações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await customerPortalPost("/quote-requests", {
        ...form,
        equipmentId: form.equipmentId || undefined,
      });
      setSuccess("Solicitação enviada para o time comercial.");
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-950">Solicitar cotação</h1>
        <p className="mt-1 text-sm text-slate-500">
          Abra uma solicitação para atendimento comercial ou técnico.
        </p>

        {error ? <State text={error} tone="error" /> : null}
        {success ? <State text={success} tone="success" /> : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label="Equipamento">
            <select
              value={form.equipmentId}
              onChange={(event) => setForm((current) => ({ ...current, equipmentId: event.target.value }))}
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Não vincular equipamento</option>
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.serialNumber ? `- ${item.serialNumber}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de serviço">
            <input
              value={form.serviceType}
              onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value }))}
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Preventiva, corretiva, peça, contrato..."
              required
            />
          </Field>

          <Field label="Urgência">
            <select
              value={form.urgency}
              onChange={(event) => setForm((current) => ({ ...current, urgency: event.target.value }))}
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="EMERGENCY">Emergencial</option>
            </select>
          </Field>

          <Field label="Descrição">
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-28 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Descreva a necessidade com detalhes."
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Contato">
              <input
                value={form.contactName}
                onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              />
            </Field>
            <Field label="Telefone">
              <input
                value={form.contactPhone}
                onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            <Field label="E-mail">
              <input
                value={form.contactEmail}
                onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Enviar solicitação"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-extrabold text-slate-950">Solicitações abertas</h2>
        <div className="mt-4 space-y-3">
          {loading ? <State text="Carregando solicitações..." /> : null}
          {!loading && !requests.length ? <State text="Nenhuma solicitação aberta pelo portal." /> : null}
          {requests.map((request) => (
            <article key={request.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900">{request.title}</h3>
                  <p className="text-sm text-slate-500">{formatPortalDate(request.createdAt)}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">
                  {statusLabel(request.stage)}
                </span>
              </div>
              {request.notes ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{request.notes}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return <div className={`mt-3 rounded-md border p-3 text-sm font-semibold ${classes}`}>{text}</div>;
}
