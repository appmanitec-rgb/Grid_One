"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";

type Equipment = {
  id: string;
  name: string;
  brand: string;
  serialNumber?: string | null;
  power: number;
  hourMeter?: number | null;
  condition?: string | null;
  assetTag?: string | null;
  installationSite?: string | null;
  operationalStatus?: string | null;
  lifecycleStatus?: string | null;
  criticality?: string | null;
  manufactureYear?: number | null;
  installationDate?: string | null;
  warrantyEndDate?: string | null;
  hasMaintenanceContract?: boolean | null;
  application?: string | null;
  notes?: string | null;
  voltage?: string | null;
  ratedCurrent?: string | null;
  powerFactor?: number | null;
  frequencyHz?: number | null;
  operationMode?: string | null;
  engineBrand?: string | null;
  engineModelName?: string | null;
  engineSerialNumber?: string | null;
  enginePower?: string | null;
  fuelType?: string | null;
  engineCylinders?: number | null;
  oilRecommendation?: string | null;
  oilCapacityLiters?: number | null;
  lastOilChangeAt?: string | null;
  alternatorBrand?: string | null;
  alternatorModelName?: string | null;
  alternatorSerialNumber?: string | null;
  alternatorVoltage?: string | null;
  alternatorFrequencyHz?: number | null;
  alternatorInsulationClass?: string | null;
  alternatorProtectionDegree?: string | null;
  hasTransferSwitch?: boolean | null;
  transferSwitchBrand?: string | null;
  transferSwitchModel?: string | null;
  transferSwitchSerialNumber?: string | null;
  transferSwitchRatedCurrent?: string | null;
  transferSwitchCommandVoltage?: string | null;
  transferSwitchType?: string | null;
  transferSwitchNotes?: string | null;
  batteryQuantity?: number | null;
  batteryVoltage?: string | null;
  batteryCapacityAh?: number | null;
  batteryInstallationDate?: string | null;
  batteryChargerModel?: string | null;
  batteryLastReplacementDate?: string | null;
  client?: { id: string; companyName: string } | null;
  currentSite?: { id: string; name: string; code?: string | null } | null;
  model?: { id: string; name: string; brand?: string | null } | null;
  proposals?: Array<{ id: string; code: string; status: string; totalValue: number }>;
  orders?: Array<{
    id: string;
    title: string;
    status: string;
    type?: string | null;
    priority: string;
    openedAt?: string | null;
    finishedAt?: string | null;
    contract?: { id: string; code: string; status: string } | null;
    serviceReport?: { id: string; code: string; status?: string | null } | null;
    materials?: Array<{
      id: string;
      quantity: number;
      appliedAt?: string | null;
      catalogItem?: { id: string; name: string; sku?: string | null } | null;
    }>;
  }>;
  serviceTickets?: Array<{
    id: string;
    code?: string | null;
    title: string;
    status: string;
    priority?: string | null;
    createdAt?: string | null;
    maintenanceOrder?: { id: string; title: string; status: string } | null;
  }>;
  serviceReports?: Array<{
    id: string;
    code: string;
    status: string;
    title?: string | null;
    createdAt?: string | null;
    documentHash?: string | null;
  }>;
  contractLinks?: Array<{
    id: string;
    contract?: {
      id: string;
      code: string;
      title?: string | null;
      status: string;
      startDate?: string | null;
      endDate?: string | null;
    } | null;
  }>;
  contractSchedules?: Array<{
    id: string;
    scheduledDate?: string | null;
    status?: string | null;
    contract?: { id: string; code: string; status: string } | null;
    generatedOrder?: { id: string; title: string; status: string } | null;
  }>;
  baseItems?: Array<{
    id: string;
    serviceGroup: string;
    quantity: number;
    catalogItem?: { id: string; name: string; sku?: string | null } | null;
  }>;
};

type EditForm = Record<string, string>;
type TabKey = "resumo" | "historico" | "editar";

const TEXT_FIELDS = [
  "name",
  "brand",
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

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [form, setForm] = useState<EditForm>({});
  const [tab, setTab] = useState<TabKey>("resumo");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState(() => getAccessFromToken());

  useEffect(() => {
    setAccess(getAccessFromToken());
  }, []);

  useEffect(() => {
    if (!id) return;
    void loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadEquipment() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/generators/${id}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar o equipamento."),
        );
      }
      const payload = (await res.json()) as Equipment;
      setEquipment(payload);
      setForm(formFromEquipment(payload));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar equipamento.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveTechnicalData(event: React.FormEvent) {
    event.preventDefault();
    if (!equipment) return;
    if (!access.equipments.update) {
      setError("Seu perfil nao pode editar a ficha tecnica do equipamento.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/generators/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(form)),
      });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel salvar a ficha tecnica."),
        );
      }
      setNotice("Ficha tecnica atualizada com sucesso.");
      await loadEquipment();
      setTab("resumo");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Erro ao salvar ficha tecnica.",
      );
    } finally {
      setSaving(false);
    }
  }

  const latestOrder = equipment?.orders?.[0] ?? null;
  const latestReport = equipment?.serviceReports?.[0] ?? null;
  const activeContract = equipment?.contractLinks?.[0]?.contract ?? null;
  const nextPreventive = useMemo(() => {
    const schedules = equipment?.contractSchedules || [];
    return schedules.find((item) => item.status === "PLANNED") || schedules[0] || null;
  }, [equipment?.contractSchedules]);
  const appliedParts = useMemo(
    () =>
      (equipment?.orders || []).flatMap((order) =>
        (order.materials || []).map((material) => ({
          ...material,
          orderId: order.id,
          orderTitle: order.title,
        })),
      ),
    [equipment?.orders],
  );

  if (loading) return <State text="Carregando ficha tecnica..." />;
  if (error && !equipment) return <State text={error} tone="error" />;
  if (!equipment) return <State text="Equipamento nao encontrado." />;

  const canEdit = access.equipments.update;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Prontuario tecnico operacional
            </p>
            <h1 className="mt-2 break-words text-3xl font-black text-slate-950">
              {equipment.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {equipment.assetTag || "Sem tag"} | Serie{" "}
              {equipment.serialNumber || "nao informada"} |{" "}
              {equipment.power} kVA
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {equipment.client?.id ? (
              <ActionLink href={`/dashboard/clients/${equipment.client.id}`}>
                Cliente
              </ActionLink>
            ) : null}
            {equipment.currentSite?.id ? (
              <ActionLink href="/dashboard/sites">Local/site</ActionLink>
            ) : null}
            {activeContract?.id ? (
              <ActionLink href={`/dashboard/contracts/${activeContract.id}`}>
                Contrato
              </ActionLink>
            ) : null}
            <ActionLink href="/dashboard/equipments">Voltar</ActionLink>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Status" value={statusLabel(equipment.operationalStatus)} />
          <Metric label="Criticidade" value={equipment.criticality || "-"} />
          <Metric
            label="Horimetro"
            value={equipment.hourMeter != null ? `${equipment.hourMeter} h` : "-"}
          />
          <Metric
            label="Proxima preventiva"
            value={formatDate(nextPreventive?.scheduledDate)}
          />
        </div>
      </header>

      {notice ? <State text={notice} tone="success" /> : null}
      {error ? <State text={error} tone="error" /> : null}

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <TabButton active={tab === "resumo"} onClick={() => setTab("resumo")}>
          Resumo tecnico
        </TabButton>
        <TabButton active={tab === "historico"} onClick={() => setTab("historico")}>
          Historico e links
        </TabButton>
        {canEdit ? (
          <TabButton active={tab === "editar"} onClick={() => setTab("editar")}>
            Editar ficha
          </TabButton>
        ) : null}
      </nav>

      {tab === "resumo" ? (
        <div className="space-y-6">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="Identificacao e localizacao">
              <InfoGrid>
                <Info label="Cliente" value={equipment.client?.companyName || "-"} href={equipment.client?.id ? `/dashboard/clients/${equipment.client.id}` : undefined} />
                <Info label="Local/site" value={equipment.currentSite?.name || equipment.installationSite || "-"} href={equipment.currentSite?.id ? "/dashboard/sites" : undefined} />
                <Info label="Modelo" value={equipment.model?.name || "-"} />
                <Info label="Fabricante" value={equipment.brand} />
                <Info label="Aplicacao" value={equipment.application || "-"} />
                <Info label="Condicao" value={equipment.condition || "-"} />
                <Info label="Ciclo de vida" value={statusLabel(equipment.lifecycleStatus)} />
                <Info label="Garantia ate" value={formatDate(equipment.warrantyEndDate)} />
              </InfoGrid>
            </Panel>

            <Panel title="Leitura operacional">
              <div className="space-y-3">
                <LinkCard
                  title="Ultima OS"
                  value={latestOrder?.title || "-"}
                  helper={latestOrder ? `${statusLabel(latestOrder.status)} | ${formatDate(latestOrder.finishedAt || latestOrder.openedAt)}` : "Sem OS recente"}
                  href={latestOrder?.id ? `/dashboard/orders/${latestOrder.id}` : undefined}
                />
                <LinkCard
                  title="Ultimo laudo"
                  value={latestReport?.code || "-"}
                  helper={latestReport ? statusLabel(latestReport.status) : "Sem laudo relacionado"}
                  href={latestReport?.id ? `/dashboard/relatorios-tecnicos/${latestReport.id}` : undefined}
                />
                <LinkCard
                  title="Contrato"
                  value={activeContract?.code || "-"}
                  helper={activeContract ? statusLabel(activeContract.status) : "Nao vinculado"}
                  href={activeContract?.id ? `/dashboard/contracts/${activeContract.id}` : undefined}
                />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="Dados do gerador">
              <InfoGrid>
                <Info label="Potencia" value={`${equipment.power} kVA`} />
                <Info label="Tensao" value={equipment.voltage || "-"} />
                <Info label="Corrente" value={equipment.ratedCurrent || "-"} />
                <Info label="Fator de potencia" value={formatNumber(equipment.powerFactor)} />
                <Info label="Frequencia" value={formatHz(equipment.frequencyHz)} />
                <Info label="Regime de operacao" value={equipment.operationMode || "-"} />
                <Info label="Ano fabricacao" value={equipment.manufactureYear ? String(equipment.manufactureYear) : "-"} />
                <Info label="Instalacao" value={formatDate(equipment.installationDate)} />
              </InfoGrid>
            </Panel>

            <Panel title="Motor">
              <InfoGrid>
                <Info label="Fabricante" value={equipment.engineBrand || "-"} />
                <Info label="Modelo" value={equipment.engineModelName || "-"} />
                <Info label="Serie" value={equipment.engineSerialNumber || "-"} />
                <Info label="Potencia" value={equipment.enginePower || "-"} />
                <Info label="Combustivel" value={equipment.fuelType || "-"} />
                <Info label="Cilindros" value={formatNumber(equipment.engineCylinders)} />
                <Info label="Oleo recomendado" value={equipment.oilRecommendation || "-"} />
                <Info label="Capacidade oleo" value={equipment.oilCapacityLiters != null ? `${equipment.oilCapacityLiters} L` : "-"} />
                <Info label="Ultima troca" value={formatDate(equipment.lastOilChangeAt)} />
              </InfoGrid>
            </Panel>

            <Panel title="Alternador">
              <InfoGrid>
                <Info label="Fabricante" value={equipment.alternatorBrand || "-"} />
                <Info label="Modelo" value={equipment.alternatorModelName || "-"} />
                <Info label="Serie" value={equipment.alternatorSerialNumber || "-"} />
                <Info label="Tensao" value={equipment.alternatorVoltage || "-"} />
                <Info label="Frequencia" value={formatHz(equipment.alternatorFrequencyHz)} />
                <Info label="Classe isolacao" value={equipment.alternatorInsulationClass || "-"} />
                <Info label="Grau protecao" value={equipment.alternatorProtectionDegree || "-"} />
              </InfoGrid>
            </Panel>

            <Panel title="QTA, bateria e carregador">
              <InfoGrid>
                <Info label="Possui QTA" value={equipment.hasTransferSwitch ? "Sim" : "Nao"} />
                <Info label="QTA fabricante" value={equipment.transferSwitchBrand || "-"} />
                <Info label="QTA modelo" value={equipment.transferSwitchModel || "-"} />
                <Info label="Corrente nominal" value={equipment.transferSwitchRatedCurrent || "-"} />
                <Info label="Tensao comando" value={equipment.transferSwitchCommandVoltage || "-"} />
                <Info label="Tipo transferencia" value={equipment.transferSwitchType || "-"} />
                <Info label="Baterias" value={equipment.batteryQuantity != null ? String(equipment.batteryQuantity) : "-"} />
                <Info label="Tensao bateria" value={equipment.batteryVoltage || "-"} />
                <Info label="Capacidade" value={equipment.batteryCapacityAh != null ? `${equipment.batteryCapacityAh} Ah` : "-"} />
                <Info label="Carregador" value={equipment.batteryChargerModel || "-"} />
                <Info label="Instalacao bateria" value={formatDate(equipment.batteryInstallationDate)} />
                <Info label="Ultima substituicao" value={formatDate(equipment.batteryLastReplacementDate)} />
              </InfoGrid>
            </Panel>
          </section>

          <Panel title="Observacoes tecnicas">
            <p className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              {equipment.notes || "Sem observacoes registradas."}
            </p>
          </Panel>
        </div>
      ) : null}

      {tab === "historico" ? (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="Ordens de servico recentes">
              <RelatedList empty="Nenhuma OS vinculada.">
                {(equipment.orders || []).map((order) => (
                  <LinkCard
                    key={order.id}
                    title={order.title}
                    value={`${statusLabel(order.status)} | ${statusLabel(order.type)}`}
                    helper={`Prioridade ${order.priority || "-"} | ${formatDate(order.openedAt)}`}
                    href={`/dashboard/orders/${order.id}`}
                  />
                ))}
              </RelatedList>
            </Panel>

            <Panel title="Laudos tecnicos">
              <RelatedList empty="Nenhum laudo vinculado.">
                {(equipment.serviceReports || []).map((report) => (
                  <LinkCard
                    key={report.id}
                    title={report.code}
                    value={report.title || statusLabel(report.status)}
                    helper={report.documentHash ? "Documento validavel" : statusLabel(report.status)}
                    href={`/dashboard/relatorios-tecnicos/${report.id}`}
                  />
                ))}
              </RelatedList>
            </Panel>

            <Panel title="Chamados relacionados">
              <RelatedList empty="Nenhum chamado vinculado.">
                {(equipment.serviceTickets || []).map((ticket) => (
                  <LinkCard
                    key={ticket.id}
                    title={ticket.code || ticket.title}
                    value={statusLabel(ticket.status)}
                    helper={
                      ticket.maintenanceOrder
                        ? `Convertido em OS ${ticket.maintenanceOrder.title}`
                        : ticket.title
                    }
                    href={`/dashboard/atendimento/${ticket.id}`}
                  />
                ))}
              </RelatedList>
            </Panel>

            <Panel title="Contratos e preventivas">
              <RelatedList empty="Nenhum contrato ou preventiva vinculada.">
                {(equipment.contractLinks || []).map((link) =>
                  link.contract ? (
                    <LinkCard
                      key={link.id}
                      title={link.contract.code}
                      value={link.contract.title || statusLabel(link.contract.status)}
                      helper={`${formatDate(link.contract.startDate)} ate ${formatDate(link.contract.endDate)}`}
                      href={`/dashboard/contracts/${link.contract.id}`}
                    />
                  ) : null,
                )}
                {(equipment.contractSchedules || []).map((schedule) => (
                  <LinkCard
                    key={schedule.id}
                    title={formatDate(schedule.scheduledDate)}
                    value={schedule.contract?.code || "Preventiva"}
                    helper={
                      schedule.generatedOrder
                        ? `OS gerada: ${schedule.generatedOrder.title}`
                        : statusLabel(schedule.status)
                    }
                    href={
                      schedule.generatedOrder?.id
                        ? `/dashboard/orders/${schedule.generatedOrder.id}`
                        : schedule.contract?.id
                          ? `/dashboard/contracts/${schedule.contract.id}`
                          : undefined
                    }
                  />
                ))}
              </RelatedList>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pecas aplicadas em OS">
              <RelatedList empty="Nenhuma peca aplicada encontrada nas OS recentes.">
                {appliedParts.map((part) => (
                  <LinkCard
                    key={part.id}
                    title={part.catalogItem?.name || "Item aplicado"}
                    value={`Qtd. ${part.quantity}`}
                    helper={`${part.catalogItem?.sku || "Sem SKU"} | OS ${part.orderTitle}`}
                    href={
                      part.catalogItem?.id
                        ? `/dashboard/catalog/${part.catalogItem.id}`
                        : `/dashboard/orders/${part.orderId}`
                    }
                  />
                ))}
              </RelatedList>
            </Panel>

            <Panel title="Pecas base de manutencao">
              <RelatedList empty="Nenhum item base cadastrado.">
                {(equipment.baseItems || []).map((item) => (
                  <LinkCard
                    key={item.id}
                    title={item.catalogItem?.name || "Item base"}
                    value={`${item.serviceGroup} | qtd. ${item.quantity}`}
                    helper={item.catalogItem?.sku || "Sem SKU"}
                    href={
                      item.catalogItem?.id
                        ? `/dashboard/catalog/${item.catalogItem.id}`
                        : undefined
                    }
                  />
                ))}
              </RelatedList>
            </Panel>
          </section>
        </div>
      ) : null}

      {tab === "editar" && canEdit ? (
        <form onSubmit={saveTechnicalData} className="space-y-6">
          <EditSection title="Identificacao">
            <TextField label="Nome/apelido" field="name" form={form} setForm={setForm} required />
            <TextField label="Fabricante" field="brand" form={form} setForm={setForm} required />
            <TextField label="Numero de serie" field="serialNumber" form={form} setForm={setForm} />
            <TextField label="Tag patrimonial" field="assetTag" form={form} setForm={setForm} />
            <NumberField label="Potencia kVA" field="power" form={form} setForm={setForm} required />
            <NumberField label="Horimetro atual" field="hourMeter" form={form} setForm={setForm} />
            <TextField label="Local de instalacao" field="installationSite" form={form} setForm={setForm} />
            <TextField label="Aplicacao" field="application" form={form} setForm={setForm} />
            <SelectField label="Status operacional" field="operationalStatus" form={form} setForm={setForm} options={OPERATIONAL_STATUS_OPTIONS} />
            <SelectField label="Ciclo de vida" field="lifecycleStatus" form={form} setForm={setForm} options={LIFECYCLE_STATUS_OPTIONS} />
            <SelectField label="Criticidade" field="criticality" form={form} setForm={setForm} options={CRITICALITY_OPTIONS} />
            <TextField label="Condicao" field="condition" form={form} setForm={setForm} />
            <DateField label="Data de instalacao" field="installationDate" form={form} setForm={setForm} />
            <DateField label="Garantia ate" field="warrantyEndDate" form={form} setForm={setForm} />
          </EditSection>

          <EditSection title="Gerador">
            <TextField label="Tensao" field="voltage" form={form} setForm={setForm} />
            <TextField label="Corrente" field="ratedCurrent" form={form} setForm={setForm} />
            <NumberField label="Fator de potencia" field="powerFactor" form={form} setForm={setForm} step="0.01" />
            <NumberField label="Frequencia Hz" field="frequencyHz" form={form} setForm={setForm} />
            <NumberField label="Ano de fabricacao" field="manufactureYear" form={form} setForm={setForm} />
            <TextField label="Regime de operacao" field="operationMode" form={form} setForm={setForm} />
          </EditSection>

          <EditSection title="Motor">
            <TextField label="Fabricante" field="engineBrand" form={form} setForm={setForm} />
            <TextField label="Modelo" field="engineModelName" form={form} setForm={setForm} />
            <TextField label="Numero de serie" field="engineSerialNumber" form={form} setForm={setForm} />
            <TextField label="Potencia" field="enginePower" form={form} setForm={setForm} />
            <TextField label="Combustivel" field="fuelType" form={form} setForm={setForm} />
            <NumberField label="Cilindros" field="engineCylinders" form={form} setForm={setForm} />
            <TextField label="Oleo recomendado" field="oilRecommendation" form={form} setForm={setForm} />
            <NumberField label="Capacidade de oleo (L)" field="oilCapacityLiters" form={form} setForm={setForm} step="0.1" />
            <DateField label="Ultima troca de oleo" field="lastOilChangeAt" form={form} setForm={setForm} />
          </EditSection>

          <EditSection title="Alternador">
            <TextField label="Fabricante" field="alternatorBrand" form={form} setForm={setForm} />
            <TextField label="Modelo" field="alternatorModelName" form={form} setForm={setForm} />
            <TextField label="Numero de serie" field="alternatorSerialNumber" form={form} setForm={setForm} />
            <TextField label="Tensao" field="alternatorVoltage" form={form} setForm={setForm} />
            <NumberField label="Frequencia Hz" field="alternatorFrequencyHz" form={form} setForm={setForm} />
            <TextField label="Classe de isolacao" field="alternatorInsulationClass" form={form} setForm={setForm} />
            <TextField label="Grau de protecao" field="alternatorProtectionDegree" form={form} setForm={setForm} />
          </EditSection>

          <EditSection title="QTA / transferencia">
            <SelectField label="Possui QTA" field="hasTransferSwitch" form={form} setForm={setForm} options={BOOLEAN_OPTIONS} />
            <TextField label="Fabricante" field="transferSwitchBrand" form={form} setForm={setForm} />
            <TextField label="Modelo" field="transferSwitchModel" form={form} setForm={setForm} />
            <TextField label="Numero de serie" field="transferSwitchSerialNumber" form={form} setForm={setForm} />
            <TextField label="Corrente nominal" field="transferSwitchRatedCurrent" form={form} setForm={setForm} />
            <TextField label="Tensao de comando" field="transferSwitchCommandVoltage" form={form} setForm={setForm} />
            <TextField label="Tipo de transferencia" field="transferSwitchType" form={form} setForm={setForm} />
            <TextAreaField label="Observacoes do QTA" field="transferSwitchNotes" form={form} setForm={setForm} />
          </EditSection>

          <EditSection title="Bateria / carregador">
            <NumberField label="Quantidade de baterias" field="batteryQuantity" form={form} setForm={setForm} />
            <TextField label="Tensao" field="batteryVoltage" form={form} setForm={setForm} />
            <NumberField label="Capacidade Ah" field="batteryCapacityAh" form={form} setForm={setForm} step="0.1" />
            <DateField label="Data de instalacao" field="batteryInstallationDate" form={form} setForm={setForm} />
            <TextField label="Carregador" field="batteryChargerModel" form={form} setForm={setForm} />
            <DateField label="Ultima substituicao" field="batteryLastReplacementDate" form={form} setForm={setForm} />
            <TextAreaField label="Observacoes gerais" field="notes" form={form} setForm={setForm} />
          </EditSection>

          <div className="sticky bottom-3 flex flex-wrap justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <button type="button" onClick={() => setTab("resumo")} className={SECONDARY_BUTTON}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Salvando..." : "Salvar ficha tecnica"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>;
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <dt className="text-[11px] font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-sky-200 hover:bg-sky-50"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">{content}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function LinkCard({
  title,
  value,
  helper,
  href,
}: {
  title: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-sky-200 hover:bg-sky-50">
      <p className="break-words text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 break-words text-sm text-slate-700">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function RelatedList({ empty, children }: { empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasItems = Array.isArray(items) ? items.length > 0 : Boolean(items);
  return hasItems ? <div className="space-y-2">{items}</div> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{empty}</p>;
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={SECONDARY_BUTTON}>
      {children}
    </Link>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-slate-950 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

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
  form: EditForm;
  setForm: Dispatch<SetStateAction<EditForm>>;
};

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100";

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

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}

function formFromEquipment(equipment: Equipment): EditForm {
  const form: EditForm = {
    operationalStatus: equipment.operationalStatus || "OPERATING",
    lifecycleStatus: equipment.lifecycleStatus || "AVAILABLE",
    criticality: equipment.criticality || "B",
    hasTransferSwitch:
      equipment.hasTransferSwitch === null || equipment.hasTransferSwitch === undefined
        ? ""
        : String(equipment.hasTransferSwitch),
  };

  for (const field of TEXT_FIELDS) {
    form[field] = stringValue(equipment[field as keyof Equipment]);
  }
  for (const field of NUMBER_FIELDS) {
    form[field] = stringValue(equipment[field as keyof Equipment]);
  }
  for (const field of DATE_FIELDS) {
    form[field] = dateInputValue(equipment[field as keyof Equipment]);
  }

  return form;
}

function payloadFromForm(form: EditForm) {
  const payload: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    payload[field] = emptyToNull(form[field]);
  }
  for (const field of NUMBER_FIELDS) {
    payload[field] = numberOrNull(form[field]);
  }
  for (const field of DATE_FIELDS) {
    payload[field] = emptyToNull(form[field]);
  }

  payload.operationalStatus = form.operationalStatus || "OPERATING";
  payload.lifecycleStatus = form.lifecycleStatus || "AVAILABLE";
  payload.criticality = form.criticality || "B";
  payload.hasTransferSwitch =
    form.hasTransferSwitch === "" ? null : form.hasTransferSwitch === "true";

  return payload;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function emptyToNull(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateInputValue(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPERATING: "Operando",
    STOPPED_BY_FAILURE: "Parado por falha",
    IN_MAINTENANCE: "Em manutencao",
    DEACTIVATED: "Desativado",
    AVAILABLE: "Disponivel",
    LEASED: "Locado",
    SCRAP: "Sucata",
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
    TRIAGE: "Triagem",
    WAITING_CUSTOMER: "Aguardando cliente",
    WAITING_INTERNAL: "Aguardando interno",
    SCHEDULED: "Agendado",
    CONVERTING_TO_ORDER: "Convertendo para OS",
    CONVERTED_TO_ORDER: "Convertido para OS",
    RESOLVED: "Resolvido",
    CLOSED: "Fechado",
  };
  return status ? labels[status] || status.replace(/_/g, " ") : "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return String(value);
}

function formatHz(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value} Hz`;
}
