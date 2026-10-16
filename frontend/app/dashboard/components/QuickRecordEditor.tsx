"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import ClientRelationshipMap, { type ClientRelationshipData } from "../clients/ClientRelationshipMap";

import CatalogSummary, { type CatalogSummaryData } from "./CatalogSummary";
import EquipmentSummary, {type EquipmentSummaryData} from "./EquipmentSummary";

export type QuickRecordKind = "client" | "catalog" | "equipment" | "supplier";

type Field = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  type?: "email" | "number";
  maxLength?: number;
};

type RecordData = Record<string, unknown>;
type RecordConfig = {
  label: string;
  endpoint: string;
  fields: Field[];
  detailHref: (id: string) => string;
  editHref?: (id: string) => string;
  reference: (record: RecordData) => string;
};

const CONFIG: Record<QuickRecordKind, RecordConfig> = {
  client: {
    label: "cliente",
    endpoint: "/clients",
    detailHref: (id) => `/dashboard/clients/${id}`,
    reference: (record) => `Código ${record.code || "-"} · ${record.cnpj || "Sem CNPJ/CPF"}`,
    fields: [
      { key: "companyName", label: "Empresa / nome", required: true },
      { key: "tradeName", label: "Nome fantasia" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Telefone", required: true },
      { key: "city", label: "Cidade", required: true },
      { key: "state", label: "UF", required: true, maxLength: 2 },
      { key: "preferences", label: "Preferências de atendimento", multiline: true },
    ],
  },
  catalog: {
    label: "item",
    endpoint: "/catalogs",
    detailHref: (id) => `/dashboard/catalog/${id}`,
    editHref: (id) => `/dashboard/catalog/new?editItemId=${id}`,
    reference: (record) => `SKU ${record.sku || "-"} · PN ${record.manufacturerPartNumber || "-"}`,
    fields: [
      { key: "name", label: "Nome do item", required: true },
      { key: "manufacturerPartNumber", label: "Código original (PN)" },
      { key: "description", label: "Descrição técnica", multiline: true },
      { key: "commercialDescription", label: "Descrição comercial", multiline: true },
      { key: "storageLocation", label: "Localização no estoque" },
    ],
  },
  equipment: {
    label: "equipamento",
    endpoint: "/generators",
    detailHref: (id) => `/dashboard/equipments/${id}`,
    reference: (record) => `Código ${record.code || "-"}`,
    fields: [
      { key: "name", label: "Nome do equipamento", required: true },
      { key: "brand", label: "Fabricante", required: true },
      { key: "serialNumber", label: "Número de série" },
      { key: "assetTag", label: "Tag patrimonial" },
      { key: "power", label: "Potência (kVA)", type: "number", required: true },
      { key: "voltage", label: "Tensão" },
    ],
  },
  supplier: {
    label: "fornecedor",
    endpoint: "/suppliers",
    detailHref: (id) => `/dashboard/suppliers/${id}`,
    editHref: (id) => `/dashboard/suppliers/new?editSupplierId=${id}`,
    reference: (record) => record.cnpj ? `CNPJ ${record.cnpj}` : "CNPJ não informado",
    fields: [
      { key: "companyName", label: "Razão social", required: true },
      { key: "tradeName", label: "Nome fantasia" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Telefone" },
      { key: "city", label: "Cidade" },
      { key: "state", label: "UF", maxLength: 2 },
    ],
  },
};

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export default function QuickRecordEditor({
  kind,
  id,
  canEdit,
  onClose,
  onSaved,
}: {
  kind: QuickRecordKind;
  id: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const config = CONFIG[kind];
  const isSummary = kind === "client" || kind === "equipment" || kind === "catalog";
  const hasPhoto = kind === "equipment" || kind === "catalog";
  const [access] = useState(getAccessFromToken);
  const canOpenProposal = access.proposals.create && canAccessDashboardPath("/dashboard/proposals/new", access.pages);
  const canOpenTicket = access.tickets.create && canAccessDashboardPath("/dashboard/atendimento", access.pages);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [readingPhoto,setReadingPhoto] = useState(false);
  const dirty = config.fields.some((field) => values[field.key] !== original[field.key]) || (hasPhoto && values.photoUrl !== original.photoUrl);
  const clientId = kind === "client" ? id : stringValue(record?.clientId || (record?.client as {id?:string}|undefined)?.id);
  const summaryQuery = new URLSearchParams({clientId, ...(kind === "equipment" ? {generatorId:id} : {})}).toString();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch(`${config.endpoint}/${id}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível abrir o cadastro."));
        const data = (await response.json()) as RecordData;
        if (!active) return;
        const initial = Object.fromEntries(config.fields.map((field) => [field.key, stringValue(data[field.key])]));
        if (hasPhoto) initial.photoUrl = stringValue(data.photoUrl);
        setRecord(data);
        setOriginal(initial);
        setValues(initial);
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível abrir o cadastro.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [config, id, hasPhoto]);

  function close() {
    if (saving) return;
    if (dirty && !window.confirm("Descartar as alterações feitas neste cadastro?")) return;
    onClose();
  }

  function confirmNavigation(event: MouseEvent<HTMLElement>) {
    if (saving || (dirty && !window.confirm("Descartar as alterações feitas neste cadastro?"))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    ) || []).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !record || !dirty || saving || readingPhoto) return;
    const changedFields = config.fields.filter((field) => values[field.key] !== original[field.key]);
    if (changedFields.some((field) => field.required && !values[field.key]?.trim())) {
      setError("Preencha os campos obrigatórios antes de salvar.");
      return;
    }
    if (kind === "client" && changedFields.some((field) => field.key === "email" && !values.email.trim())) {
      setError("Para remover o e-mail, use o cadastro completo do cliente.");
      return;
    }
    const payload: Record<string,string|number|null> = Object.fromEntries(changedFields.map((field) => {
      const value = values[field.key].trim();
      return [field.key, field.type === "number" ? Number(value.replace(",", ".")) : value];
    }));
    if (hasPhoto && values.photoUrl !== original.photoUrl) payload.photoUrl = values.photoUrl || null;
    if (Object.values(payload).some((value) => typeof value === "number" && (!Number.isFinite(value) || value <= 0))) {
      setError("Informe uma potência válida, maior que zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`${config.endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível salvar o cadastro."));
      await onSaved();
      onClose();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  const recordFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      {config.fields.map((field) => (
        <label key={field.key} className={`block text-sm font-semibold text-slate-700 ${field.multiline ? "sm:col-span-2" : ""}`}>
          {field.label}{field.required ? " *" : ""}
          {field.multiline ? (
            <textarea value={values[field.key] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} disabled={!canEdit || saving} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" />
          ) : (
            <input type={field.type || "text"} step={field.type === "number" ? "any" : undefined} min={field.type === "number" ? "0" : undefined} maxLength={field.maxLength} value={values[field.key] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: field.maxLength === 2 ? event.target.value.toUpperCase() : event.target.value }))} disabled={!canEdit || saving} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" />
          )}
        </label>
      ))}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px] sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={isSummary ? "quick-record-kind quick-record-title" : "quick-record-title"}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={"flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none " + (isSummary ? "max-w-5xl" : "max-w-3xl")}
      >
        <div className="shrink-0 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="quick-record-kind" className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">{kind === "client" ? "Resumo do cliente" : kind === "equipment" ? "Resumo do equipamento" : kind === "catalog" ? (record?.type === "SERVICE" ? "Resumo do serviço" : "Resumo da peça") : "Cadastro rápido"}</p>
              <h2 id="quick-record-title" className="mt-1 break-words text-xl font-bold text-slate-950">
                {record ? stringValue(record.companyName || record.name) : "Abrindo " + config.label + "..."}
              </h2>
              {record ? <p className="mt-1 text-xs text-slate-500">{config.reference(record)}</p> : null}
            </div>
            <button type="button" onClick={close} disabled={saving} aria-label={kind === "client" ? "Fechar resumo do cliente" : kind === "equipment" ? "Fechar resumo do equipamento" : kind === "catalog" ? "Fechar resumo do item" : "Fechar cadastro rápido"} className="min-h-10 shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Fechar</button>
          </div>
          {isSummary && record && !loading && clientId ? <nav aria-label={kind === "client" ? "Ações do resumo do cliente" : "Ações do resumo do equipamento"} className="mt-4 flex flex-wrap gap-2">
            {canOpenProposal ? <Link href={"/dashboard/proposals/new?" + summaryQuery} onClick={confirmNavigation} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Abrir proposta</Link> : null}
            {canOpenTicket ? <Link href={"/dashboard/atendimento?" + summaryQuery + "#novo-chamado"} onClick={confirmNavigation} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Abrir chamado / solicitação</Link> : null}
          </nav> : null}
        </div>

        {loading ? <p className="p-7 text-sm text-slate-500">Carregando cadastro...</p> : null}
        {!loading && error ? <div role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</div> : null}
        {!loading && record ? (
          <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <p className="mb-5 text-sm text-slate-500">{kind === "client" ? "Consulte os principais vínculos e os dados essenciais deste cliente." : kind === "equipment" ? "Confira a máquina, os atendimentos e os dados essenciais em um só lugar." : kind === "catalog" ? "Consulte a foto, os dados essenciais e as ordens vinculadas a este item." : "Dados essenciais. Para vínculos, histórico e outras configurações, abra o cadastro completo."}</p>
              {kind === "equipment" ? (
                <div onClickCapture={event => {
                  if (event.target instanceof Element && event.target.closest("a[href]")) confirmNavigation(event);
                }}>
                  <EquipmentSummary
                    id={id}
                    equipment={record as EquipmentSummaryData}
                    photo={values.photoUrl || ""}
                    onPhotoChange={photoUrl => setValues(current => ({ ...current, photoUrl }))}
                    canEdit={canEdit}
                    busy={saving}
                    onBusyChange={setReadingPhoto}
                  >
                    <section aria-labelledby="summary-equipment-data-title" className="border-y border-slate-100 py-5">
                      <h3 id="summary-equipment-data-title" className="mb-4 text-base font-bold text-slate-950">Dados do equipamento</h3>
                      {recordFields}
                    </section>
                  </EquipmentSummary>
                </div>
              ) : null}
              {kind === "client" ? <section aria-labelledby="summary-relationships-title" className="mb-6 border-b border-slate-100 pb-6" onClickCapture={event => { if (event.target instanceof Element && event.target.closest("a[href]")) confirmNavigation(event); }}>
                <h3 id="summary-relationships-title" className="text-base font-bold text-slate-950">Mapa de relacionamentos</h3>
                <p className="mb-3 mt-1 text-xs text-slate-500">Principais registros vinculados. Consulte o histórico na ficha completa.</p>
                <ClientRelationshipMap client={record as ClientRelationshipData} compact />
              </section> : null}
              {kind === "client" ? <h3 className="mb-4 text-base font-bold text-slate-950">Dados do cliente</h3> : null}
              {kind === "catalog" ? (
                <div onClickCapture={event => {
                  if (event.target instanceof Element && event.target.closest("a[href]")) confirmNavigation(event);
                }}>
                  <CatalogSummary
                    item={record as CatalogSummaryData}
                    photo={values.photoUrl || ""}
                    onPhotoChange={photoUrl => setValues(current => ({ ...current, photoUrl }))}
                    canEdit={canEdit}
                    busy={saving}
                    onBusyChange={setReadingPhoto}
                  >
                    {recordFields}
                  </CatalogSummary>
                </div>
              ) : kind !== "equipment" ? recordFields : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
              <div className="flex flex-wrap gap-2">
                <Link href={config.detailHref(id)} onClick={confirmNavigation} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Ver ficha completa</Link>
                {canEdit && config.editHref ? <Link href={config.editHref(id)} onClick={confirmNavigation} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">Editar cadastro completo</Link> : null}
              </div>
              {canEdit ? <button type="submit" disabled={!dirty || saving || readingPhoto} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button> : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
