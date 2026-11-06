"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "../../components/DashboardPageKit";
import { InterfaceIcon } from "../../components/InterfaceIcon";
import { formatCalendarDate } from "@/lib/formatters";
import { commercialLabel } from "@/lib/commercial-labels";
import LocationLabels from "./LocationLabels";
import {
  LocationForm,
  Notice,
  Pager,
  QrMark,
  StockActionForm,
  placePath,
  qty,
  useDebounced,
  useStockData,
  type Location,
  type Page,
  type Reservation,
  type StockAction,
  type StockItem,
} from "./stock-location-ui";
import styles from "./stock-locations.module.css";
type Demand = {
  id: string;
  code: string;
  description: string;
  client: string;
  quantity: number;
  reserved: number | null;
  href: string;
  status: string;
};
type History = {
  id: string;
  action: string;
  actorName: string;
  reason: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
};
const tabs = [
  ["items", "Itens da posição"],
  ["reservations", "Reservas de clientes"],
  ["demands", "Demandas"],
  ["history", "Histórico"],
] as const;
const actionLabels: Record<string, string> = {
  CREATE: "Posição criada",
  UPDATE: "Posição atualizada",
  PLACE: "Item endereçado",
  MOVE: "Mudança de posição",
  UNPLACE: "Item desvinculado",
  COUNT: "Contagem registrada",
  RESERVE: "Reserva antecipada",
  RELEASE: "Reserva liberada",
  HANDOFF: "Reserva vinculada ao pedido",
  QR_ACCESS: "Endereço das etiquetas atualizado",
};
const statuses: Record<string, string> = {
  OPEN: "Em aberto",
  PARTIALLY_DELIVERED: "Entrega parcial",
  AWAITING_ANALYSIS: "Aguardando análise",
  ANALYZED: "Analisada",
  IN_QUOTATION: "Em cotação",
  PARTIALLY_FULFILLED: "Atendimento parcial",
  IN_PROGRESS: "Em atendimento",
  SCHEDULED: "Programada",
};
export default function LocationDetail({ id }: { id: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("items"),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [source, setSource] = useState("SALES"),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false),
    [printing, setPrinting] = useState(false),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState<{
      kind: StockAction;
      item?: StockItem;
      reservation?: Reservation;
    } | null>(null);
  const detail = useStockData<Location>("/" + id, revision),
    term = useDebounced(query),
    params = new URLSearchParams({
      page: String(page),
      q: term,
      ...(tab === "demands" ? { source } : {}),
    }),
    records = useStockData<Page<StockItem | Reservation | Demand | History>>(
      "/" + id + "/" + tab + "?" + params.toString(),
      revision,
    );
  const loc = detail.data,
    caps = loc?.capabilities ?? {};
  function refresh() {
    setPage(1);
    setRevision((x) => x + 1);
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setPage(1);
    setQuery("");
  }
  if (!loc)
    return (
      <div className={`${styles.workspace} dashboard-page`}>
        <Link className={styles.back} href="/dashboard/inventory/locations">
          ← Posições e QR Code
        </Link>
        <PageHeader
          eyebrow="Almoxarifado"
          title={
            detail.error
              ? "Não foi possível abrir a posição"
              : "Abrindo posição…"
          }
        />
        {detail.error ? (
          <Notice tone="error">
            {detail.error}{" "}
            <button className={styles.textButton} onClick={detail.refresh}>
              Tentar novamente
            </button>
          </Notice>
        ) : (
          <div role="status" className={styles.empty}>
            Carregando endereço e permissões…
          </div>
        )}
      </div>
    );
  return (
    <div className={`${styles.workspace} dashboard-page`}>
      <Link className={styles.back} href="/dashboard/inventory/locations">
        <InterfaceIcon name="arrow-left" />
        Posições e QR Code
      </Link>
      <PageHeader
        eyebrow={loc.warehouse.name}
        title={loc.code}
        description={loc.name || "Posição de armazenagem"}
        actions={
          <>
            <button
              className={styles.secondary}
              disabled={!loc.isActive}
              onClick={() => setPrinting(true)}
            >
              <QrMark />
              Etiqueta QR
            </button>
            {caps.update && (
              <button
                className={styles.secondary}
                onClick={() => setEditing(true)}
              >
                <InterfaceIcon name="edit" />
                Editar posição
              </button>
            )}
          </>
        }
      />
      <section className={styles.positionSummary}>
        <div>
          <span className={styles.eyebrow}>Endereço</span>
          <strong>
            {placePath(loc) || "Endereço identificado pelo código da posição"}
          </strong>
          <small>Um endereço de saldo por item, em cada almoxarifado.</small>
        </div>
        <span
          className={`${styles.pill} ${!loc.isActive ? styles.inactive : ""}`}
        >
          {loc.isActive ? "Posição ativa" : "Posição inativa"}
        </span>
      </section>
      {!loc.isActive && (
        <Notice tone="warning">
          Esta posição está inativa. O histórico permanece disponível.
        </Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      {detail.error && <Notice tone="error">{detail.error}</Notice>}
      <nav className={styles.tabs} aria-label="Informações da posição">
        {tabs.map(([value, label]) => (
          <button
            type="button"
            aria-current={tab === value ? "page" : undefined}
            key={value}
            onClick={() => changeTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>{tabs.find((x) => x[0] === tab)?.[1]}</h2>
            <p>
              {tab === "items"
                ? "Saldos integrados às entradas, reservas e saídas do estoque."
                : tab === "reservations"
                  ? "Reservas antecipadas que já reduzem o estoque disponível."
                  : tab === "demands"
                    ? "Itens desta posição solicitados nas áreas liberadas ao seu perfil."
                    : "Registro de quem confirmou e do que mudou na posição."}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              disabled={records.loading}
              onClick={refresh}
            >
              <InterfaceIcon name="refresh" />
              Atualizar
            </button>
            {tab === "items" && caps.update && loc.isActive && (
              <button
                className={styles.primary}
                onClick={() => setAction({ kind: "PLACE" })}
              >
                <InterfaceIcon name="plus" />
                Endereçar item
              </button>
            )}
          </div>
        </div>
        {tab === "demands" ? (
          <div className={styles.filters}>
            <label className={styles.field}>
              Origem
              <select
                className={styles.input}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
              >
                <option value="SALES">Pedidos de venda</option>
                <option value="WORK">Ordens de serviço</option>
                <option value="PROCUREMENT">Solicitações de compra</option>
              </select>
            </label>
            <label className={`${styles.field} ${styles.search}`}>
              Pesquisar item
              <input
                className={styles.input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nome ou SKU"
              />
            </label>
          </div>
        ) : tab === "items" ? (
          <label className={`${styles.field} ${styles.filterSearch}`}>
            Pesquisar item nesta posição
            <input
              className={styles.input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Nome, SKU ou código original"
            />
          </label>
        ) : null}
        {records.error && (
          <Notice tone="error">
            {records.error}{" "}
            <button className={styles.textButton} onClick={records.refresh}>
              Tentar novamente
            </button>
          </Notice>
        )}
        {records.loading && !records.data ? (
          <div className={styles.empty} role="status">
            Carregando registros…
          </div>
        ) : records.data?.restricted ? (
          <Notice>
            Seu perfil não possui acesso a esta origem de demandas.
          </Notice>
        ) : !records.data?.items.length ? (
          <div className={styles.empty}>
            <QrMark />
            <h3>
              {tab === "items"
                ? "Nenhum item endereçado"
                : tab === "reservations"
                  ? "Nenhuma reserva antecipada"
                  : tab === "demands"
                    ? "Nenhuma demanda pendente"
                    : "O histórico começa aqui"}
            </h3>
            <p>
              {tab === "items"
                ? "Vincule as peças guardadas nesta posição. Os saldos existentes serão mantidos."
                : tab === "reservations"
                  ? "Use Reservar para cliente em um item da posição. Reservas de pedidos e O.S. podem ser consultadas em Demandas."
                  : tab === "demands"
                    ? "Quando houver pedidos, O.S. ou solicitações abertas para estes itens, eles aparecerão na origem correspondente."
                    : "As próximas alterações ficarão registradas nesta posição."}
            </p>
          </div>
        ) : (
          <div className={styles.recordList} aria-busy={records.loading}>
            {tab === "items" &&
              (records.data.items as StockItem[]).map((item) => (
                <article className={styles.stockCard} key={item.id}>
                  <div className={styles.stockHeading}>
                    <div>
                      <span className={styles.sku}>
                        {item.catalogItem.sku || "Sem SKU"}
                        {item.catalogItem.manufacturerPartNumber
                          ? " · PN " + item.catalogItem.manufacturerPartNumber
                          : ""}
                      </span>
                      <h3>{item.catalogItem.name}</h3>
                    </div>
                    {caps.catalog && (
                      <Link
                        className={styles.textButton}
                        href={"/dashboard/catalog/" + item.catalogItemId}
                      >
                        Ficha do item <InterfaceIcon name="external-link" />
                      </Link>
                    )}
                  </div>
                  <dl className={styles.stockNumbers}>
                    <div>
                      <dt>Físico</dt>
                      <dd>
                        {qty(item.physicalQty)}{" "}
                        <small>{item.catalogItem.unit || ""}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Reservado</dt>
                      <dd>{qty(item.reservedQty)}</dd>
                    </div>
                    <div className={styles.available}>
                      <dt>Disponível</dt>
                      <dd>{qty(item.availableQty)}</dd>
                    </div>
                  </dl>
                  <div className={styles.stockFooter}>
                    <span className={styles.muted}>
                      {item.lastVerifiedAt
                        ? `Conferido em ${formatCalendarDate(item.lastVerifiedAt)}${item.lastVerifiedByName ? " por " + item.lastVerifiedByName : ""}`
                        : "Ainda sem conferência física registrada"}
                    </span>
                    {loc.isActive && (
                      <div className={styles.actions}>
                        {caps.adjust && (
                          <button
                            className={styles.secondary}
                            onClick={() => setAction({ kind: "COUNT", item })}
                          >
                            Conferir contagem
                          </button>
                        )}
                        {caps.reserve && (
                          <button
                            className={styles.secondary}
                            disabled={item.availableQty <= 0}
                            onClick={() => setAction({ kind: "RESERVE", item })}
                          >
                            Reservar para cliente
                          </button>
                        )}
                        {caps.update && (
                          <button
                            className={styles.secondary}
                            onClick={() => setAction({ kind: "MOVE", item })}
                          >
                            Mover posição
                          </button>
                        )}
                        {caps.update &&
                          item.physicalQty === 0 &&
                          item.reservedQty === 0 && (
                            <button
                              className={styles.textButton}
                              onClick={() =>
                                setAction({ kind: "UNPLACE", item })
                              }
                            >
                              Desvincular
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            {tab === "reservations" &&
              (records.data.items as Reservation[]).map((reservation) => (
                <article className={styles.stockCard} key={reservation.id}>
                  <div className={styles.stockHeading}>
                    <div>
                      <span className={styles.sku}>
                        {reservation.balance.catalogItem.sku}
                      </span>
                      <h3>{reservation.balance.catalogItem.name}</h3>
                      <p>
                        {reservation.client.tradeName ||
                          reservation.client.companyName}
                      </p>
                    </div>
                    <span className={styles.reservationQty}>
                      {qty(reservation.remainingQty)}{" "}
                      <small>{reservation.balance.catalogItem.unit}</small>
                    </span>
                  </div>
                  <div className={styles.reservationMeta}>
                    <span>Reservado por {reservation.createdByName}</span>
                    {reservation.neededAt && (
                      <span>
                        Previsão: {formatCalendarDate(reservation.neededAt)}
                      </span>
                    )}
                    {reservation.notes && <p>{reservation.notes}</p>}
                  </div>
                  {loc.isActive && caps.reserve && (
                    <div className={styles.formFooter}>
                      {caps.handoff && (
                        <button
                          className={styles.secondary}
                          onClick={() =>
                            setAction({ kind: "TRANSFER", reservation })
                          }
                        >
                          Vincular ao pedido
                        </button>
                      )}
                      <button
                        className={styles.secondary}
                        onClick={() =>
                          setAction({ kind: "RELEASE", reservation })
                        }
                      >
                        Liberar reserva
                      </button>
                    </div>
                  )}
                </article>
              ))}
            {tab === "demands" &&
              (records.data.items as Demand[]).map((demand) => (
                <article className={styles.demandCard} key={demand.id}>
                  <div>
                    <span className={styles.sku}>{demand.code}</span>
                    <h3>{demand.description}</h3>
                    <p>{demand.client}</p>
                    <span className={styles.pill}>
                      {statuses[demand.status] ||
                        commercialLabel(demand.status)}
                    </span>
                  </div>
                  <div className={styles.demandNumbers}>
                    <span>
                      Solicitado <b>{qty(demand.quantity)}</b>
                    </span>
                    {demand.reserved !== null && (
                      <span>
                        Reservado neste almox. <b>{qty(demand.reserved)}</b>
                      </span>
                    )}
                    <Link href={demand.href} className={styles.secondary}>
                      Abrir origem <InterfaceIcon name="arrow-right" />
                    </Link>
                  </div>
                </article>
              ))}
            {tab === "history" &&
              (records.data.items as History[]).map((event) => (
                <article className={styles.historyCard} key={event.id}>
                  <span className={styles.historyDot} />
                  <div>
                    <h3>
                      {actionLabels[event.action] || "Operação registrada"}
                    </h3>
                    <p>
                      {event.actorName} ·{" "}
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {event.reason && (
                      <p className={styles.historyReason}>{event.reason}</p>
                    )}
                    {typeof event.afterData?.item === "string" && (
                      <span>{event.afterData.item}</span>
                    )}
                    {event.action === "COUNT" && (
                      <div className={styles.historyDelta}>
                        Físico: {qty(Number(event.beforeData?.quantity ?? 0))} →{" "}
                        {qty(Number(event.afterData?.quantity ?? 0))}
                        {Number(event.afterData?.delta) === 0
                          ? " · Sem divergência"
                          : " · Ajuste " +
                            qty(Number(event.afterData?.delta ?? 0))}
                      </div>
                    )}
                    {typeof event.afterData?.client === "string" && (
                      <span>
                        {event.afterData.client} ·{" "}
                        {qty(Number(event.afterData.quantity ?? 0))}
                      </span>
                    )}
                    {typeof event.afterData?.order === "string" && (
                      <span>
                        Pedido {event.afterData.order} ·{" "}
                        {qty(Number(event.afterData.quantity ?? 0))}
                      </span>
                    )}
                  </div>
                </article>
              ))}
          </div>
        )}
        {records.data && !records.data.restricted && (
          <Pager
            total={records.data.total}
            page={page}
            loading={records.loading}
            onPage={setPage}
          />
        )}
      </section>
      {action && (
        <StockActionForm
          action={action.kind}
          location={loc}
          item={action.item}
          reservation={action.reservation}
          onClose={() => setAction(null)}
          onSaved={(message) => {
            setAction(null);
            setNotice(message);
            refresh();
          }}
        />
      )}
      {editing && (
        <LocationForm
          location={loc}
          warehouses={[loc.warehouse]}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Posição atualizada.");
            refresh();
          }}
        />
      )}
      {printing && (
        <LocationLabels
          locations={[loc]}
          canEdit={Boolean(caps.update)}
          onClose={() => setPrinting(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
