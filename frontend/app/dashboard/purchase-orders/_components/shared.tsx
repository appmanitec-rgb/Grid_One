"use client";
import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";
import { getAccessFromToken, canAccessDashboardPath } from "@/lib/access";
import { canScreenAction } from "@/lib/access-rules";
import { SearchLookup } from "../../components/SelectField";
import {
  DataPill,
  InlineMessage,
  SectionCard,
} from "../../components/DashboardPageKit";
import type { Attachment, Choice, Event } from "./types";

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-60";
export const buttonClass =
  "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const origins: Record<string, string> = {
  STOCK: "Reposição de estoque",
  ORDER: "Ordem de Serviço",
  CONTRACT: "Contrato de manutenção",
  PARTS_SALE: "Venda de peças",
  GENERATOR_SALE: "Venda de geradores",
  WARRANTY: "Garantia",
  INTERNAL: "Uso interno / patrimônio",
  OTHER: "Outra necessidade",
};
export const statuses: Record<string, string> = {
  DRAFT: "Rascunho",
  REVISION: "Em revisão",
  AWAITING_ANALYSIS: "Aguardando análise",
  ANALYZED: "Analisada",
  IN_QUOTATION: "Em cotação",
  PARTIALLY_FULFILLED: "Parcialmente atendida",
  FULFILLED: "Atendida",
  CANCELED: "Cancelada",
  PREPARATION: "Preparação",
  CONSULTING: "Consultando fornecedores",
  OFFERS_RECEIVED: "Propostas recebidas",
  AWAITING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Reprovada",
  ORDERED: "Pedidos gerados",
  PARTIALLY_RECEIVED: "Parcialmente recebido",
  RECEIVED: "Recebido",
  PENDING: "Pendente",
  ADJUSTMENTS_REQUESTED: "Revisão solicitada",
  OPEN: "Em aberto",
  PARTIALLY_RECOGNIZED: "Parcialmente reconhecido",
  RECOGNIZED: "Reconhecido",
  VALIDATED: "Validado",
  PAID: "Pago",
  OVERDUE: "Vencido",
  PARTIAL: "Parcialmente pago",
};
export const modes: Record<string, string> = {
  WAREHOUSE: "Entrada no almoxarifado",
  DIRECT: "Entrega direta ao cliente",
  SERVICE: "Aceite de serviço",
  ASSET: "Destinação ao patrimônio",
};
export const money = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
export const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "Não informado";
export function allowed(screen: string, action: string = "view") {
  const access = getAccessFromToken();
  if (action === "view")
    return canAccessDashboardPath(
      "/dashboard/purchase-orders/" +
        ({
          purchaseRequests: "requests",
          purchaseQuotations: "quotations",
          purchasingApprovals: "approvals",
          purchasingSettings: "settings",
        }[screen] ?? ""),
      access.pages,
    );
  const token = getStoredAccessToken(),
    payload = token ? decodeJwtPayload(token) : null;
  if (payload?.role === "ADMIN" || payload?.isSystemMaster) return true;
  const policy = payload?.accessPolicy as
    | { purchaseOrders?: Record<string, boolean> }
    | undefined;
  return (
    Boolean(policy?.purchaseOrders?.[action]) && canScreenAction(screen, action)
  );
}
export async function request<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    signal,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok) {
    let message = "Não foi possível concluir a operação.";
    try {
      const data = await response.json();
      message = Array.isArray(data.message)
        ? data.message.join(" ")
        : data.message || message;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generated = useId();
  const element = isValidElement<{ id?: string; "aria-describedby"?: string }>(
    children,
  )
    ? children
    : null;
  const id = element?.props.id ?? generated;
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      {element
        ? cloneElement(element, {
            id,
            "aria-describedby": hint
              ? id + "-hint"
              : element.props["aria-describedby"],
          })
        : children}
      {hint ? (
        <p id={id + "-hint"} className="text-xs font-normal text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <DataPill
      tone={
        ["APPROVED", "FULFILLED", "RECEIVED", "VALIDATED"].includes(value)
          ? "emerald"
          : ["CANCELED", "REJECTED"].includes(value)
            ? "rose"
            : "blue"
      }
    >
      {statuses[value] ?? value}
    </DataPill>
  );
}
export function Navigation() {
  return (
    <nav aria-label="Etapas de compras" className="flex flex-wrap gap-2">
      {[
        ["Solicitações", "requests", "purchaseRequests"],
        ["Cotações e comparativo", "quotations", "purchaseQuotations"],
        ["Aprovações", "approvals", "purchasingApprovals"],
        ["Regras e ativação", "settings", "purchasingSettings"],
      ]
        .filter(([, , screen]) => allowed(screen))
        .map(([label, path]) => (
          <Link
            key={path}
            href={"/dashboard/purchase-orders/" + path}
            className={secondaryClass}
          >
            {label}
          </Link>
        ))}
      <Link href="/dashboard/purchase-orders" className={secondaryClass}>
        Pedidos de compra
      </Link>
    </nav>
  );
}
export function Lookup({
  kind,
  label,
  value: providedValue,
  onPick,
}: {
  kind: string;
  label: string;
  value?: string;
  onPick: (choice: Choice | null) => void;
}) {
  const value = providedValue ?? "";
  const id = useId(),
    [q, setQ] = useState(""),
    [items, setItems] = useState<Choice[]>([]),
    [chosen, setChosen] = useState<Choice | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const chosenId = chosen?.id;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void request<Choice[]>(
        "/purchasing/options?kind=" +
          encodeURIComponent(kind) +
          "&q=" +
          encodeURIComponent(q || (!chosenId && value ? value : "")),
        undefined,
        "GET",
        controller.signal,
      )
        .then((rows) => {
          if (controller.signal.aborted) return;
          setItems(rows);
          const found = rows.find((row) => row.id === value);
          if (found) setChosen(found);
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, q, value, chosenId]);
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      <SearchLookup
        id={id}
        className={inputClass}
        value={value}
        options={items
          .slice(0, 10)
          .map((item) => ({ value: item.id, label: item.label }))}
        selected={
          chosen?.id === value
            ? { value: chosen.id, label: chosen.label }
            : undefined
        }
        onSearch={setQ}
        onSelect={(selectedId) => {
          const selected =
            items.find((item) => item.id === selectedId) ??
            (chosen?.id === selectedId ? chosen : null);
          setChosen(selected);
          onPick(selected);
        }}
        loading={loading}
        error={error || undefined}
        placeholder="Digite para pesquisar..."
      />
      <p className="text-xs text-slate-500">
        Até 10 resultados. Pesquise para localizar outros registros.
      </p>
    </div>
  );
}
const eventLabels: Record<string, string> = {
  CREATED: "Cadastro criado",
  UPDATED: "Cadastro atualizado",
  SUBMIT: "Enviado para análise ou aprovação",
  ANALYZE: "Análise de Suprimentos concluída",
  REVISE: "Revisão solicitada",
  CANCEL: "Cancelamento registrado",
  OPEN: "Consulta aos fornecedores aberta",
  NEW_ROUND: "Nova rodada de cotação",
  INVITATION_CHANGED: "Situação do fornecedor atualizada",
  OFFER_VERSION_RECORDED: "Nova versão de proposta registrada",
  PROPOSAL_SELECTED: "Proposta selecionada por item",
  APPROVAL_APPROVED: "Condições aprovadas",
  APPROVAL_REJECTED: "Condições reprovadas",
  APPROVAL_ADJUSTMENTS_REQUESTED: "Revisão solicitada pelo aprovador",
  ORDERS_GENERATED: "Pedidos oficiais gerados",
  GENERATED_FROM_APPROVED_QUOTE: "Pedido gerado de cotação aprovada",
  RECEIPT_ACCEPTED: "Recebimento ou aceite conferido",
  DOCUMENT_REGISTERED: "Documento registrado para conferência",
  DOCUMENT_VALIDATED_TITLES_CREATED: "Documento validado e títulos gerados",
  DOCUMENT_DRAFT_CORRECTED: "Conferência documental corrigida",
  ATTACHMENT_ADDED: "Documento anexado",
  SEND: "Envio ao fornecedor registrado",
  CONFIRM: "Confirmação do fornecedor registrada",
  CLOSE: "Recebimentos do pedido encerrados",
};
export function History({ items = [] }: { items?: Event[] }) {
  return (
    <SectionCard title="Histórico e rastreabilidade">
      <ol className="space-y-3">
        {items.map((event) => (
          <li key={event.id} className="border-l-2 border-sky-200 pl-3 text-sm">
            <p className="font-semibold text-slate-800">
              {eventLabels[event.action] ?? "Atualização do processo"}
            </p>
            <p className="text-slate-500">
              {event.actorUser?.name ?? "Sistema"} ·{" "}
              {new Date(event.createdAt).toLocaleString("pt-BR")}
            </p>
            {event.reason ? <p>{event.reason}</p> : null}
          </li>
        ))}
      </ol>
      {!items.length ? (
        <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
      ) : null}
    </SectionCard>
  );
}
export function Attachments({
  type,
  id,
  items = [],
  onChanged,
  editable = true,
}: {
  type: string;
  id: string;
  items?: Attachment[];
  onChanged: () => void;
  editable?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await apiFetch(
        "/purchasing/attachments/" + type + "/" + id,
        { method: "POST", body: data },
      );
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.message || "Não foi possível anexar o documento.");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no anexo.");
    } finally {
      setBusy(false);
    }
  }
  async function download(file: Attachment) {
    setError("");
    try {
      const response = await apiFetch(
        "/purchasing/attachments/" + file.id + "/download",
      );
      if (!response.ok) throw new Error("Não foi possível baixar o anexo.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no download.");
    }
  }
  return (
    <SectionCard
      title="Anexos"
      description="PDF e imagens em armazenamento privado."
    >
      {editable ? (
        <input
          aria-label="Anexar documento"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => void upload(e.target.files?.[0])}
          className={inputClass}
        />
      ) : null}
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <ul className="mt-3 space-y-2">
        {items.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              className="text-sm font-semibold text-blue-700 underline"
              onClick={() => void download(file)}
            >
              {file.fileName}
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
export function Paging({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        {total} registro(s) · Página {page} de{" "}
        {Math.max(1, Math.ceil(total / 20))}
      </span>
      <div className="flex gap-2">
        <button
          className={secondaryClass}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <button
          className={secondaryClass}
          disabled={page * 20 >= total}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
