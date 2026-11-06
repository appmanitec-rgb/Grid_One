"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SelectField } from "../../components/SelectField";
import { InlineMessage, SectionCard } from "../../components/DashboardPageKit";
import {
  allowed,
  buttonClass,
  Field,
  inputClass,
  Lookup,
  money,
  origins,
  request,
  secondaryClass,
  Status,
} from "./shared";
import type { Approval, Rule } from "./types";
export function Approvals() {
  const [items, setItems] = useState<Approval[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      setItems(await request<Approval[]>("/purchasing/approvals"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha nas aprovações.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(id: string, decision: string) {
    if (!window.confirm("Confirmar esta decisão de compra?")) return;
    setBusy(true);
    setError("");
    try {
      await request("/purchasing/approvals/" + id + "/" + decision, {
        decisionNote: reason || undefined,
      });
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na decisão.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="Fila de aprovações de compras"
      description="A decisão preserva as condições submetidas, o aprovador e a data."
    >
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <Field label="Justificativa da decisão">
        <textarea
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Obrigatória para reprovar ou solicitar revisão."
        />
      </Field>
      <div className="mt-4 space-y-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {item.requestPayload?.quoteCode ?? "Cotação"} ·{" "}
                  {item.requestPayload?.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {item.requesterUser?.name} → {item.approverUser?.name}
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {money(item.requestPayload?.total)}
                </p>
              </div>
              <Status value={item.status} />
            </div>
            {item.requestPayload?.selections?.map((selection) => (
              <p key={selection.id} className="text-sm text-slate-600">
                {selection.offerItem.description} ·{" "}
                {selection.offerItem.offer.supplier.companyName} ·{" "}
                {selection.justification}
              </p>
            ))}
            {item.decisionNote ? (
              <p className="text-sm text-slate-600">{item.decisionNote}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {allowed("purchaseQuotations") ? (
                <Link
                  className={secondaryClass}
                  href={
                    "/dashboard/purchase-orders/quotations/" + item.entityId
                  }
                >
                  Abrir comparativo
                </Link>
              ) : null}
              {item.status === "PENDING" &&
              allowed("purchasingApprovals", "approve") ? (
                <>
                  {[
                    ["approve", "Aprovar condições"],
                    ["request-adjustments", "Solicitar revisão"],
                    ["reject", "Reprovar"],
                  ].map(([decision, label]) => (
                    <button
                      key={decision}
                      className={
                        decision === "approve" ? buttonClass : secondaryClass
                      }
                      disabled={
                        busy || (decision !== "approve" && !reason.trim())
                      }
                      onClick={() => void decide(item.id, decision)}
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </article>
        ))}
        {loading ? (
          <p className="py-5 text-sm text-slate-500">
            Carregando aprovações...
          </p>
        ) : !items.length ? (
          <p className="py-5 text-sm text-slate-500">
            Nenhuma aprovação disponível para este perfil.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
const emptyRule: Rule = {
  name: "",
  active: true,
  minAmount: 0,
  minimumOffers: 1,
  approverUserId: "",
};
export function Settings({
  enabled,
  configured,
  onConfigured,
}: {
  enabled: boolean;
  configured: boolean;
  onConfigured: (enabled: boolean) => void;
}) {
  const [items, setItems] = useState<Rule[]>([]),
    [form, setForm] = useState<Rule>(emptyRule),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      setItems(await request<Rule[]>("/purchasing/rules"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha nas regras.");
    }
  }
  useEffect(() => {
    if (configured) void load();
  }, [configured]);
  async function activate() {
    if (
      !window.confirm(
        enabled
          ? "Desativar a criação no novo fluxo? Os documentos e títulos existentes serão mantidos."
          : "Ativar a nova experiência de compras neste ambiente?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request("/purchasing/settings", { enabled: !enabled }, "PATCH");
      onConfigured(!enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na ativação.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        name: form.name,
        active: form.active,
        minAmount: Number(form.minAmount),
        maxAmount:
          form.maxAmount === undefined || form.maxAmount === ""
            ? undefined
            : Number(form.maxAmount),
        department: form.department || undefined,
        origin: form.origin || undefined,
        priority: form.priority || undefined,
        costCenterId: form.costCenterId || undefined,
        itemType: form.itemType || undefined,
        minimumOffers: Number(form.minimumOffers),
        approverUserId: form.approverUserId,
      };
      await request(
        "/purchasing/rules" + (form.id ? "/" + form.id : ""),
        body,
        form.id ? "PATCH" : "POST",
      );
      setForm({ ...emptyRule });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar a regra.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <SectionCard
        title="Ativação controlada"
        description="Os pedidos manuais legados continuam disponíveis. Desativar conserva os registros e obrigações."
      >
        <p className="text-sm text-slate-600">
          {configured
            ? enabled
              ? "A nova experiência está ativa neste ambiente."
              : "A nova experiência está desativada neste ambiente."
            : "A migração aditiva precisa ser aplicada antes da ativação."}
        </p>
        {allowed("purchasingSettings", "configure") ? (
          <button
            className={buttonClass + " mt-4"}
            disabled={busy || !configured}
            onClick={() => void activate()}
          >
            {enabled ? "Desativar nova experiência" : "Ativar nova experiência"}
          </button>
        ) : null}
      </SectionCard>
      <SectionCard
        title="Alçadas e condições de aprovação"
        description="Regras correspondentes são cumulativas. Sem regra aplicável, a compra segue para um administrador ativo."
      >
        <div className="space-y-3">
          {items.map((rule) => (
            <article
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
            >
              <div>
                <h3 className="font-semibold text-slate-900">
                  {rule.name} · {rule.active ? "Ativa" : "Inativa"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {money(rule.minAmount)} até{" "}
                  {rule.maxAmount ? money(rule.maxAmount) : "sem limite"} ·{" "}
                  {rule.minimumOffers} proposta(s) ·{" "}
                  {rule.department || "Todos os departamentos"}
                </p>
              </div>
              {allowed("purchasingSettings", "configure") ? (
                <button
                  className={secondaryClass}
                  onClick={() => setForm(rule)}
                >
                  Editar regra
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </SectionCard>
      {allowed("purchasingSettings", "configure") ? (
        <SectionCard
          title={form.id ? "Editar regra" : "Nova regra de aprovação"}
        >
          <fieldset disabled={busy || !configured} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Nome da regra">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              {(
                [
                  ["minAmount", "Valor mínimo"],
                  ["maxAmount", "Valor máximo"],
                  ["minimumOffers", "Quantidade mínima de propostas"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    step={key === "minimumOffers" ? "1" : "0.01"}
                    min={key === "minimumOffers" ? "1" : "0"}
                    className={inputClass}
                    value={form[key] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]:
                          key === "minimumOffers"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="Departamento" hint="Vazio considera todos.">
                <input
                  className={inputClass}
                  value={form.department ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                />
              </Field>
              <Field label="Natureza / origem">
                <SelectField
                  className={inputClass}
                  value={form.origin ?? ""}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                >
                  <option value="">Todas</option>
                  {Object.entries(origins).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Prioridade">
                <SelectField
                  className={inputClass}
                  value={form.priority ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  <option value="">Todas</option>
                  {[
                    ["NORMAL", "Normal"],
                    ["HIGH", "Alta"],
                    ["EMERGENCY", "Emergencial"],
                    ["LOW", "Baixa"],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tipo de item">
                <SelectField
                  className={inputClass}
                  value={form.itemType ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, itemType: e.target.value })
                  }
                >
                  <option value="">Todos</option>
                  <option value="PART">Peça / material</option>
                  <option value="SERVICE">Serviço</option>
                </SelectField>
              </Field>
              <Lookup
                kind="costCenters"
                label="Centro de custo da regra"
                value={form.costCenterId}
                onPick={(choice) =>
                  setForm({ ...form, costCenterId: choice?.id })
                }
              />
              <Lookup
                kind="users"
                label="Aprovador responsável"
                value={form.approverUserId}
                onPick={(choice) =>
                  setForm({ ...form, approverUserId: choice?.id ?? "" })
                }
              />
            </div>
            <label className="flex gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Regra ativa
            </label>
            <div className="flex gap-3">
              <button
                className={buttonClass}
                disabled={busy || !form.name.trim() || !form.approverUserId}
                onClick={() => void save()}
              >
                Salvar regra
              </button>
              <button
                className={secondaryClass}
                onClick={() => setForm({ ...emptyRule })}
              >
                Limpar formulário
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Fornecedor exclusivo, emergência e propostas insuficientes exigem
              justificativa e permissão de exceção. Não existe exigência fixa de
              três propostas.
            </p>
          </fieldset>
        </SectionCard>
      ) : null}
    </div>
  );
}
