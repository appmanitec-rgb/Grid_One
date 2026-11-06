"use client";
import { useEffect, useRef, useState } from "react";
import {
  commercialPost,
  CostEstimate,
  EstimateInput,
} from "@/lib/commercial-workspace";
import { InlineMessage } from "../components/DashboardPageKit";
const labels = {
  laborCost: "Mão de obra adicional",
  travelCost: "Deslocamento",
  freightCost: "Frete",
  otherCost: "Outros custos e tributos",
};
const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
export default function CommercialEstimatePanel({
  input,
  initial,
  proposalId,
  sourceHash,
  canEdit,
  onSaved,
}: {
  input: EstimateInput;
  initial?: CostEstimate | null;
  proposalId?: string;
  sourceHash?: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CostEstimate | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    setResult(initial ?? null);
    setValues(
      Object.fromEntries(
        Object.keys(labels).map((key) => [
          key,
          initial?.costs?.[key] == null ? "" : String(initial.costs[key]),
        ]),
      ),
    );
    setUnitCosts(
      Object.fromEntries(
        (initial?.items ?? [])
          .filter((item) => item.unitCost !== null)
          .map((item) => [item.key, String(item.unitCost)]),
      ),
    );
    setDirty(false);
  }, [initial]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const signature = JSON.stringify(input);
  useEffect(() => {
    requestVersion.current += 1;
    setResult(initial ?? null);
    setNotice("");
  }, [signature, initial]);
  const identity = JSON.stringify(
    input.items.map((item) => [item.key, item.catalogItemId, item.description]),
  );
  useEffect(() => {
    if (!proposalId) setUnitCosts({});
  }, [identity, proposalId]);
  async function calculate(save: boolean) {
    const version = requestVersion.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload: EstimateInput = {
        ...input,
        version: initial?.version ?? 0,
        sourceHash,
        items: input.items.map((item) => ({
          ...item,
          ...(unitCosts[item.key]?.trim()
            ? { unitCost: Number(unitCosts[item.key]) }
            : {}),
        })),
        ...Object.fromEntries(
          Object.entries(values)
            .filter(([, value]) => value.trim() !== "")
            .map(([key, value]) => [key, Number(value)]),
        ),
      };
      if (save && proposalId) {
        await commercialPost(`/proposals/${proposalId}/estimate`, payload);
        setDirty(false);
        setNotice("Conferência de custos registrada.");
        onSaved?.();
      } else {
        const value = await commercialPost<CostEstimate>("/estimate", payload);
        if (version === requestVersion.current) setResult(value);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível conferir os custos.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Estimativa interna do administrador responsável. Informe zero somente
        quando tiver confirmado a ausência do custo. Mão de obra adicional não
        deve repetir custos já incluídos nos itens.
      </p>
      {initial?.stale ? (
        <InlineMessage tone="warning">
          A proposta mudou depois desta estimativa. Confira os custos novamente.
        </InlineMessage>
      ) : null}
      {canEdit ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(labels).map(([key, label]) => (
              <label key={key} className="text-sm font-medium">
                {label}
                <input
                  disabled={busy}
                  type="number"
                  min="0"
                  step="0.01"
                  value={values[key] || ""}
                  placeholder="Não conferido"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }));
                    setDirty(true);
                    setResult(null);
                  }}
                />
              </label>
            ))}
          </div>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Conferir custo unitário dos itens
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Em branco, consulta o custo médio, último custo ou custo
              cadastrado, nessa ordem. Zero exige conferência explícita.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {input.items.map((item) => (
                <label key={item.key} className="text-sm">
                  {item.description || "Item da proposta"} · {item.quantity}
                  <input
                    disabled={busy}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Usar custo do catálogo"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    value={unitCosts[item.key] ?? ""}
                    onChange={(event) => {
                      setUnitCosts((current) => ({
                        ...current,
                        [item.key]: event.target.value,
                      }));
                      setDirty(true);
                      setResult(null);
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="app-button app-button-secondary"
              disabled={busy}
              onClick={() => void calculate(false)}
            >
              {busy ? "Conferindo…" : "Conferir estimativa"}
            </button>
            {proposalId ? (
              <button
                type="button"
                className="app-button app-button-primary"
                disabled={busy}
                onClick={() => void calculate(true)}
              >
                Registrar conferência interna
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {result ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {result.estimatedCost !== undefined ? (
              <div>
                <p className="text-xs text-slate-500">Custos conhecidos</p>
                <strong>{currency(result.estimatedCost)}</strong>
              </div>
            ) : null}
            {result.contribution !== undefined ? (
              <div>
                <p className="text-xs text-slate-500">Resultado estimado</p>
                <strong>
                  {result.complete &&
                  !result.stale &&
                  result.contribution !== null
                    ? currency(result.contribution)
                    : "Não apurado"}
                </strong>
              </div>
            ) : null}
            {result.marginPercent !== undefined ? (
              <div>
                <p className="text-xs text-slate-500">Margem estimada</p>
                <strong>
                  {result.complete &&
                  !result.stale &&
                  result.marginPercent !== null
                    ? `${result.marginPercent}%`
                    : "Não apurada"}
                </strong>
              </div>
            ) : null}
          </div>
          {!result.complete ? (
            <p className="mt-3 text-sm text-amber-800">
              Conferência incompleta
              {result.missing?.length ? `: ${result.missing.join(", ")}` : "."}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            {result.note ||
              "Estimativa interna; não representa lucro contábil."}
          </p>
          {result.updatedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              Conferido em {new Date(result.updatedAt).toLocaleString("pt-BR")}
            </p>
          ) : null}
        </div>
      ) : !canEdit ? (
        <p className="text-sm text-slate-500">
          Ainda não há uma estimativa de custos conferida para esta proposta.
        </p>
      ) : null}
    </div>
  );
}
