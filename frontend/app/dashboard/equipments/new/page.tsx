"use client";

import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { loadControlOptions, optionLabel, type ControlOption } from "@/lib/control-options";

type ClientRow = { id: string; companyName: string; cnpj?: string | null };
type SiteRow = { id: string; name: string; code?: string | null; clientId: string };
type ModelBaseItem = {
  id: string;
  serviceGroup: string;
  defaultQuantity: number;
  catalogItem: { id: string; name: string };
};
type GeneratorModelRow = {
  id: string;
  name: string;
  brand?: string | null;
  baseItems?: ModelBaseItem[];
};
type ManufacturerRow = {
  id: string;
  name: string;
  type?: string | null;
  isActive?: boolean | null;
};

type FormState = Record<string, string>;

const EMPTY_FORM: FormState = {
  clientId: "",
  currentSiteId: "",
  modelId: "",
  name: "",
  brand: "",
  serialNumber: "",
  assetTag: "",
  installationSite: "",
  power: "",
  hourMeter: "",
  condition: "BOM",
  operationalStatus: "OPERATING",
  lifecycleStatus: "AVAILABLE",
  criticality: "B",
  manufactureYear: "",
  installationDate: "",
  warrantyEndDate: "",
  hasMaintenanceContract: "false",
  application: "",
  notes: "",
  voltage: "",
  ratedCurrent: "",
  powerFactor: "",
  frequencyHz: "60",
  operationMode: "",
  engineBrand: "",
  engineModelName: "",
  engineSerialNumber: "",
  enginePower: "",
  fuelType: "",
  engineCylinders: "",
  oilRecommendation: "",
  oilCapacityLiters: "",
  lastOilChangeAt: "",
  alternatorBrand: "",
  alternatorModelName: "",
  alternatorSerialNumber: "",
  alternatorVoltage: "",
  alternatorFrequencyHz: "60",
  alternatorInsulationClass: "",
  alternatorProtectionDegree: "",
  hasTransferSwitch: "",
  transferSwitchBrand: "",
  transferSwitchModel: "",
  transferSwitchSerialNumber: "",
  transferSwitchRatedCurrent: "",
  transferSwitchCommandVoltage: "",
  transferSwitchType: "",
  transferSwitchNotes: "",
  batteryQuantity: "",
  batteryVoltage: "",
  batteryCapacityAh: "",
  batteryInstallationDate: "",
  batteryChargerModel: "",
  batteryLastReplacementDate: "",
};

const TEXT_FIELDS = [
  "serialNumber",
  "assetTag",
  "installationSite",
  "condition",
  "application",
  "notes",
  "voltage",
  "ratedCurrent",
  "operationMode",
  "engineBrand",
  "engineModelName",
  "engineSerialNumber",
  "enginePower",
  "fuelType",
  "oilRecommendation",
  "alternatorBrand",
  "alternatorModelName",
  "alternatorSerialNumber",
  "alternatorVoltage",
  "alternatorInsulationClass",
  "alternatorProtectionDegree",
  "transferSwitchBrand",
  "transferSwitchModel",
  "transferSwitchSerialNumber",
  "transferSwitchRatedCurrent",
  "transferSwitchCommandVoltage",
  "transferSwitchType",
  "transferSwitchNotes",
  "batteryVoltage",
  "batteryChargerModel",
] as const;

const NUMBER_FIELDS = [
  "power",
  "hourMeter",
  "manufactureYear",
  "powerFactor",
  "frequencyHz",
  "engineCylinders",
  "oilCapacityLiters",
  "alternatorFrequencyHz",
  "batteryQuantity",
  "batteryCapacityAh",
] as const;

const DATE_FIELDS = [
  "installationDate",
  "warrantyEndDate",
  "lastOilChangeAt",
  "batteryInstallationDate",
  "batteryLastReplacementDate",
] as const;

export default function NewEquipmentPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [models, setModels] = useState<GeneratorModelRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [controlOptions, setControlOptions] = useState({
    applications: [] as ControlOption[],
    operationModes: [] as ControlOption[],
  });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [applyModelBaseItems, setApplyModelBaseItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const clientIdFromUrl = new URLSearchParams(window.location.search).get("clientId");
    if (clientIdFromUrl) {
      setForm((prev) => ({ ...prev, clientId: clientIdFromUrl }));
    }

    void loadOptions();
  }, []);

  async function loadOptions() {
    setLoading(true);
    setError("");
    try {
      const [clientsRes, sitesRes, modelsRes, manufacturersRes, options] = await Promise.all([
        apiFetch("/clients", { cache: "no-store" }),
        apiFetch("/sites", { cache: "no-store" }),
        apiFetch("/generators/models", { cache: "no-store" }),
        apiFetch("/manufacturers", { cache: "no-store" }),
        loadControlOptions(["EQUIPMENT_APPLICATION", "EQUIPMENT_OPERATION_MODE"]),
      ]);

      if (clientsRes.ok) setClients((await clientsRes.json()) as ClientRow[]);
      if (sitesRes.ok) setSites((await sitesRes.json()) as SiteRow[]);
      if (modelsRes.ok) setModels((await modelsRes.json()) as GeneratorModelRow[]);
      if (manufacturersRes.ok) {
        const payload = (await manufacturersRes.json()) as ManufacturerRow[];
        setManufacturers(payload.filter((manufacturer) => manufacturer.isActive !== false));
      }
      setControlOptions({
        applications: options.EQUIPMENT_APPLICATION || [],
        operationModes: options.EQUIPMENT_OPERATION_MODE || [],
      });
    } catch {
      setError("Nao foi possivel carregar clientes, locais ou modelos.");
    } finally {
      setLoading(false);
    }
  }

  const selectedModel = useMemo(
    () => models.find((model) => model.id === form.modelId) ?? null,
    [form.modelId, models],
  );
  const filteredSites = useMemo(
    () => sites.filter((site) => !form.clientId || site.clientId === form.clientId),
    [form.clientId, sites],
  );
  const groupedModelBase = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of selectedModel?.baseItems ?? []) {
      map.set(item.serviceGroup, (map.get(item.serviceGroup) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [selectedModel]);
  const generatorManufacturers = useMemo(
    () =>
      manufacturers.filter((manufacturer) =>
        ["GENERATOR", "OTHER"].includes(String(manufacturer.type || "OTHER")),
      ),
    [manufacturers],
  );
  const engineManufacturers = useMemo(
    () =>
      manufacturers.filter((manufacturer) =>
        ["ENGINE", "OTHER"].includes(String(manufacturer.type || "OTHER")),
      ),
    [manufacturers],
  );
  const alternatorManufacturers = useMemo(
    () =>
      manufacturers.filter((manufacturer) =>
        ["ALTERNATOR", "OTHER"].includes(String(manufacturer.type || "OTHER")),
      ),
    [manufacturers],
  );
  const transferSwitchManufacturers = useMemo(
    () =>
      manufacturers.filter((manufacturer) =>
        ["TRANSFER_SWITCH", "OTHER"].includes(String(manufacturer.type || "OTHER")),
      ),
    [manufacturers],
  );

  useEffect(() => {
    if (selectedModel?.brand && !form.brand) {
      setForm((prev) => ({ ...prev, brand: selectedModel.brand || "" }));
    }
  }, [form.brand, selectedModel]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!form.clientId) return setError("Selecione um cliente.");
    if (!form.name.trim()) return setError("Informe o nome do equipamento.");
    if (!form.brand.trim()) return setError("Informe o fabricante.");
    if (!form.power || Number(form.power) <= 0) {
      return setError("Informe uma potencia kVA valida.");
    }

    setIsSubmitting(true);
    try {
      const payload = buildPayload(form, applyModelBaseItems);
      const res = await apiFetch("/generators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao cadastrar equipamento."),
        );
      }

      const created = (await res.json()) as { id: string };
      router.push(`/dashboard/equipments/${created.id}`);
      router.refresh();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao cadastrar equipamento.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Cadastro mestre tecnico
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              Novo equipamento
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Organize identificacao, dados do gerador, motor, alternador, QTA
              e bateria sem depender de planilhas paralelas.
            </p>
          </div>
        </div>
      </header>

      {loading ? <State text="Carregando dados de apoio..." /> : null}
      {error ? <State text={error} tone="error" /> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <EditSection title="1. Identificacao e vinculos">
          <Field label="Cliente">
            <select
              value={form.clientId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  clientId: event.target.value,
                  currentSiteId: "",
                }))
              }
              className={INPUT_CLASS}
              required
            >
              <option value="">Selecione</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName} {client.cnpj ? `(${client.cnpj})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Local/site">
            <select
              value={form.currentSiteId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, currentSiteId: event.target.value }))
              }
              className={INPUT_CLASS}
            >
              <option value="">Sem local estruturado</option>
              {filteredSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} {site.code ? `(${site.code})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <TextField label="Nome/apelido" field="name" form={form} setForm={setForm} required />
          <ManufacturerField
            label="Fabricante"
            field="brand"
            form={form}
            setForm={setForm}
            manufacturers={generatorManufacturers}
            listId="generator-manufacturer-options"
            required
          />
          <Field label="Modelo">
            <select
              value={form.modelId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, modelId: event.target.value }))
              }
              className={INPUT_CLASS}
            >
              <option value="">Sem modelo cadastrado</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.brand ? `${model.brand} - ` : ""}
                  {model.name}
                </option>
              ))}
            </select>
          </Field>
          <TextField label="Numero de serie" field="serialNumber" form={form} setForm={setForm} />
          <TextField label="Tag patrimonial" field="assetTag" form={form} setForm={setForm} />
          <NumberField label="Potencia kVA" field="power" form={form} setForm={setForm} required />
          <NumberField label="Horimetro atual" field="hourMeter" form={form} setForm={setForm} />
          <SelectField label="Status operacional" field="operationalStatus" form={form} setForm={setForm} options={OPERATIONAL_STATUS_OPTIONS} />
          <SelectField label="Ciclo de vida" field="lifecycleStatus" form={form} setForm={setForm} options={LIFECYCLE_STATUS_OPTIONS} />
          <SelectField label="Criticidade" field="criticality" form={form} setForm={setForm} options={CRITICALITY_OPTIONS} />
          <ControlOptionField
            label="Aplicacao"
            field="application"
            form={form}
            setForm={setForm}
            options={controlOptions.applications}
            listId="equipment-application-options"
            valueMode="name"
          />
        </EditSection>

        {selectedModel ? (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-bold">Base tecnica do modelo: {selectedModel.name}</p>
            <p className="mt-1">
              {groupedModelBase.length
                ? `Itens por grupo: ${groupedModelBase
                    .map(([group, count]) => `${group}: ${count}`)
                    .join(" | ")}`
                : "Este modelo ainda nao possui itens base."}
            </p>
            <label className="mt-3 inline-flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={applyModelBaseItems}
                onChange={(event) => setApplyModelBaseItems(event.target.checked)}
              />
              Copiar itens base do modelo ao salvar
            </label>
          </section>
        ) : null}

        <EditSection title="2. Dados do gerador">
          <TextField label="Local de instalacao livre" field="installationSite" form={form} setForm={setForm} />
          <TextField label="Tensao" field="voltage" form={form} setForm={setForm} />
          <TextField label="Corrente" field="ratedCurrent" form={form} setForm={setForm} />
          <NumberField label="Fator de potencia" field="powerFactor" form={form} setForm={setForm} step="0.01" />
          <NumberField label="Frequencia Hz" field="frequencyHz" form={form} setForm={setForm} />
          <NumberField label="Ano de fabricacao" field="manufactureYear" form={form} setForm={setForm} />
          <DateField label="Data de instalacao" field="installationDate" form={form} setForm={setForm} />
          <DateField label="Garantia ate" field="warrantyEndDate" form={form} setForm={setForm} />
          <ControlOptionField
            label="Regime de operacao"
            field="operationMode"
            form={form}
            setForm={setForm}
            options={controlOptions.operationModes}
            listId="equipment-operation-mode-options"
            valueMode="name"
          />
        </EditSection>

        <EditSection title="3. Motor">
          <ManufacturerField
            label="Fabricante"
            field="engineBrand"
            form={form}
            setForm={setForm}
            manufacturers={engineManufacturers}
            listId="engine-manufacturer-options"
          />
          <TextField label="Modelo" field="engineModelName" form={form} setForm={setForm} />
          <TextField label="Numero de serie" field="engineSerialNumber" form={form} setForm={setForm} />
          <TextField label="Potencia" field="enginePower" form={form} setForm={setForm} />
          <TextField label="Combustivel" field="fuelType" form={form} setForm={setForm} />
          <NumberField label="Cilindros" field="engineCylinders" form={form} setForm={setForm} />
          <TextField label="Oleo recomendado" field="oilRecommendation" form={form} setForm={setForm} />
          <NumberField label="Capacidade de oleo (L)" field="oilCapacityLiters" form={form} setForm={setForm} step="0.1" />
          <DateField label="Ultima troca de oleo" field="lastOilChangeAt" form={form} setForm={setForm} />
        </EditSection>

        <EditSection title="4. Alternador">
          <ManufacturerField
            label="Fabricante"
            field="alternatorBrand"
            form={form}
            setForm={setForm}
            manufacturers={alternatorManufacturers}
            listId="alternator-manufacturer-options"
          />
          <TextField label="Modelo" field="alternatorModelName" form={form} setForm={setForm} />
          <TextField label="Numero de serie" field="alternatorSerialNumber" form={form} setForm={setForm} />
          <TextField label="Tensao" field="alternatorVoltage" form={form} setForm={setForm} />
          <NumberField label="Frequencia Hz" field="alternatorFrequencyHz" form={form} setForm={setForm} />
          <TextField label="Classe de isolacao" field="alternatorInsulationClass" form={form} setForm={setForm} />
          <TextField label="Grau de protecao" field="alternatorProtectionDegree" form={form} setForm={setForm} />
        </EditSection>

        <EditSection title="5. QTA, bateria e observacoes">
          <SelectField label="Possui QTA" field="hasTransferSwitch" form={form} setForm={setForm} options={BOOLEAN_OPTIONS} />
          <ManufacturerField
            label="QTA fabricante"
            field="transferSwitchBrand"
            form={form}
            setForm={setForm}
            manufacturers={transferSwitchManufacturers}
            listId="transfer-switch-manufacturer-options"
          />
          <TextField label="QTA modelo" field="transferSwitchModel" form={form} setForm={setForm} />
          <TextField label="QTA serie" field="transferSwitchSerialNumber" form={form} setForm={setForm} />
          <TextField label="Corrente nominal" field="transferSwitchRatedCurrent" form={form} setForm={setForm} />
          <TextField label="Tensao comando" field="transferSwitchCommandVoltage" form={form} setForm={setForm} />
          <TextField label="Tipo transferencia" field="transferSwitchType" form={form} setForm={setForm} />
          <NumberField label="Quantidade baterias" field="batteryQuantity" form={form} setForm={setForm} />
          <TextField label="Tensao bateria" field="batteryVoltage" form={form} setForm={setForm} />
          <NumberField label="Capacidade Ah" field="batteryCapacityAh" form={form} setForm={setForm} step="0.1" />
          <DateField label="Instalacao bateria" field="batteryInstallationDate" form={form} setForm={setForm} />
          <TextField label="Carregador" field="batteryChargerModel" form={form} setForm={setForm} />
          <DateField label="Ultima substituicao" field="batteryLastReplacementDate" form={form} setForm={setForm} />
          <TextAreaField label="Observacoes gerais" field="notes" form={form} setForm={setForm} />
        </EditSection>

        <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-end gap-2 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <Link href="/dashboard/equipments" className={SECONDARY_BUTTON}>
            Cancelar
          </Link>
          <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON}>
            {isSubmitting ? "Salvando..." : "Cadastrar equipamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100";

const OPERATIONAL_STATUS_OPTIONS = [
  ["OPERATING", "Operando"],
  ["STOPPED_BY_FAILURE", "Parado por falha"],
  ["IN_MAINTENANCE", "Em manutencao"],
  ["DEACTIVATED", "Desativado"],
] as const;
const LIFECYCLE_STATUS_OPTIONS = [
  ["AVAILABLE", "Disponivel"],
  ["LEASED", "Locado"],
  ["IN_MAINTENANCE", "Em manutencao"],
  ["SCRAP", "Sucata"],
] as const;
const CRITICALITY_OPTIONS = [
  ["A", "A - Critico"],
  ["B", "B - Relevante"],
  ["C", "C - Baixo impacto"],
] as const;
const BOOLEAN_OPTIONS = [
  ["", "Nao informado"],
  ["true", "Sim"],
  ["false", "Nao"],
] as const;

function EditSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-950">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function TextField({
  label,
  field,
  form,
  setForm,
  required,
}: FieldProps & { required?: boolean }) {
  return (
    <Field label={label}>
      <input
        data-testid={`equipment-field-${field}`}
        value={form[field] || ""}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        required={required}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

function ManufacturerField({
  label,
  field,
  form,
  setForm,
  manufacturers,
  listId,
  required,
}: FieldProps & {
  manufacturers: ManufacturerRow[];
  listId: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        data-testid={`equipment-field-${field}`}
        value={form[field] || ""}
        list={listId}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        required={required}
        className={INPUT_CLASS}
      />
      <datalist id={listId}>
        {manufacturers.map((manufacturer) => (
          <option
            key={manufacturer.id}
            value={manufacturer.name}
            label={manufacturer.type || undefined}
          />
        ))}
      </datalist>
    </Field>
  );
}

function ControlOptionField({
  label,
  field,
  form,
  setForm,
  options,
  listId,
  valueMode,
}: FieldProps & {
  options: ControlOption[];
  listId: string;
  valueMode: "code" | "name";
}) {
  return (
    <Field label={label}>
      <input
        data-testid={`equipment-field-${field}`}
        value={form[field] || ""}
        list={listId}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        className={INPUT_CLASS}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option
            key={option.id}
            value={valueMode === "code" ? option.code : option.name}
            label={optionLabel(option)}
          />
        ))}
      </datalist>
    </Field>
  );
}

function NumberField({
  label,
  field,
  form,
  setForm,
  step = "1",
  required,
}: FieldProps & { step?: string; required?: boolean }) {
  return (
    <Field label={label}>
      <input
        data-testid={`equipment-field-${field}`}
        type="number"
        min="0"
        step={step}
        value={form[field] || ""}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        required={required}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

function DateField({ label, field, form, setForm }: FieldProps) {
  return (
    <Field label={label}>
      <input
        data-testid={`equipment-field-${field}`}
        type="date"
        value={form[field] || ""}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

function SelectField({
  label,
  field,
  form,
  setForm,
  options,
}: FieldProps & { options: ReadonlyArray<readonly [string, string]> }) {
  return (
    <Field label={label}>
      <select
        data-testid={`equipment-field-${field}`}
        value={form[field] || ""}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        className={INPUT_CLASS}
      >
        {options.map(([value, optionLabel]) => (
          <option key={value || "empty"} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </Field>
  );
}

function TextAreaField({ label, field, form, setForm }: FieldProps) {
  return (
    <Field label={label}>
      <textarea
        data-testid={`equipment-field-${field}`}
        value={form[field] || ""}
        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
        className={`${INPUT_CLASS} min-h-28 resize-y`}
      />
    </Field>
  );
}

type FieldProps = {
  label: string;
  field: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}

function buildPayload(form: FormState, applyModelBaseItems: boolean) {
  const payload: Record<string, unknown> = {
    clientId: form.clientId,
    currentSiteId: form.currentSiteId || undefined,
    modelId: form.modelId || undefined,
    name: form.name.trim(),
    brand: form.brand.trim(),
    operationalStatus: form.operationalStatus || "OPERATING",
    lifecycleStatus: form.lifecycleStatus || "AVAILABLE",
    criticality: form.criticality || "B",
    hasMaintenanceContract: form.hasMaintenanceContract === "true",
    hasTransferSwitch:
      form.hasTransferSwitch === "" ? undefined : form.hasTransferSwitch === "true",
    applyModelBaseItems,
  };

  for (const field of TEXT_FIELDS) {
    const value = emptyToUndefined(form[field]);
    if (value !== undefined) payload[field] = value;
  }
  for (const field of NUMBER_FIELDS) {
    const value = numberOrUndefined(form[field]);
    if (value !== undefined) payload[field] = value;
  }
  for (const field of DATE_FIELDS) {
    const value = emptyToUndefined(form[field]);
    if (value !== undefined) payload[field] = value;
  }

  return payload;
}

function emptyToUndefined(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : undefined;
}

function numberOrUndefined(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
