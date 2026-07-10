"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type ClientRow = { id: string; companyName: string; cnpj?: string | null };
type ModelBaseItem = { id: string; serviceGroup: string; defaultQuantity: number; catalogItem: { id: string; name: string } };
type GeneratorModelRow = { id: string; name: string; brand?: string | null; baseItems?: ModelBaseItem[] };

export default function NewEquipmentPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [models, setModels] = useState<GeneratorModelRow[]>([]);

  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [modelId, setModelId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [power, setPower] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [condition, setCondition] = useState("BOM");
  const [applyModelBaseItems, setApplyModelBaseItems] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const clientIdFromUrl = new URLSearchParams(window.location.search).get("clientId");
    if (clientIdFromUrl) setClientId(clientIdFromUrl);

    (async () => {
      try {
        const [clientsRes, modelsRes] = await Promise.all([
          apiFetch("/clients"),
          apiFetch("/generators/models"),
        ]);

        if (clientsRes.ok) setClients((await clientsRes.json()) as ClientRow[]);
        if (modelsRes.ok) setModels((await modelsRes.json()) as GeneratorModelRow[]);
      } catch {
        setError("Nao foi possivel carregar clientes/modelos.");
      }
    })();
  }, []);

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);
  const groupedModelBase = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of selectedModel?.baseItems ?? []) {
      map.set(item.serviceGroup, (map.get(item.serviceGroup) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [selectedModel]);

  useEffect(() => {
    if (selectedModel?.brand) {
      setBrand(selectedModel.brand);
    }
  }, [selectedModel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!clientId) return setError("Selecione um cliente.");
    if (!name.trim()) return setError("Informe o nome do equipamento.");
    if (!brand.trim()) return setError("Informe a marca.");
    if (!power || Number(power) <= 0) return setError("Informe uma potencia valida.");

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/generators", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          name,
          brand,
          modelId: modelId || undefined,
          serialNumber: serialNumber || undefined,
          power: Number(power),
          hourMeter: hourMeter ? Number(hourMeter) : undefined,
          condition,
          applyModelBaseItems,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao cadastrar equipamento."),
        );
      }

      router.push("/dashboard/equipments");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar equipamento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8 pb-24">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Novo Equipamento</h1>
          <p className="mt-1 text-zinc-500">Cadastro com modelo e automacao da base tecnica.</p>
        </div>
        <button type="button" onClick={() => router.push("/dashboard/equipments")} className="rounded-lg px-4 py-2 font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800">
          Voltar
        </button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">1. Vinculo e Identificacao</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Cliente *</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white p-3">
                <option value="">Selecione</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.companyName} {c.cnpj ? `(${c.cnpj})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Nome do equipamento *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-zinc-300 p-3" placeholder="Ex: GMG Principal" required />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">2. Modelo e Base Tecnica</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Modelo (opcional)</label>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white p-3">
                <option value="">Sem modelo</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.brand ? `${m.brand} - ` : ""}{m.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">Se precisar, cadastre modelos em breve no modulo de modelos.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Marca *</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-lg border border-zinc-300 p-3" placeholder="Ex: Cummins" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Potencia (kVA) *</label>
              <input type="number" min="0" value={power} onChange={(e) => setPower(e.target.value)} className="w-full rounded-lg border border-zinc-300 p-3" placeholder="Ex: 500" required />
            </div>
          </div>

          {selectedModel ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">Base tecnica do modelo: {selectedModel.name}</p>
              {groupedModelBase.length === 0 ? (
                <p className="mt-1 text-blue-800">Este modelo ainda nao possui itens base cadastrados.</p>
              ) : (
                <p className="mt-1 text-blue-800">Itens por grupo: {groupedModelBase.map(([g, q]) => `${g}: ${q}`).join(" | ")}</p>
              )}
              <label className="mt-2 inline-flex items-center gap-2 font-medium">
                <input type="checkbox" checked={applyModelBaseItems} onChange={(e) => setApplyModelBaseItems(e.target.checked)} />
                Ao salvar a maquina, copiar itens base do modelo
              </label>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-b pb-2 text-lg font-bold text-zinc-800">3. Dados Operacionais</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Numero de serie</label>
              <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-full rounded-lg border border-zinc-300 p-3" placeholder="Ex: SN-123" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Horimetro</label>
              <input type="number" min="0" value={hourMeter} onChange={(e) => setHourMeter(e.target.value)} className="w-full rounded-lg border border-zinc-300 p-3" placeholder="Ex: 1250" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Condicao</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white p-3">
                <option value="NOVO">NOVO</option>
                <option value="BOM">BOM</option>
                <option value="REGULAR">REGULAR</option>
                <option value="REPARO_NECESSARIO">REPARO_NECESSARIO</option>
                <option value="INOPERANTE">INOPERANTE</option>
              </select>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-end border-t border-zinc-200 bg-white p-4 px-10 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-600 px-8 py-3 font-bold text-white transition hover:bg-blue-500 disabled:opacity-50">
            {isSubmitting ? "Salvando..." : "Cadastrar equipamento"}
          </button>
        </div>
      </form>
    </div>
  );
}
