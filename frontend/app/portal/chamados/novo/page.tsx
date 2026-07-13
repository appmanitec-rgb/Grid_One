"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { customerPortalGet, PortalEquipment } from "@/lib/customer-portal";
import {
  TicketCategory,
  TicketPriority,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  portalTicketsPost,
} from "@/lib/tickets";

const INITIAL_FORM = {
  generatorId: "",
  title: "",
  description: "",
  category: "CORRECTIVE_MAINTENANCE" as TicketCategory,
  priority: "MEDIUM" as TicketPriority,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

const CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[];
const PRIORITIES = Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[];

export default function NewPortalTicketPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState<PortalEquipment[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const rows = await customerPortalGet<PortalEquipment[]>("/equipment");
        if (mounted) setEquipment(rows);
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar equipamentos.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await portalTicketsPost<{ id: string }>("/", {
        ...form,
        generatorId: form.generatorId || undefined,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
      });
      router.push(`/portal/chamados/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir chamado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-extrabold text-slate-950">Novo chamado</h1>
      <p className="mt-1 text-sm text-slate-500">
        Informe o problema ou solicitação. A equipe interna classificará e dará
        andamento.
      </p>

      {error ? <State text={error} tone="error" /> : null}
      {loading ? <State text="Carregando equipamentos..." /> : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="Equipamento">
          <select
            value={form.generatorId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                generatorId: event.target.value,
              }))
            }
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria">
            <select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as TicketCategory,
                }))
              }
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {TICKET_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as TicketPriority,
                }))
              }
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Título">
          <input
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            required
          />
        </Field>

        <Field label="Descrição">
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            className="min-h-32 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Contato">
            <input
              value={form.contactName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  contactName: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>
          <Field label="Telefone">
            <input
              value={form.contactPhone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>
          <Field label="E-mail">
            <input
              value={form.contactEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  contactEmail: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {submitting ? "Abrindo..." : "Abrir chamado"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`mt-3 rounded-md border p-3 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}
