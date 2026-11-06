"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { stockOperationKey } from "@/lib/stock-operation-key";
import ModalDialog from "../../components/ModalDialog";
import { SearchLookup, SelectField } from "../../components/SelectField";
import styles from "./stock-locations.module.css";

export type Capabilities = {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  adjust?: boolean;
  reserve?: boolean;
  handoff?: boolean;
  catalog?: boolean;
};
export type Warehouse = {
  id: string;
  name: string;
  code: string;
  qrBaseUrl?: string | null;
};
export type Location = {
  id: string;
  warehouseId: string;
  code: string;
  name?: string | null;
  aisle?: string | null;
  shelf?: string | null;
  level?: string | null;
  compartment?: string | null;
  isActive: boolean;
  version: number;
  warehouse: Warehouse;
  itemCount?: number;
  uncheckedCount?: number;
  capabilities?: Capabilities;
  demandSources?: Record<string, boolean>;
};
export type StockItem = {
  id: string;
  catalogItemId: string;
  warehouseId: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  clientReservedQty?: number;
  lastVerifiedAt?: string | null;
  lastVerifiedByName?: string | null;
  expectedState: string;
  catalogItem: {
    id: string;
    name: string;
    sku?: string | null;
    manufacturerPartNumber?: string | null;
    unit?: string | null;
    photoUrl?: string | null;
    isActive: boolean;
  };
};
export type Reservation = {
  id: string;
  quantity: number;
  remainingQty: number;
  notes?: string | null;
  neededAt?: string | null;
  createdByName: string;
  createdAt: string;
  expectedState: string;
  client: { id: string; companyName: string; tradeName?: string | null };
  balance: StockItem;
};
export type Choice = {
  id: string;
  label: string;
  expectedState?: string;
  location?: { id: string; code: string } | null;
  physicalQty?: number;
  unit?: string | null;
  remainingQty?: number;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  restricted?: boolean;
};
export async function stockRequest<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  signal?: AbortSignal,
): Promise<T> {
  const timeout = new AbortController(),
    timer = setTimeout(() => timeout.abort(), 25000);
  const abort = () => timeout.abort();
  if (signal?.aborted) timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await apiFetch("/inventory/locations" + path, {
      method,
      cache: "no-store",
      signal: timeout.signal,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!response.ok)
      throw new Error(
        await readApiErrorMessage(
          response,
          "Não foi possível concluir. Confira a conexão e tente novamente.",
        ),
      );
    return (await response.json()) as T;
  } catch (error) {
    if (timeout.signal.aborted)
      throw new Error(
        "A consulta demorou mais que o esperado. Confira a conexão e tente novamente; os dados preenchidos foram mantidos.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Não foi possível conectar ao sistema. Confira a conexão e tente novamente; os dados preenchidos foram mantidos.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export function useStockData<T>(path: string | null, refreshKey = 0) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<{ path: string | null; message: string }>({
      path: null,
      message: "",
    }),
    [receivedPath, setReceivedPath] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError({ path, message: "" });
    void stockRequest<T>(path, undefined, "GET", controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setReceivedPath(path);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError({
            path,
            message: e instanceof Error ? e.message : "Falha ao carregar.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, refreshKey]);
  const message = error.path === path ? error.message : "";
  return {
    data: receivedPath === path ? data : null,
    loading: loading || (path !== null && receivedPath !== path && !message),
    error: message,
    refresh: () => setRevision((x) => x + 1),
  };
}
export function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 220);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
export function useConfirmationKey() {
  const pending = useRef<{ body: string; key: string } | null>(null);
  return (body: unknown) => {
    const value = JSON.stringify(body);
    if (pending.current?.body !== value)
      pending.current = { body: value, key: stockOperationKey() };
    return pending.current.key;
  };
}
export function QrMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v2m0 3v5H3m9 3v5m3-9h6m-3 0v3m3-3v3" />
    </svg>
  );
}
export const qty = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
export function parseQty(value: string) {
  return /^\d+(?:[.,]\d{1,6})?$/.test(value.trim())
    ? Number(value.trim().replace(",", "."))
    : null;
}
export const placePath = (location: Location) =>
  [
    location.aisle && "Corredor " + location.aisle,
    location.shelf && "Estante " + location.shelf,
    location.level && "Nível " + location.level,
    location.compartment && "Posição " + location.compartment,
  ]
    .filter(Boolean)
    .join(" · ");
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${styles.notice} ${styles[tone]}`}
    >
      {children}
    </div>
  );
}
export function Pager({
  total,
  page,
  onPage,
  loading,
}: {
  total: number;
  page: number;
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className={styles.pager}>
      <span>
        {total === 0
          ? "Nenhum registro"
          : `${Math.min((page - 1) * 10 + 1, total)}–${Math.min(page * 10, total)} de ${total}`}
      </span>
      <div>
        <button
          type="button"
          className={styles.secondary}
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          className={styles.secondary}
          disabled={loading || page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
export function StockLookup({
  kind,
  label,
  warehouseId,
  reservationId,
  value,
  onPick,
  excludeId,
}: {
  kind: string;
  label: string;
  warehouseId?: string;
  reservationId?: string;
  value: Choice | null;
  onPick: (choice: Choice | null) => void;
  excludeId?: string;
}) {
  const id = useId(),
    [query, setQuery] = useState(""),
    term = useDebounced(query),
    params = new URLSearchParams({
      kind,
      q: term,
      ...(warehouseId ? { warehouseId } : {}),
      ...(reservationId ? { reservationId } : {}),
    }),
    data = useStockData<Choice[]>("/options?" + params.toString());
  const options = (data.data ?? [])
    .filter((x) => x.id !== excludeId)
    .slice(0, 10);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <SearchLookup
        id={id}
        value={value?.id ?? ""}
        selected={value ? { value: value.id, label: value.label } : undefined}
        options={options.map((x) => ({ value: x.id, label: x.label }))}
        placeholder="Digite para pesquisar"
        loading={data.loading}
        error={data.error}
        onSearch={setQuery}
        onSelect={(next) =>
          onPick(
            options.find((x) => x.id === next) ??
              (value?.id === next ? value : null),
          )
        }
        className={styles.input}
      />
      <small>Até 10 resultados. Digite parte do nome ou código.</small>
    </div>
  );
}
export function StockDialog({
  title,
  busy,
  dirty,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [discard, setDiscard] = useState(false);
  return (
    <ModalDialog
      title={title}
      onClose={() => {
        if (busy) return;
        if (dirty) setDiscard(true);
        else onClose();
      }}
    >
      {discard ? (
        <div className={styles.discard}>
          <h3>Descartar os dados desta janela?</h3>
          <p>As alterações ainda não foram confirmadas.</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setDiscard(false)}
            >
              Continuar editando
            </button>
            <button type="button" className={styles.danger} onClick={onClose}>
              Descartar e fechar
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </ModalDialog>
  );
}
export function LocationForm({
  location,
  warehouses,
  onClose,
  onSaved,
}: {
  location?: Location;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
      warehouseId: location?.warehouseId ?? warehouses[0]?.id ?? "",
      code: location?.code ?? "",
      name: location?.name ?? "",
      aisle: location?.aisle ?? "",
      shelf: location?.shelf ?? "",
      level: location?.level ?? "",
      compartment: location?.compartment ?? "",
      isActive: location?.isActive ?? true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    key = useConfirmationKey();
  function field(name: keyof typeof form, value: string | boolean) {
    setDirty(true);
    setForm((previous) => ({ ...previous, [name]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = location
      ? { ...form, warehouseId: undefined, version: location.version }
      : { ...form, isActive: undefined };
    try {
      const result = await stockRequest<{ id?: string; locationId: string }>(
        location ? "/" + location.id : "",
        { ...body, requestKey: key(body) },
        location ? "PATCH" : "POST",
      );
      onSaved(result.id ?? result.locationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <StockDialog
      title={location ? "Editar posição" : "Nova posição de armazenagem"}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.form}>
          {error && <Notice tone="error">{error}</Notice>}
          <p className={styles.muted}>
            Dê um endereço único a cada parte da prateleira. Exemplo: A-01-02.
          </p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Almoxarifado
              <SelectField
                className={styles.input}
                required
                value={form.warehouseId}
                disabled={Boolean(location) || busy}
                onChange={(e) => field("warehouseId", e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Código da posição
              <input
                className={styles.input}
                required
                maxLength={32}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                placeholder="A-01-02"
                value={form.code}
                onChange={(e) => field("code", e.target.value.toUpperCase())}
              />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              Descrição
              <input
                className={styles.input}
                maxLength={100}
                placeholder="Filtros de óleo e combustível"
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </label>
            {(
              [
                ["aisle", "Corredor"],
                ["shelf", "Estante"],
                ["level", "Nível"],
                ["compartment", "Compartimento"],
              ] as const
            ).map(([name, label]) => (
              <label className={styles.field} key={name}>
                {label}
                <input
                  className={styles.input}
                  maxLength={24}
                  value={form[name]}
                  onChange={(e) => field(name, e.target.value)}
                />
              </label>
            ))}
          </div>
          {location && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => field("isActive", e.target.checked)}
              />
              Posição ativa
            </label>
          )}
          <div className={styles.formFooter}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                if (dirty) setDirty(false);
                onClose();
              }}
            >
              Cancelar
            </button>
            <button
              className={styles.primary}
              disabled={busy || !form.warehouseId}
            >
              {busy ? "Salvando…" : "Salvar posição"}
            </button>
          </div>
        </fieldset>
      </form>
    </StockDialog>
  );
}
export type StockAction =
  | "PLACE"
  | "COUNT"
  | "RESERVE"
  | "MOVE"
  | "UNPLACE"
  | "RELEASE"
  | "TRANSFER";
export function StockActionForm({
  action,
  location,
  item,
  reservation,
  onClose,
  onSaved,
}: {
  action: StockAction;
  location: Location;
  item?: StockItem;
  reservation?: Reservation;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const stock = item ?? reservation?.balance,
    [number, setNumber] = useState(""),
    [reason, setReason] = useState(""),
    [neededAt, setNeededAt] = useState(""),
    [choice, setChoice] = useState<Choice | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    key = useConfirmationKey();
  const titles: Record<StockAction, string> = {
    PLACE: "Endereçar item",
    COUNT: "Conferir contagem",
    RESERVE: "Reservar para cliente",
    MOVE: "Mover posição",
    UNPLACE: "Desvincular item sem saldo",
    RELEASE: "Liberar reserva antecipada",
    TRANSFER: "Vincular reserva ao pedido",
  };
  const quantity = parseQty(number),
    delta =
      quantity === null || !stock
        ? 0
        : Math.round((quantity - stock.physicalQty) * 1e6) / 1e6;
  const hasQuantity = ["COUNT", "RESERVE", "RELEASE", "TRANSFER"].includes(
      action,
    ),
    needsReason =
      ["MOVE", "UNPLACE", "RELEASE"].includes(action) ||
      (action === "COUNT" && delta !== 0),
    hasLookup = ["PLACE", "RESERVE", "MOVE", "TRANSFER"].includes(action);
  const invalid =
    hasQuantity &&
    (quantity === null ||
      quantity < 0 ||
      (action !== "COUNT" && quantity <= 0));
  const located = action === "PLACE" && Boolean(choice?.location);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        reason: reason.trim() || undefined,
      };
      let endpoint = "/" + location.id;
      if (action === "PLACE") {
        endpoint += "/items";
        body.catalogItemId = choice?.id;
        body.expectedState = choice?.expectedState;
      } else if (action === "RELEASE" || action === "TRANSFER") {
        endpoint +=
          "/reservations/" +
          reservation!.id +
          (action === "RELEASE" ? "/release" : "/transfer");
        body.quantity = quantity;
        body.expectedState = reservation!.expectedState;
        if (action === "TRANSFER") body.salesOrderItemId = choice?.id;
      } else {
        body.balanceId = stock!.id;
        body.expectedState = stock!.expectedState;
        endpoint += {
          COUNT: "/count",
          RESERVE: "/reservations",
          MOVE: "/move",
          UNPLACE: "/unplace",
        }[action];
        if (action === "COUNT") body.countedQty = quantity;
        if (action === "RESERVE") {
          body.clientId = choice?.id;
          body.quantity = quantity;
          if (neededAt)
            body.neededAt = new Date(neededAt + "T12:00:00").toISOString();
        }
        if (action === "MOVE") body.toLocationId = choice?.id;
      }
      await stockRequest(endpoint, { ...body, requestKey: key(body) });
      onSaved(
        action === "COUNT"
          ? delta === 0
            ? "Contagem confirmada, sem alteração de saldo."
            : "Contagem registrada e saldo atualizado."
          : "Operação registrada com sucesso.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <StockDialog
      title={titles[action]}
      busy={busy}
      dirty={Boolean(number || reason || choice || neededAt)}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.form}>
          {stock && (
            <div className={styles.itemContext}>
              <span>{stock.catalogItem.sku || "Item"}</span>
              <strong>{stock.catalogItem.name}</strong>
              <div>
                <span>
                  Físico{" "}
                  <b>
                    {qty(stock.physicalQty)} {stock.catalogItem.unit}
                  </b>
                </span>
                <span>
                  Reservado <b>{qty(stock.reservedQty)}</b>
                </span>
                <span>
                  Disponível{" "}
                  <b>
                    {qty(
                      stock.availableQty ??
                        stock.physicalQty - stock.reservedQty,
                    )}
                  </b>
                </span>
              </div>
            </div>
          )}
          {reservation && (
            <Notice>
              Reserva de{" "}
              {reservation.client.tradeName || reservation.client.companyName}:{" "}
              {qty(reservation.remainingQty)} {stock?.catalogItem.unit}{" "}
              restantes.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {action === "PLACE" && (
            <Notice>
              O item terá uma única posição de saldo neste almoxarifado.
              Endereçar mantém a quantidade atual; a contagem é feita em
              seguida.
            </Notice>
          )}
          {action === "RESERVE" && (
            <Notice>
              Reserva antecipada para cliente, antes do pedido. Ela reduz o
              disponível, sem registrar uma saída ou alterar o faturamento.
            </Notice>
          )}
          {action === "MOVE" && (
            <Notice>
              Todo o saldo deste item e suas reservas passarão para a nova
              posição, dentro do mesmo almoxarifado.
            </Notice>
          )}
          {action === "TRANSFER" && (
            <Notice>
              A reserva será vinculada ao pedido do mesmo cliente, sem duplicar
              a quantidade reservada. As regras de liberação financeira
              continuam valendo.
            </Notice>
          )}
          {hasLookup && (
            <StockLookup
              kind={
                {
                  PLACE: "ITEMS",
                  RESERVE: "CLIENTS",
                  MOVE: "LOCATIONS",
                  TRANSFER: "SALES_TARGETS",
                }[action as "PLACE" | "RESERVE" | "MOVE" | "TRANSFER"]
              }
              label={
                {
                  PLACE: "Peça do catálogo",
                  RESERVE: "Cliente",
                  MOVE: "Posição de destino",
                  TRANSFER: "Item do pedido de venda",
                }[action as "PLACE" | "RESERVE" | "MOVE" | "TRANSFER"]
              }
              warehouseId={location.warehouseId}
              reservationId={reservation?.id}
              excludeId={action === "MOVE" ? location.id : undefined}
              value={choice}
              onPick={setChoice}
            />
          )}
          {located && (
            <Notice tone="warning">
              Este item já está na posição {choice?.location?.code}. Abra essa
              posição para movê-lo.
            </Notice>
          )}
          {hasQuantity && (
            <label className={styles.field}>
              {action === "COUNT" ? "Quantidade contada" : "Quantidade"}
              <input
                className={styles.input}
                required
                inputMode="decimal"
                autoComplete="off"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="0"
              />
              <small>
                {stock?.catalogItem.unit || "Unidade do cadastro"} · Até seis
                casas decimais, quando a unidade permitir.
              </small>
            </label>
          )}
          {action === "COUNT" && quantity !== null && stock && (
            <div
              className={`${styles.countPreview} ${delta !== 0 ? styles.changed : ""}`}
            >
              <span>Resultado da conferência</span>
              <strong>
                {delta === 0
                  ? "Saldo confirmado"
                  : `${delta > 0 ? "+" : ""}${qty(delta)} ${stock.catalogItem.unit ?? ""} no estoque`}
              </strong>
              <small>
                Após a confirmação: {qty(quantity)} físico ·{" "}
                {qty(Math.round((quantity - stock.reservedQty) * 1e6) / 1e6)}{" "}
                disponível.
              </small>
            </div>
          )}
          {action === "RESERVE" && (
            <label className={styles.field}>
              Previsão de uso
              <input
                type="date"
                className={styles.input}
                value={neededAt}
                onChange={(e) => setNeededAt(e.target.value)}
              />
            </label>
          )}
          <label className={styles.field}>
            {needsReason ? "Motivo obrigatório" : "Observação"}
            <textarea
              className={styles.input}
              required={needsReason}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action === "COUNT"
                  ? "Descreva a divergência encontrada"
                  : "Informação para o histórico"
              }
            />
          </label>
          <div className={styles.formFooter}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              className={styles.primary}
              disabled={
                busy ||
                Boolean(invalid) ||
                (hasLookup && !choice) ||
                located ||
                (needsReason && !reason.trim())
              }
            >
              {busy ? "Confirmando…" : "Confirmar"}
            </button>
          </div>
        </fieldset>
      </form>
    </StockDialog>
  );
}
