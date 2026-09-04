"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

type Client = { id: string; companyName: string };
type Equipment = {
  id: string;
  name: string;
  serialNumber?: string | null;
  clientId: string;
};

type EquipmentLine = {
  generatorId: string;
  coverageAmount: string;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function NewContractPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    clientId: "",
    status: "ACTIVE",
    startDate: "",
    endDate: "",
    alertDays: "30",
    preventiveRecurrence: "MONTHLY",
    responseTimeHours: "4",
    correctiveVisitAllowance: "2",
    partsCoverage: "BILLED_SEPARATELY",
    recurringAmount: "",
    dueDay: "10",
    adjustmentIndex: "IPCA",
    adjustmentBaseMonth: "",
    notes: "",
  });
  const [equipmentLines, setEquipmentLines] = useState<EquipmentLine[]>([]);

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadReferences = useCallback(async () => {
    setLoadingReferences(true);
    setError("");

    try {
      const [clientsRes, equipmentsRes] = await Promise.all([
        apiFetch(apiUrl("/clients"), { cache: "no-store" }),
        apiFetch(apiUrl("/generators"), { cache: "no-store" }),
      ]);

      if (await handleUnauthorized(clientsRes)) return;
      if (await handleUnauthorized(equipmentsRes)) return;

      if (!clientsRes.ok) {
        throw new Error(
          await readApiErrorMessage(clientsRes, "Nao foi possivel carregar clientes."),
        );
      }

      if (!equipmentsRes.ok) {
        throw new Error(
          await readApiErrorMessage(
            equipmentsRes,
            "Nao foi possivel carregar equipamentos.",
          ),
        );
      }

      const clientsData = (await clientsRes.json()) as Array<{
        id: string;
        companyName: string;
      }>;
      const equipmentsData = (await equipmentsRes.json()) as Array<{
        id: string;
        name: string;
        serialNumber?: string | null;
        clientId: string;
      }>;

      setClients(
        clientsData.map((client) => ({
          id: client.id,
          companyName: client.companyName,
        })),
      );
      setEquipments(
        equipmentsData.map((equipment) => ({
          id: equipment.id,
          name: equipment.name,
          serialNumber: equipment.serialNumber,
          clientId: equipment.clientId,
        })),
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar referencias.",
      );
    } finally {
      setLoadingReferences(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  const availableEquipments = useMemo(
    () => equipments.filter((item) => item.clientId === formData.clientId),
    [equipments, formData.clientId],
  );

  useEffect(() => {
    const validIds = new Set(availableEquipments.map((item) => item.id));
    setEquipmentLines((prev) => prev.filter((line) => validIds.has(line.generatorId)));
  }, [availableEquipments]);

  function changeField(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function addEquipment() {
    const selected = new Set(equipmentLines.map((line) => line.generatorId));
    const firstAvailable = availableEquipments.find((item) => !selected.has(item.id));
    if (!firstAvailable) return;

    setEquipmentLines((prev) => [
      ...prev,
      { generatorId: firstAvailable.id, coverageAmount: "" },
    ]);
  }

  function updateEquipment(index: number, patch: Partial<EquipmentLine>) {
    setEquipmentLines((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeEquipment(index: number) {
    setEquipmentLines((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const payload = {
      title: formData.title || undefined,
      clientId: formData.clientId,
      status: formData.status,
      startDate: formData.startDate,
      endDate: formData.endDate,
      alertDays: Number(formData.alertDays || 30),
      preventiveRecurrence: formData.preventiveRecurrence,
      responseTimeHours: Number(formData.responseTimeHours || 0) || undefined,
      correctiveVisitAllowance:
        Number(formData.correctiveVisitAllowance || 0) || undefined,
      partsCoverage: formData.partsCoverage,
      recurringAmount: Number(formData.recurringAmount || 0),
      dueDay: Number(formData.dueDay || 10),
      adjustmentIndex: formData.adjustmentIndex,
      adjustmentBaseMonth:
        Number(formData.adjustmentBaseMonth || 0) || undefined,
      notes: formData.notes || undefined,
      equipments: equipmentLines
        .filter((line) => line.generatorId)
        .map((line) => ({
          generatorId: line.generatorId,
          coverageAmount: line.coverageAmount
            ? Number(line.coverageAmount)
            : undefined,
        })),
    };

    try {
      const res = await apiFetch(apiUrl("/contracts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao criar contrato."),
        );
      }

      setNotice("Contrato criado com sucesso. Redirecionando para a carteira...");
      router.push("/dashboard/contracts");
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao criar contrato.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Novo contrato"
        title="Cadastrar contrato com mais clareza e menos ruído."
        description="O formulario foi reorganizado por contexto operacional: vigencia, cobertura, SLA e faturamento. Tambem corrigimos a consistencia entre cliente e equipamentos para evitar falhas silenciosas no fluxo."
        stats={[
          {
            label: "Clientes carregados",
            value: String(clients.length),
            helper: "Base disponivel para vinculo do contrato.",
            tone: "slate",
          },
          {
            label: "Equipamentos do cliente",
            value: String(availableEquipments.length),
            helper: "Ativos elegiveis para cobertura.",
            tone: "blue",
          },
          {
            label: "Itens na cobertura",
            value: String(equipmentLines.length),
            helper: "Equipamentos ja adicionados ao escopo.",
            tone: "emerald",
          },
          {
            label: "Status inicial",
            value: statusLabel(formData.status),
            helper: "Como o contrato nascera no sistema.",
            tone: "amber",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadReferences()}
              disabled={loadingReferences}
              className={SECONDARY_BUTTON}
            >
              Atualizar referencias
            </button>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Verificacao de fluxo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Quando voce troca o cliente, os equipamentos antigos invalidos saem do
                formulario automaticamente. Isso evita erros de vinculo no envio.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DataPill tone={formData.clientId ? "emerald" : "slate"}>
                {formData.clientId ? "Cliente definido" : "Cliente pendente"}
              </DataPill>
              <DataPill tone={equipmentLines.length > 0 ? "blue" : "amber"}>
                {equipmentLines.length > 0
                  ? `${equipmentLines.length} equipamento(s)`
                  : "Escopo pendente"}
              </DataPill>
            </div>
          </FieldBox>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard
          eyebrow="Base do contrato"
          title="Dados gerais e vigencia"
          description="Define cliente, status inicial e janela principal do contrato."
        >
          <div className="grid gap-4 md:grid-cols-4">
            <FormField label="Titulo">
              <TextInput
                name="title"
                value={formData.title}
                onChange={changeField}
                placeholder="Contrato full service matriz"
              />
            </FormField>
            <FormField label="Cliente" hint="Obrigatorio">
              <SelectInput
                name="clientId"
                value={formData.clientId}
                onChange={changeField}
                required
              >
                <option value="">Selecione...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Status inicial">
              <SelectInput name="status" value={formData.status} onChange={changeField}>
                <option value="ACTIVE">Ativo</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="RENEWAL">Em renovacao</option>
              </SelectInput>
            </FormField>
            <FormField label="Alerta vencimento (dias)">
              <TextInput
                name="alertDays"
                type="number"
                value={formData.alertDays}
                onChange={changeField}
              />
            </FormField>
            <FormField label="Data inicio" hint="Obrigatorio">
              <TextInput
                name="startDate"
                type="date"
                value={formData.startDate}
                onChange={changeField}
                required
              />
            </FormField>
            <FormField label="Data termino" hint="Obrigatorio">
              <TextInput
                name="endDate"
                type="date"
                value={formData.endDate}
                onChange={changeField}
                required
              />
            </FormField>
            <FormField label="Recorrencia preventiva" hint="Obrigatorio">
              <SelectInput
                name="preventiveRecurrence"
                value={formData.preventiveRecurrence}
                onChange={changeField}
              >
                <option value="MONTHLY">Mensal</option>
                <option value="BIMONTHLY">Bimestral</option>
                <option value="QUARTERLY">Trimestral</option>
                <option value="SEMIANNUAL">Semestral</option>
                <option value="ANNUAL">Anual</option>
              </SelectInput>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Cobertura tecnica"
          title="Equipamentos cobertos"
          description="Selecione somente ativos do cliente escolhido. O formulario agora remove automaticamente equipamentos invalidos quando o cliente muda."
          actions={
            <button
              type="button"
              onClick={addEquipment}
              disabled={!formData.clientId || availableEquipments.length === equipmentLines.length}
              className={SECONDARY_BUTTON}
            >
              Adicionar equipamento
            </button>
          }
        >
          {!formData.clientId ? (
            <EmptyState
              title="Selecione o cliente primeiro"
              description="Os equipamentos disponiveis aparecem somente apos definir o cliente do contrato."
            />
          ) : equipmentLines.length === 0 ? (
            <EmptyState
              title="Nenhum equipamento selecionado"
              description="Adicione ao menos um equipamento para fechar o escopo tecnico do contrato."
            />
          ) : (
            <div className="space-y-3">
              {equipmentLines.map((line, index) => (
                <div
                  key={`${line.generatorId}-${index}`}
                  className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 md:grid-cols-[minmax(0,1.7fr)_220px_auto]"
                >
                  <FormField label="Equipamento">
                    <SelectInput
                      value={line.generatorId}
                      onChange={(event) =>
                        updateEquipment(index, { generatorId: event.target.value })
                      }
                    >
                      {availableEquipments.map((equipment) => (
                        <option key={equipment.id} value={equipment.id}>
                          {equipment.name}
                          {equipment.serialNumber ? ` - ${equipment.serialNumber}` : ""}
                        </option>
                      ))}
                    </SelectInput>
                  </FormField>
                  <FormField label="Cobertura individual (R$)">
                    <TextInput
                      type="number"
                      step="0.01"
                      value={line.coverageAmount}
                      onChange={(event) =>
                        updateEquipment(index, { coverageAmount: event.target.value })
                      }
                    />
                  </FormField>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeEquipment(index)}
                      className={SECONDARY_BUTTON}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="SLA e cobertura"
          title="Atendimento e pecas"
          description="Configure tempos de resposta, franquia corretiva e politica de pecas."
        >
          <div className="grid gap-4 md:grid-cols-4">
            <FormField label="Tempo resposta (h)">
              <TextInput
                name="responseTimeHours"
                type="number"
                value={formData.responseTimeHours}
                onChange={changeField}
              />
            </FormField>
            <FormField label="Franquia corretiva">
              <TextInput
                name="correctiveVisitAllowance"
                type="number"
                value={formData.correctiveVisitAllowance}
                onChange={changeField}
              />
            </FormField>
            <FormField label="Cobertura de pecas">
              <SelectInput
                name="partsCoverage"
                value={formData.partsCoverage}
                onChange={changeField}
              >
                <option value="INCLUDED">Inclusa na mensalidade</option>
                <option value="BILLED_SEPARATELY">Faturada separadamente</option>
              </SelectInput>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Financeiro"
          title="Faturamento e reajuste"
          description="Defina mensalidade, vencimento e politica de reajuste."
        >
          <div className="grid gap-4 md:grid-cols-4">
            <FormField label="Valor recorrente (R$)" hint="Obrigatorio">
              <TextInput
                name="recurringAmount"
                type="number"
                step="0.01"
                value={formData.recurringAmount}
                onChange={changeField}
                required
              />
            </FormField>
            <FormField label="Dia vencimento" hint="Obrigatorio">
              <TextInput
                name="dueDay"
                type="number"
                min={1}
                max={31}
                value={formData.dueDay}
                onChange={changeField}
                required
              />
            </FormField>
            <FormField label="Indice de reajuste">
              <SelectInput
                name="adjustmentIndex"
                value={formData.adjustmentIndex}
                onChange={changeField}
              >
                <option value="IPCA">IPCA</option>
                <option value="IGPM">IGPM</option>
                <option value="NONE">Sem reajuste</option>
              </SelectInput>
            </FormField>
            <FormField label="Mes data-base (1-12)">
              <TextInput
                name="adjustmentBaseMonth"
                type="number"
                min={1}
                max={12}
                value={formData.adjustmentBaseMonth}
                onChange={changeField}
              />
            </FormField>
            <FormField label="Observacoes" className="md:col-span-4">
              <TextAreaInput
                name="notes"
                value={formData.notes}
                onChange={changeField}
                placeholder="Notas internas, regras operacionais ou contexto comercial."
              />
            </FormField>
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <DataPill tone={loadingReferences ? "slate" : "emerald"}>
              {loadingReferences ? "Carregando referencias" : "Referencias prontas"}
            </DataPill>
            <DataPill tone={equipmentLines.length > 0 ? "blue" : "amber"}>
              {equipmentLines.length} item(ns) no escopo
            </DataPill>
          </div>

          <button
            type="submit"
            disabled={loading || !formData.clientId || equipmentLines.length === 0}
            className={PRIMARY_BUTTON}
          >
            {loading ? "Salvando..." : "Criar contrato"}
          </button>
        </div>
      </form>
    </div>
  );
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Ativo",
    SUSPENDED: "Suspenso",
    RENEWAL: "Renovacao",
  };

  return labels[value] || value;
}
