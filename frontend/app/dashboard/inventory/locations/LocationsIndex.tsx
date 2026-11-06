"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { stockLocationReturnPath } from "@/lib/stock-location-return";
import { PageHeader } from "../../components/DashboardPageKit";
import { SelectField } from "../../components/SelectField";
import { InterfaceIcon } from "../../components/InterfaceIcon";
import LocationLabels from "./LocationLabels";
import {
  LocationForm,
  Notice,
  Pager,
  QrMark,
  StockDialog,
  placePath,
  stockRequest,
  useDebounced,
  useStockData,
  type Capabilities,
  type Location,
  type Page,
  type Warehouse,
} from "./stock-location-ui";
import styles from "./stock-locations.module.css";

type LocationList = Page<Location> & {
  unlocated: number;
  capabilities: Capabilities;
};
export default function LocationsIndex() {
  const router = useRouter(),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]),
    [warehouseError, setWarehouseError] = useState(""),
    [warehouseId, setWarehouseId] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [page, setPage] = useState(1),
    [creating, setCreating] = useState(false),
    [scanning, setScanning] = useState(false),
    [scan, setScan] = useState(""),
    [scanError, setScanError] = useState(""),
    [scanBusy, setScanBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [printing, setPrinting] = useState(false),
    [notice, setNotice] = useState("");
  const term = useDebounced(query),
    params = new URLSearchParams({
      q: term,
      page: String(page),
      status,
      ...(warehouseId ? { warehouseId } : {}),
    }),
    list = useStockData<LocationList>("?" + params.toString());
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/inventory/warehouses", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error("Não foi possível carregar os almoxarifados.");
        return (await response.json()) as Warehouse[];
      })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setWarehouses(rows);
          setWarehouseError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setWarehouseError(e.message);
      });
    return () => controller.abort();
  }, []);
  function filter(change: () => void) {
    change();
    setPage(1);
    setSelected([]);
  }
  async function openScanned(event: FormEvent) {
    event.preventDefault();
    setScanError("");
    const value = scan.trim();
    let path = stockLocationReturnPath(value);
    if (!path && /^[0-9a-f-]{36}$/i.test(value))
      path = stockLocationReturnPath("/dashboard/inventory/locations/" + value);
    if (!path) {
      try {
        path = stockLocationReturnPath(new URL(value).pathname);
      } catch {
        /* A shelf code is also accepted. */
      }
    }
    if (path) {
      setScanning(false);
      router.push(path);
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(value)) {
      setScanError("Use o link da etiqueta ou um código de posição válido.");
      return;
    }
    setScanBusy(true);
    try {
      const found = await stockRequest<LocationList>(
        "?" +
          new URLSearchParams({
            q: value,
            status: "ALL",
            ...(warehouseId ? { warehouseId } : {}),
          }),
      );
      const exact = found.items.filter(
        (x) => x.code.toLowerCase() === value.toLowerCase(),
      );
      if (exact.length === 1 && found.total <= 10) {
        setScanning(false);
        router.push("/dashboard/inventory/locations/" + exact[0].id);
      } else {
        filter(() => setQuery(value));
        setScanning(false);
        setNotice(
          found.total
            ? "Escolha a posição no almoxarifado correto."
            : "Nenhuma posição encontrada para esse código.",
        );
      }
    } catch (e) {
      setScanError(
        e instanceof Error ? e.message : "Falha ao procurar etiqueta.",
      );
    } finally {
      setScanBusy(false);
    }
  }
  const caps = list.data?.capabilities ?? {},
    rows = list.data?.items ?? [];
  return (
    <div className={`${styles.workspace} dashboard-page`}>
      <PageHeader
        eyebrow="Almoxarifado"
        title="Posições e QR Code"
        description="Cada item no seu lugar. Encontre, confira e destine materiais a partir da prateleira."
        actions={
          <>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setScanning(true)}
            >
              <QrMark />
              Abrir etiqueta
            </button>
            {caps.create && (
              <button
                type="button"
                className={styles.primary}
                disabled={!warehouses.length}
                onClick={() => setCreating(true)}
              >
                <InterfaceIcon name="plus" />
                Nova posição
              </button>
            )}
          </>
        }
      />
      <section className={styles.intro}>
        <div className={styles.introMark}>
          <QrMark />
        </div>
        <div>
          <h2>Da prateleira para a operação</h2>
          <p>
            Escaneie a etiqueta com a câmera do celular para abrir os itens
            daquela posição. A conferência, as reservas e as demandas ficam no
            mesmo lugar.
          </p>
          <div className={styles.steps}>
            <span>
              <b>01</b> Endereçar
            </span>
            <span>
              <b>02</b> Etiquetar
            </span>
            <span>
              <b>03</b> Conferir e atender
            </span>
          </div>
        </div>
      </section>
      {notice && <Notice tone="success">{notice}</Notice>}
      {warehouseError && <Notice tone="error">{warehouseError}</Notice>}
      {list.error && (
        <Notice tone="error">
          {list.error}{" "}
          <button
            type="button"
            className={styles.textButton}
            onClick={list.refresh}
          >
            Tentar novamente
          </button>
        </Notice>
      )}
      <div className={styles.toolbar}>
        <label className={`${styles.field} ${styles.search}`}>
          Pesquisar posições
          <input
            className={styles.input}
            placeholder="Código, descrição, corredor ou estante"
            value={query}
            onChange={(e) => filter(() => setQuery(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          Almoxarifado
          <SelectField
            className={styles.input}
            value={warehouseId}
            onChange={(e) => filter(() => setWarehouseId(e.target.value))}
          >
            <option value="">Todos os almoxarifados</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </SelectField>
        </label>
        <label className={styles.field}>
          Exibir
          <select
            className={styles.input}
            value={status}
            onChange={(e) => filter(() => setStatus(e.target.value))}
          >
            <option value="ACTIVE">Posições ativas</option>
            <option value="INACTIVE">Posições inativas</option>
            <option value="ALL">Todas as posições</option>
          </select>
        </label>
      </div>
      <div className={styles.listHeading}>
        <div>
          <h2>
            Mapa de posições <span>{list.data?.total ?? "—"}</span>
          </h2>
          {Boolean(list.data?.unlocated) && (
            <p>
              {list.data!.unlocated}{" "}
              {list.data!.unlocated === 1
                ? "item de estoque ainda sem posição"
                : "itens de estoque ainda sem posição"}
              . Abra uma posição e use Endereçar item.
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={list.loading}
            onClick={list.refresh}
          >
            <InterfaceIcon name="refresh" />
            Atualizar
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={!selected.length}
            onClick={() => setPrinting(true)}
          >
            Etiquetas {selected.length ? `(${selected.length})` : ""}
          </button>
        </div>
      </div>
      {list.loading && !list.data ? (
        <div className={styles.empty} role="status">
          Carregando posições…
        </div>
      ) : rows.length ? (
        <div className={styles.locationsGrid} aria-busy={list.loading}>
          {rows.map((loc) => (
            <article key={loc.id} className={styles.locationCard}>
              <header>
                <span className={styles.warehouseLabel}>
                  {loc.warehouse.code}
                </span>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${loc.code} para etiquetas`}
                    disabled={!loc.isActive}
                    checked={selected.includes(loc.id)}
                    onChange={(e) =>
                      setSelected((value) =>
                        e.target.checked
                          ? [...value, loc.id]
                          : value.filter((id) => id !== loc.id),
                      )
                    }
                  />
                </label>
              </header>
              <Link
                href={"/dashboard/inventory/locations/" + loc.id}
                className={styles.positionCode}
              >
                {loc.code}
                <InterfaceIcon name="arrow-right" />
              </Link>
              <h3>{loc.name || "Posição de armazenagem"}</h3>
              <p>{placePath(loc) || loc.warehouse.name}</p>
              <footer>
                <span className={styles.pill}>
                  {loc.itemCount ?? 0}{" "}
                  {(loc.itemCount ?? 0) === 1 ? "item" : "itens"}
                </span>
                {!loc.isActive ? (
                  <span className={`${styles.pill} ${styles.inactive}`}>
                    Inativa
                  </span>
                ) : loc.uncheckedCount ? (
                  <span className={styles.checkHint}>
                    {loc.uncheckedCount} sem conferência
                  </span>
                ) : (
                  <span className={styles.muted}>Ativa</span>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <QrMark />
          <h3>
            {query || warehouseId || status !== "ACTIVE"
              ? "Nenhuma posição encontrada"
              : "Organize sua primeira prateleira"}
          </h3>
          <p>
            {query
              ? "Tente outro código ou descrição."
              : "Cadastre corredor, estante e compartimento. Depois vincule os itens e imprima as etiquetas."}
          </p>
          {caps.create && (
            <button
              type="button"
              className={styles.primary}
              disabled={!warehouses.length}
              onClick={() => setCreating(true)}
            >
              Cadastrar posição
            </button>
          )}
        </div>
      )}
      <Pager
        page={page}
        total={list.data?.total ?? 0}
        loading={list.loading}
        onPage={(next) => {
          setPage(next);
          setSelected([]);
        }}
      />
      {creating && (
        <LocationForm
          warehouses={warehouses}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push("/dashboard/inventory/locations/" + id);
          }}
        />
      )}
      {printing && (
        <LocationLabels
          locations={rows.filter((x) => selected.includes(x.id))}
          canEdit={Boolean(caps.update)}
          onClose={() => setPrinting(false)}
          onSaved={list.refresh}
        />
      )}
      {scanning && (
        <StockDialog
          title="Abrir uma etiqueta"
          busy={scanBusy}
          dirty={false}
          onClose={() => setScanning(false)}
        >
          <form className={styles.form} onSubmit={openScanned}>
            <Notice>
              Com o celular, use a câmera para ler o QR Code na prateleira.
              Nesta tela, você também pode usar um leitor conectado ou colar o
              link da etiqueta.
            </Notice>
            {scanError && <Notice tone="error">{scanError}</Notice>}
            <label className={styles.field}>
              Código da posição ou link da etiqueta
              <input
                className={styles.input}
                autoFocus
                required
                autoComplete="off"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="A-01-02"
              />
            </label>
            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setScanning(false)}
                disabled={scanBusy}
              >
                Cancelar
              </button>
              <button className={styles.primary} disabled={scanBusy}>
                {scanBusy ? "Localizando…" : "Abrir posição"}
              </button>
            </div>
          </form>
        </StockDialog>
      )}
    </div>
  );
}
