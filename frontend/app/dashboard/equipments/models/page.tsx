"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";

type ServiceGroup = "TOF" | "TM" | "TB" | "TMA" | "OUTROS";
type MaintenanceCategory =
  | "OIL"
  | "FILTER"
  | "BATTERY"
  | "SPARK_PLUG"
  | "INSPECTION"
  | "TEST"
  | "CLEANING"
  | "ELECTRICAL"
  | "MECHANICAL"
  | "OTHER";
type IntervalUnit = "DAYS" | "MONTHS" | "YEARS";

type CatalogItem = { id: string; name: string; type: string; basePrice: number };
type ModelBaseItem = {
  catalogItemId: string;
  serviceGroup: ServiceGroup;
  defaultQuantity: number;
};
type ModelMaintenanceTemplate = {
  id?: string;
  name: string;
  description?: string | null;
  category: MaintenanceCategory;
  intervalValue?: number | null;
  intervalUnit?: IntervalUnit | null;
  hourMeterInterval?: number | null;
  required: boolean;
  active: boolean;
  sortOrder: number;
  notes?: string | null;
};
type ModelRow = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  defaultPowerKva?: number | null;
  defaultPowerKw?: number | null;
  defaultVoltage?: string | null;
  frequencyHz?: number | null;
  controllerType?: string | null;
  engineModel?: string | null;
  alternatorModel?: string | null;
  defaultFuelConsumption?: string | null;
  defaultTankCapacity?: string | null;
  description?: string | null;
  isActive?: boolean | null;
  notes?: string | null;
  baseItems?: Array<{
    id: string;
    catalogItemId?: string;
    serviceGroup: ServiceGroup;
    defaultQuantity: number;
    catalogItem: { id: string; name: string };
  }>;
  maintenanceTemplates?: ModelMaintenanceTemplate[];
};

type ModelForm = {
  name: string;
  brand: string;
  category: string;
  defaultPowerKva: string;
  defaultPowerKw: string;
  defaultVoltage: string;
  frequencyHz: string;
  controllerType: string;
  engineModel: string;
  alternatorModel: string;
  defaultFuelConsumption: string;
  defaultTankCapacity: string;
  description: string;
  isActive: boolean;
  notes: string;
  baseItems: ModelBaseItem[];
  maintenanceTemplates: Array<
    Omit<
      ModelMaintenanceTemplate,
      "intervalValue" | "hourMeterInterval" | "sortOrder"
    > & {
      intervalValue: string;
      hourMeterInterval: string;
      sortOrder: string;
    }
  >;
};

const GROUPS: ServiceGroup[] = ["TOF", "TM", "TB", "TMA", "OUTROS"];
const CATEGORY_OPTIONS: Array<{ value: MaintenanceCategory; label: string }> = [
  { value: "OIL", label: "Oleo" },
  { value: "FILTER", label: "Filtro" },
  { value: "BATTERY", label: "Bateria" },
  { value: "SPARK_PLUG", label: "Velas" },
  { value: "INSPECTION", label: "Inspecao" },
  { value: "TEST", label: "Teste" },
  { value: "CLEANING", label: "Limpeza" },
  { value: "ELECTRICAL", label: "Eletrico" },
  { value: "MECHANICAL", label: "Mecanico" },
  { value: "OTHER", label: "Outro" },
];
const UNIT_OPTIONS: Array<{ value: IntervalUnit; label: string }> = [
  { value: "DAYS", label: "dias" },
  { value: "MONTHS", label: "meses" },
  { value: "YEARS", label: "anos" },
];
const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function emptyForm(): ModelForm {
  return {
    name: "",
    brand: "",
    category: "",
    defaultPowerKva: "",
    defaultPowerKw: "",
    defaultVoltage: "",
    frequencyHz: "",
    controllerType: "",
    engineModel: "",
    alternatorModel: "",
    defaultFuelConsumption: "",
    defaultTankCapacity: "",
    description: "",
    isActive: true,
    notes: "",
    baseItems: [],
    maintenanceTemplates: [],
  };
}

function asText(value: unknown) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function toForm(model: ModelRow): ModelForm {
  return {
    name: model.name || "",
    brand: model.brand || "",
    category: model.category || "",
    defaultPowerKva: asText(model.defaultPowerKva),
    defaultPowerKw: asText(model.defaultPowerKw),
    defaultVoltage: model.defaultVoltage || "",
    frequencyHz: asText(model.frequencyHz),
    controllerType: model.controllerType || "",
    engineModel: model.engineModel || "",
    alternatorModel: model.alternatorModel || "",
    defaultFuelConsumption: model.defaultFuelConsumption || "",
    defaultTankCapacity: model.defaultTankCapacity || "",
    description: model.description || "",
    isActive: model.isActive !== false,
    notes: model.notes || "",
    baseItems:
      model.baseItems?.map((item) => ({
        catalogItemId: item.catalogItemId || item.catalogItem?.id || "",
        serviceGroup: item.serviceGroup,
        defaultQuantity: item.defaultQuantity || 1,
      })) || [],
    maintenanceTemplates:
      model.maintenanceTemplates?.map((item, index) => ({
        id: item.id,
        name: item.name || "",
        description: item.description || "",
        category: item.category || "OTHER",
        intervalValue: asText(item.intervalValue),
        intervalUnit: item.intervalUnit || "MONTHS",
        hourMeterInterval: asText(item.hourMeterInterval),
        required: item.required !== false,
        active: item.active !== false,
        sortOrder: asText(item.sortOrder ?? index),
        notes: item.notes || "",
      })) || [],
  };
}

function cleanText(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function describeMaintenance(item: ModelMaintenanceTemplate) {
  const time =
    item.intervalValue && item.intervalUnit
      ? `${item.intervalValue} ${UNIT_OPTIONS.find((unit) => unit.value === item.intervalUnit)?.label || ""}`
      : "";
  const hours = item.hourMeterInterval ? `${item.hourMeterInterval} h` : "";
  if (time && hours) return `${time} ou ${hours}`;
  return time || hours || "conforme criterio tecnico";
}

export default function EquipmentModelsPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [form, setForm] = useState<ModelForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [canManageModels, setCanManageModels] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCanManageModels(getAccessFromToken().equipments.manageModels);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [catalogRes, modelsRes] = await Promise.all([
        apiFetch("/catalogs"),
        apiFetch("/generators/models"),
      ]);
      if (catalogRes.ok) setCatalog((await catalogRes.json()) as CatalogItem[]);
      if (modelsRes.ok) setModels((await modelsRes.json()) as ModelRow[]);
    } catch {
      setError("Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(patch: Partial<ModelForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function addBaseItem() {
    updateForm({
      baseItems: [
        ...form.baseItems,
        { catalogItemId: "", serviceGroup: "OUTROS", defaultQuantity: 1 },
      ],
    });
  }

  function updateBaseItem(index: number, patch: Partial<ModelBaseItem>) {
    updateForm({
      baseItems: form.baseItems.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function removeBaseItem(index: number) {
    updateForm({ baseItems: form.baseItems.filter((_, i) => i !== index) });
  }

  function addMaintenanceItem() {
    updateForm({
      maintenanceTemplates: [
        ...form.maintenanceTemplates,
        {
          name: "",
          description: "",
          category: "INSPECTION",
          intervalValue: "",
          intervalUnit: "MONTHS",
          hourMeterInterval: "",
          required: true,
          active: true,
          sortOrder: String(form.maintenanceTemplates.length + 1),
          notes: "",
        },
      ],
    });
  }

  function updateMaintenanceItem(
    index: number,
    patch: Partial<ModelForm["maintenanceTemplates"][number]>,
  ) {
    updateForm({
      maintenanceTemplates: form.maintenanceTemplates.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function toggleMaintenanceItem(index: number) {
    const item = form.maintenanceTemplates[index];
    if (!item) return;
    if (!item.id) {
      updateForm({
        maintenanceTemplates: form.maintenanceTemplates.filter((_, i) => i !== index),
      });
      return;
    }
    updateMaintenanceItem(index, { active: !item.active });
  }

  async function startEdit(model: ModelRow) {
    if (!canManageModels) return;
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch(`/generators/models/${model.id}`);
      const detail = res.ok ? ((await res.json()) as ModelRow) : model;
      setEditingId(detail.id);
      setForm(toForm(detail));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setEditingId(model.id);
      setForm(toForm(model));
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setSuccess("");
  }

  async function saveModel(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageModels) {
      setError("Seu perfil nao pode editar modelos de geradores.");
      return;
    }
    if (!form.name.trim()) {
      setError("Informe o nome do modelo.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: form.name.trim(),
        brand: cleanText(form.brand),
        category: cleanText(form.category),
        defaultPowerKva: optionalNumber(form.defaultPowerKva),
        defaultPowerKw: optionalNumber(form.defaultPowerKw),
        defaultVoltage: cleanText(form.defaultVoltage),
        frequencyHz: optionalNumber(form.frequencyHz),
        controllerType: cleanText(form.controllerType),
        engineModel: cleanText(form.engineModel),
        alternatorModel: cleanText(form.alternatorModel),
        defaultFuelConsumption: cleanText(form.defaultFuelConsumption),
        defaultTankCapacity: cleanText(form.defaultTankCapacity),
        description: cleanText(form.description),
        isActive: form.isActive,
        notes: cleanText(form.notes),
        baseItems: form.baseItems.filter((it) => it.catalogItemId),
        maintenanceTemplates: form.maintenanceTemplates
          .filter((item) => item.id || item.name.trim())
          .map((item, index) => ({
            id: item.id,
            name: item.name.trim(),
            description: cleanText(item.description || ""),
            category: item.category,
            intervalValue: optionalNumber(item.intervalValue),
            intervalUnit: item.intervalValue.trim()
              ? item.intervalUnit || "MONTHS"
              : undefined,
            hourMeterInterval: optionalNumber(item.hourMeterInterval),
            required: item.required,
            active: item.active,
            sortOrder: optionalNumber(item.sortOrder) ?? index,
            notes: cleanText(item.notes || ""),
          })),
      };

      const res = await apiFetch(
        editingId ? `/generators/models/${editingId}` : "/generators/models",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao salvar modelo."));
      }

      const successMessage = editingId
        ? "Modelo atualizado com plano de manutencao."
        : "Modelo cadastrado com plano de manutencao.";
      resetForm();
      setSuccess(successMessage);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  const catalogOptions = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Cadastro mestre tecnico
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            Modelos de Geradores
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Configure dados padrao do modelo e recomendacoes de manutencao para
            apoiar contratos, preventivas e OS futuras.
          </p>
        </div>
        <Link
          href="/dashboard/equipments/new"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Voltar para Novo Equipamento
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {canManageModels ? (
        <form
          onSubmit={saveModel}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? "Editar modelo" : "Novo modelo"}
              </h2>
              <p className="text-sm text-slate-500">
                O plano abaixo e uma recomendacao padrao; ele nao gera OS
                automaticamente neste ciclo.
              </p>
            </div>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar edicao
              </button>
            ) : null}
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
              Dados do modelo
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Fabricante">
                <input value={form.brand} onChange={(e) => updateForm({ brand: e.target.value })} className={INPUT_CLASS} placeholder="STEMAC" />
              </Field>
              <Field label="Modelo">
                <input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className={INPUT_CLASS} placeholder="180 kVA" required />
              </Field>
              <Field label="Potencia kVA">
                <input value={form.defaultPowerKva} onChange={(e) => updateForm({ defaultPowerKva: e.target.value })} className={INPUT_CLASS} inputMode="decimal" placeholder="180" />
              </Field>
              <Field label="Potencia kW">
                <input value={form.defaultPowerKw} onChange={(e) => updateForm({ defaultPowerKw: e.target.value })} className={INPUT_CLASS} inputMode="decimal" placeholder="144" />
              </Field>
              <Field label="Tensao">
                <input value={form.defaultVoltage} onChange={(e) => updateForm({ defaultVoltage: e.target.value })} className={INPUT_CLASS} placeholder="380/220 V" />
              </Field>
              <Field label="Frequencia">
                <input value={form.frequencyHz} onChange={(e) => updateForm({ frequencyHz: e.target.value })} className={INPUT_CLASS} inputMode="numeric" placeholder="60" />
              </Field>
              <Field label="Tipo">
                <input value={form.category} onChange={(e) => updateForm({ category: e.target.value })} className={INPUT_CLASS} placeholder="Diesel, standby..." />
              </Field>
              <Field label="Status">
                <select value={form.isActive ? "ACTIVE" : "INACTIVE"} onChange={(e) => updateForm({ isActive: e.target.value === "ACTIVE" })} className={INPUT_CLASS}>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </Field>
              <Field label="Controlador">
                <input value={form.controllerType} onChange={(e) => updateForm({ controllerType: e.target.value })} className={INPUT_CLASS} placeholder="Deep Sea, ComAp..." />
              </Field>
              <Field label="Motor">
                <input value={form.engineModel} onChange={(e) => updateForm({ engineModel: e.target.value })} className={INPUT_CLASS} placeholder="Cummins QSB6.7" />
              </Field>
              <Field label="Alternador">
                <input value={form.alternatorModel} onChange={(e) => updateForm({ alternatorModel: e.target.value })} className={INPUT_CLASS} placeholder="Stamford..." />
              </Field>
              <Field label="Tanque">
                <input value={form.defaultTankCapacity} onChange={(e) => updateForm({ defaultTankCapacity: e.target.value })} className={INPUT_CLASS} placeholder="250 L" />
              </Field>
              <Field label="Consumo" className="md:col-span-2">
                <input value={form.defaultFuelConsumption} onChange={(e) => updateForm({ defaultFuelConsumption: e.target.value })} className={INPUT_CLASS} placeholder="Litros/h conforme carga" />
              </Field>
              <Field label="Descricao" className="md:col-span-2">
                <input value={form.description} onChange={(e) => updateForm({ description: e.target.value })} className={INPUT_CLASS} placeholder="Aplicacao recomendada e observacoes comerciais" />
              </Field>
              <Field label="Observacoes" className="md:col-span-2 xl:col-span-4">
                <textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} className={`${INPUT_CLASS} min-h-20`} placeholder="Notas tecnicas do modelo" />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                  Plano de Manutencao Recomendado
                </h3>
                <p className="text-sm text-slate-500">
                  Cadastre recomendacoes como oleo, filtros, bateria, testes e
                  inspecoes.
                </p>
              </div>
              <button
                type="button"
                onClick={addMaintenanceItem}
                className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Adicionar item
              </button>
            </div>

            <div className="space-y-3">
              {form.maintenanceTemplates.map((item, idx) => (
                <div key={item.id || idx} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
                    <input aria-label={`Nome do item de manutencao ${idx + 1}`} value={item.name} onChange={(e) => updateMaintenanceItem(idx, { name: e.target.value })} className={`${INPUT_CLASS} xl:col-span-2`} placeholder="Troca de oleo" />
                    <select aria-label={`Tipo do item de manutencao ${idx + 1}`} value={item.category} onChange={(e) => updateMaintenanceItem(idx, { category: e.target.value as MaintenanceCategory })} className={INPUT_CLASS}>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input aria-label={`Intervalo por tempo ${idx + 1}`} value={item.intervalValue} onChange={(e) => updateMaintenanceItem(idx, { intervalValue: e.target.value })} className={INPUT_CLASS} inputMode="numeric" placeholder="6" />
                    <select aria-label={`Unidade de tempo ${idx + 1}`} value={item.intervalUnit || "MONTHS"} onChange={(e) => updateMaintenanceItem(idx, { intervalUnit: e.target.value as IntervalUnit })} className={INPUT_CLASS}>
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input aria-label={`Intervalo por horimetro ${idx + 1}`} value={item.hourMeterInterval} onChange={(e) => updateMaintenanceItem(idx, { hourMeterInterval: e.target.value })} className={INPUT_CLASS} inputMode="numeric" placeholder="250 h" />
                    <input aria-label={`Descricao do item de manutencao ${idx + 1}`} value={item.description || ""} onChange={(e) => updateMaintenanceItem(idx, { description: e.target.value })} className={`${INPUT_CLASS} md:col-span-2 xl:col-span-3`} placeholder="Descricao ou recomendacao tecnica" />
                    <input aria-label={`Observacoes do item de manutencao ${idx + 1}`} value={item.notes || ""} onChange={(e) => updateMaintenanceItem(idx, { notes: e.target.value })} className={`${INPUT_CLASS} md:col-span-2`} placeholder="Observacoes" />
                    <input aria-label={`Ordem do item de manutencao ${idx + 1}`} value={item.sortOrder} onChange={(e) => updateMaintenanceItem(idx, { sortOrder: e.target.value })} className={INPUT_CLASS} inputMode="numeric" placeholder="Ordem" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 text-slate-600">
                      <input type="checkbox" checked={item.required} onChange={(e) => updateMaintenanceItem(idx, { required: e.target.checked })} />
                      Obrigatorio
                    </label>
                    <span className={item.active ? "text-emerald-700" : "text-slate-500"}>
                      {item.active ? "Ativo" : "Inativo"}
                    </span>
                    <button type="button" onClick={() => toggleMaintenanceItem(idx)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
                      {item.active ? "Inativar" : "Reativar"}
                    </button>
                  </div>
                </div>
              ))}
              {form.maintenanceTemplates.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Nenhum item de manutencao recomendado neste modelo.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                  Itens base de pecas/servicos
                </h3>
                <p className="text-sm text-slate-500">
                  Mantem o vinculo ja existente entre modelo e catalogo.
                </p>
              </div>
              <button
                type="button"
                onClick={addBaseItem}
                className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Adicionar item base
              </button>
            </div>

            {form.baseItems.length > 0 ? (
              <div className="space-y-2">
                {form.baseItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-4">
                    <select value={item.catalogItemId} onChange={(e) => updateBaseItem(idx, { catalogItemId: e.target.value })} className={INPUT_CLASS}>
                      <option value="">Item de catalogo</option>
                      {catalogOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                    <select value={item.serviceGroup} onChange={(e) => updateBaseItem(idx, { serviceGroup: e.target.value as ServiceGroup })} className={INPUT_CLASS}>
                      {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                    <input type="number" min={1} value={item.defaultQuantity} onChange={(e) => updateBaseItem(idx, { defaultQuantity: Number(e.target.value || 1) })} className={INPUT_CLASS} />
                    <button type="button" onClick={() => removeBaseItem(idx)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700 hover:bg-red-100">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Nenhum item base definido.
              </p>
            )}
          </section>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Salvar modelo"}
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Seu perfil permite consultar modelos, mas nao editar dados tecnicos ou
          plano de manutencao.
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-bold text-slate-900">Modelos cadastrados</h2>
          <p className="text-sm text-slate-500">
            Lista com resumo tecnico e quantidade de recomendacoes cadastradas.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Carregando modelos...</p>
        ) : models.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum modelo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Fabricante / modelo</th>
                  <th className="px-3 py-3">Potencia</th>
                  <th className="px-3 py-3">Tensao</th>
                  <th className="px-3 py-3">Frequencia</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Plano</th>
                  <th className="px-3 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.map((model) => {
                  const activePlan =
                    model.maintenanceTemplates?.filter((item) => item.active !== false) || [];
                  return (
                    <tr key={model.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">
                          {model.brand ? `${model.brand} - ` : ""}{model.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {model.category || model.description || "Sem descricao tecnica"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {model.defaultPowerKva ? `${model.defaultPowerKva} kVA` : "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {model.defaultVoltage || "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {model.frequencyHz ? `${model.frequencyHz} Hz` : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={model.isActive === false ? "rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600" : "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"}>
                          {model.isActive === false ? "Inativo" : "Ativo"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{activePlan.length} recomendacoes</p>
                        {activePlan.slice(0, 2).map((item) => (
                          <p key={item.id || item.name} className="mt-1 text-xs text-slate-500">
                            {item.name} - {describeMaintenance(item)}
                          </p>
                        ))}
                      </td>
                      <td className="px-3 py-3">
                        {canManageModels ? (
                          <button
                            type="button"
                            onClick={() => void startEdit(model)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Editar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Somente leitura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
