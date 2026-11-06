"use client";
import Image from "next/image";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Notice,
  QrMark,
  StockDialog,
  stockRequest,
  useConfirmationKey,
  type Location,
} from "./stock-location-ui";
import styles from "./stock-locations.module.css";
type Label = {
  id: string;
  code: string;
  name: string | null;
  warehouse: string;
  path: string;
  url: string;
  loopback: boolean;
  qrDataUrl: string;
};
function PrintedLabel({ label }: { label: Label }) {
  return (
    <article className={styles.label}>
      <div className={styles.labelCopy}>
        <Image
          unoptimized
          src="/brand/manitec-logo.png.png"
          width={112}
          height={28}
          alt="Manitec"
        />
        <span className={styles.labelEyebrow}>ALMOXARIFADO</span>
        <strong
          className={label.code.length > 16 ? styles.longCode : undefined}
        >
          {label.code}
        </strong>
        <span>{label.warehouse}</span>
        {label.name && <b>{label.name}</b>}
        <small>{label.path}</small>
      </div>
      <div className={styles.labelQr}>
        <Image
          unoptimized
          src={label.qrDataUrl}
          width={160}
          height={160}
          alt={"QR Code da posição " + label.code}
        />
        <span>Consultar posição</span>
      </div>
    </article>
  );
}
export default function LocationLabels({
  locations,
  canEdit,
  onClose,
  onSaved,
}: {
  locations: Location[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [base, setBase] = useState(
      locations[0]?.warehouse.qrBaseUrl ||
        (typeof window !== "undefined" ? window.location.origin : ""),
    ),
    [labels, setLabels] = useState<Label[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    key = useConfirmationKey();
  const loopback =
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(base),
    oneWarehouse = locations.every(
      (x) => x.warehouseId === locations[0]?.warehouseId,
    );
  async function preview() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setLabels(
        await stockRequest<Label[]>("/labels", {
          locationIds: locations.map((x) => x.id),
          ...(canEdit ? { baseUrl: base } : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar etiquetas.");
    } finally {
      setBusy(false);
    }
  }
  async function saveBase() {
    setBusy(true);
    setError("");
    const body = {
      baseUrl: base,
      expectedBaseUrl: locations[0].warehouse.qrBaseUrl ?? "",
      reason: "Endereço de acesso das etiquetas",
    };
    try {
      await stockRequest(
        "/" + locations[0].id + "/qr-access",
        { ...body, requestKey: key(body) },
        "PATCH",
      );
      setMessage(
        "Endereço salvo para as próximas etiquetas deste almoxarifado.",
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar endereço.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <StockDialog
        title="Etiquetas de posição"
        busy={busy}
        dirty={false}
        onClose={onClose}
      >
        <div className={styles.form}>
          <p className={styles.muted}>
            O QR Code abre a posição com seus itens atuais. A etiqueta continua
            válida quando os saldos mudam.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
          <label className={styles.field}>
            Endereço do sistema nas etiquetas
            <input
              type="url"
              className={styles.input}
              value={base}
              readOnly={!canEdit || busy}
              onChange={(e) => {
                setBase(e.target.value);
                setLabels([]);
              }}
              placeholder="https://sistema.empresa.com.br"
            />
            <small>
              Para usar no celular, informe o domínio do sistema ou o endereço
              do servidor na mesma rede.
            </small>
          </label>
          {loopback && (
            <Notice tone="warning">
              Este endereço funciona somente neste computador. Para escanear no
              celular, use o endereço de rede do servidor ou o domínio da
              empresa.
            </Notice>
          )}
          <div className={styles.actions}>
            {canEdit && oneWarehouse && (
              <button
                type="button"
                className={styles.secondary}
                disabled={busy || !base}
                onClick={() => void saveBase()}
              >
                Salvar endereço do almoxarifado
              </button>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !base}
              onClick={() => void preview()}
            >
              <QrMark />
              {busy ? "Preparando…" : "Gerar prévia"}
            </button>
          </div>
          {labels.length > 0 && (
            <>
              <div className={styles.labelPreview}>
                {labels.map((label) => (
                  <PrintedLabel key={label.id} label={label} />
                ))}
              </div>
              <div className={styles.formFooter}>
                <span className={styles.muted}>
                  A4 · 2 colunas · 90 × 50 mm
                </span>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => window.print()}
                >
                  Imprimir{" "}
                  {labels.length === 1
                    ? "etiqueta"
                    : `${labels.length} etiquetas`}
                </button>
              </div>
            </>
          )}
        </div>
      </StockDialog>
      {labels.length > 0 &&
        createPortal(
          <div className={styles.printSheet}>
            {labels.map((label) => (
              <PrintedLabel key={label.id} label={label} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
