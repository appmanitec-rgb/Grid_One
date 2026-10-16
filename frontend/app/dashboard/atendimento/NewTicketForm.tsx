"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  ticketsGet,
  ticketsPost,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type ServiceTicket,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/tickets";
import {
  TICKET_ORIGIN_LABELS,
  type TicketAssignee,
} from "@/lib/ticket-workspace";
import { SectionCard } from "../components/DashboardPageKit";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./TicketShared";
import styles from "./TicketWorkspace.module.css";

type ClientOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
};
type GeneratorOption = {
  id: string;
  name: string;
  serialNumber?: string | null;
  clientId: string;
};
const initialForm = {
  clientId: "",
  generatorId: "",
  title: "",
  description: "",
  category: "CORRECTIVE_MAINTENANCE" as TicketCategory,
  priority: "MEDIUM" as TicketPriority,
  origin: "PHONE",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  assignedToUserId: "",
};
export default function NewTicketForm({
  initialClientId,
  initialGeneratorId = "",
  assignees,
  canAssign,
  onCreated,
  onClose,
}: {
  initialClientId: string;
  initialGeneratorId?: string;
  assignees: TicketAssignee[];
  canAssign: boolean;
  onCreated: (ticket: ServiceTicket) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    ...initialForm,
    clientId: initialClientId,
    generatorId: initialGeneratorId,
  });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setGenerators([]);
    setError("");
    void ticketsGet<{ clients: ClientOption[]; generators: GeneratorOption[] }>(
      "/create-options" +
        (form.clientId ? "?clientId=" + encodeURIComponent(form.clientId) : ""),
      { signal: controller.signal },
    )
      .then((data) => {
        setClients(data.clients);
        setGenerators(data.generators);
        const selected = data.clients.find(
          (client) => client.id === form.clientId,
        );
        if (selected)
          setForm((current) => ({
            ...current,
            contactName: current.contactName || selected.contactName || "",
            contactPhone: current.contactPhone || selected.phone || "",
            contactEmail: current.contactEmail || selected.email || "",
          }));
        if (!focused.current)
          requestAnimationFrame(() => {
            focused.current = true;
            document
              .getElementById("novo-chamado")
              ?.scrollIntoView({ block: "start" });
            document
              .getElementById("ticket-client")
              ?.focus({ preventScroll: true });
          });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar as opções.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [form.clientId, reload]);
  function change<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  }
  function chooseClient(id: string) {
    const client = clients.find((item) => item.id === id);
    setDirty(true);
    setForm((current) => ({
      ...current,
      clientId: id,
      generatorId: "",
      contactName: client?.contactName || "",
      contactPhone: client?.phone || "",
      contactEmail: client?.email || "",
    }));
  }
  function close() {
    if (
      !saving &&
      (!dirty || window.confirm("Descartar os dados deste novo chamado?"))
    )
      onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    if (!form.clientId || !form.title.trim() || !form.description.trim()) {
      setError("Selecione o cliente e informe o título e a descrição.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await ticketsPost<ServiceTicket>("", {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        generatorId: form.generatorId || undefined,
        assignedToUserId:
          canAssign && form.assignedToUserId
            ? form.assignedToUserId
            : undefined,
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o chamado.",
      );
      setSaving(false);
    }
  }
  return (
    <SectionCard
      eyebrow="Novo atendimento"
      title="Abrir chamado interno"
      description="Registre o pedido, identifique o equipamento e acompanhe o atendimento por aqui."
      actions={
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={close}
          disabled={saving}
        >
          Cancelar
        </button>
      }
    >
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
          <button
            type="button"
            className="ml-3 font-bold underline"
            onClick={() => setReload((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-5"
        aria-label="Novo chamado"
      >
        <fieldset
          disabled={saving}
          className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <label className={styles.field}>
            Cliente
            <SelectField searchable
              id="ticket-client"
              value={form.clientId}
              onChange={(event) => chooseClient(event.target.value)}
              required
              disabled={loading}
            >
              <option value="">
                {loading ? "Carregando clientes..." : "Selecione o cliente"}
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.tradeName || client.companyName}
                </option>
              ))}
            </SelectField>
          </label>
          <label className={styles.field}>
            Equipamento
            <SelectField searchable
              value={form.generatorId}
              onChange={(event) => change("generatorId", event.target.value)}
              disabled={loading || !form.clientId}
            >
              <option value="">Não vincular agora</option>
              {generators.map((generator) => (
                <option key={generator.id} value={generator.id}>
                  {generator.name}
                  {generator.serialNumber ? " · " + generator.serialNumber : ""}
                </option>
              ))}
            </SelectField>
          </label>
          <label className={styles.field}>
            Origem do pedido
            <SelectField
              value={form.origin}
              onChange={(event) => change("origin", event.target.value)}
            >
              {Object.entries(TICKET_ORIGIN_LABELS)
                .filter(([key]) => key !== "CUSTOMER_PORTAL")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </SelectField>
          </label>
          <label className={styles.field}>
            Tipo de solicitação
            <SelectField
              value={form.category}
              onChange={(event) => {
                const value = event.target.value as TicketCategory;
                setDirty(true);
                setForm((current) => ({
                  ...current,
                  category: value,
                  priority:
                    value === "EMERGENCY" ? "CRITICAL" : current.priority,
                }));
              }}
            >
              {Object.entries(TICKET_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
          <label className={styles.field}>
            Prioridade
            <SelectField
              value={form.priority}
              onChange={(event) =>
                change("priority", event.target.value as TicketPriority)
              }
            >
              {Object.entries(TICKET_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
          {canAssign ? (
            <label className={styles.field}>
              Responsável
              <SelectField searchable
                value={form.assignedToUserId}
                onChange={(event) =>
                  change("assignedToUserId", event.target.value)
                }
              >
                <option value="">Definir na triagem</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectField>
            </label>
          ) : null}
          <label className={styles.field + " md:col-span-2 xl:col-span-3"}>
            Título
            <input
              value={form.title}
              onChange={(event) => change("title", event.target.value)}
              placeholder="Ex.: gerador não entra em operação automática"
              required
              maxLength={200}
            />
          </label>
          <label className={styles.field + " md:col-span-2 xl:col-span-3"}>
            Descrição
            <textarea
              value={form.description}
              onChange={(event) => change("description", event.target.value)}
              rows={4}
              placeholder="Descreva o ocorrido, quando começou e o que já foi verificado."
              required
              maxLength={10000}
            />
          </label>
          <label className={styles.field}>
            Contato
            <input
              value={form.contactName}
              onChange={(event) => change("contactName", event.target.value)}
              maxLength={140}
            />
          </label>
          <label className={styles.field}>
            Telefone
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(event) => change("contactPhone", event.target.value)}
              maxLength={40}
            />
          </label>
          <label className={styles.field}>
            E-mail do contato
            <input
              type="email"
              value={form.contactEmail}
              onChange={(event) => change("contactEmail", event.target.value)}
              maxLength={254}
            />
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Os prazos são calculados conforme a prioridade e o contrato
            vinculado.
          </p>
          <button
            className={PRIMARY_BUTTON}
            type="submit"
            disabled={saving || loading}
          >
            {saving ? "Criando chamado..." : "Criar chamado"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
