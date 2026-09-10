"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

export type OperationalExpenseSelection = {
  expenseType: string;
  label: string;
  unitLabel: string;
  unitPrice: number;
  quantity: number;
};

type OperationalExpenseRate = OperationalExpenseSelection & {
  id: string;
  sortOrder: number;
};

export function operationalExpensesTotal(
  items: OperationalExpenseSelection[],
) {
  return items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );
}

export default function OperationalExpensesEditor({
  value,
  onChange,
}: {
  value: OperationalExpenseSelection[];
  onChange: (value: OperationalExpenseSelection[]) => void;
}) {
  const [rates, setRates] = useState<OperationalExpenseRate[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch(apiUrl("/proposals/operational-expense-rates"), {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setRates((await response.json()) as OperationalExpenseRate[]);
      })
      .catch(() =>
        setError("Nao foi possivel carregar as tarifas operacionais."),
      );
  }, []);

  function update(rate: OperationalExpenseRate, enabled: boolean, quantity = 1) {
    const withoutCurrent = value.filter(
      (item) => item.expenseType !== rate.expenseType,
    );
    onChange(
      enabled
        ? [
            ...withoutCurrent,
            {
              expenseType: rate.expenseType,
              label: rate.label,
              unitLabel: rate.unitLabel,
              unitPrice: Number(rate.unitPrice),
              quantity: Math.max(0, quantity),
            },
          ]
        : withoutCurrent,
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">Despesas operacionais</h3>
          <p className="text-sm text-zinc-500">
            Informe as quantidades. As tarifas vem do Manitec Studio e ficam
            congeladas nesta proposta.
          </p>
        </div>
        <strong className="text-zinc-900">
          {operationalExpensesTotal(value).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </strong>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rates.map((rate) => {
          const selected = value.find(
            (item) => item.expenseType === rate.expenseType,
          );
          return (
            <div
              key={rate.id}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <label className="flex cursor-pointer items-center gap-2 font-medium text-zinc-800">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={(event) => update(rate, event.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {rate.label}
              </label>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step={rate.expenseType === "DISPLACEMENT" ? "0.1" : "1"}
                  disabled={!selected}
                  value={selected?.quantity ?? ""}
                  onChange={(event) =>
                    update(rate, true, Number(event.target.value || 0))
                  }
                  aria-label={`Quantidade de ${rate.label}`}
                  className="w-24 rounded-md border border-zinc-300 px-3 py-2 disabled:bg-zinc-100"
                />
                <span className="text-sm text-zinc-500">
                  {rate.unitLabel} × {Number(rate.unitPrice).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        No documento do cliente aparecem somente o total e a composicao
        marcada, sem quantidades ou valores unitarios.
      </p>
    </section>
  );
}
