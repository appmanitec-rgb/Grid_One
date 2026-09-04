"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  OperationalBreadcrumb,
  PermissionAwareLink,
} from "../../components/OperationalLinks";

type SupplierItem = {
  id: string;
  supplierId: string;
  supplierSku?: string | null;
  supplierPrice?: number | null;
  leadTimeDays?: number | null;
  isPrimary: boolean;
  purchasePaymentTerm?: string | null;
  purchaseTaxMode?: "AMOUNT" | "PERCENT" | null;
  purchaseTaxPercent?: number | null;
  purchaseTaxAmount?: number | null;
  freightAmount?: number | null;
  otherPurchaseCosts?: number | null;
  priceValidFrom?: string | null;
  priceValidUntil?: string | null;
  priceNotes?: string | null;
  supplier: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    cnpj?: string | null;
    paymentTerm?: string | null;
    qualityScore?: number | null;
    punctualityScore?: number | null;
  };
};

type InventoryBalance = {
  id: string;
  physicalQty: number;
  reservedQty: number;
  minQty: number;
  maxQty: number;
  reorderPoint?: number | null;
  warehouse: { id: string; code?: string | null; name: string; type?: string | null };
};

type InventoryMovement = {
  id: string;
  movementType: string;
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdAt: string;
  warehouse: { id: string; code?: string | null; name: string };
};

type PurchaseOrderItem = {
  id: string;
  quantity: number;
  receivedQty: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  purchaseOrder: {
    id: string;
    code: string;
    status: string;
    issueDate: string;
    expectedDate?: string | null;
    totalAmount?: number | null;
    supplier: { id: string; companyName: string };
  };
};

type ProposalItem = {
  id: string;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  proposal: {
    id: string;
    code: string;
    status: string;
    totalValue?: number | null;
    createdAt: string;
    client?: { id: string; companyName: string } | null;
  };
};

type PriceRevision = {
  id: string;
  previousCostPrice?: number | null;
  previousBasePrice?: number | null;
  purchaseInvoiceValue: number;
  purchaseTaxMode?: "AMOUNT" | "PERCENT" | null;
  purchaseTaxPercent?: number | null;
  purchaseTaxAmount: number;
  freightAmount: number;
  otherPurchaseCosts: number;
  calculatedPurchaseCost: number;
  salesTaxPercent: number;
  commissionPercent: number;
  profitMarginPercent: number;
  operationalCostPercent: number;
  finalSalePrice: number;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  createdAt: string;
  supplier?: { id: string; companyName: string } | null;
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
};

type CatalogOffer = {
  id: string;
  status: string;
  version: number;
  quoteNumber?: string | null;
  supplierSku?: string | null;
  effectiveUnitCost?: number | null;
  effectiveTotalCost?: number | null;
  leadTimeDays?: number | null;
  paymentTerm?: string | null;
  validUntil?: string | null;
  isPreferred?: boolean | null;
  preferenceReason?: string | null;
  supplier: { id: string; companyName: string };
};

type OrderMaterial = {
  id: string;
  quantity: number;
  unitCost?: number | null;
  reservedAt?: string | null;
  appliedAt?: string | null;
  warehouse?: { id: string; code?: string | null; name?: string | null } | null;
  order: {
    id: string;
    title: string;
    status: string;
    type: string;
    scheduledTo?: string | null;
    openedAt?: string | null;
    closedAt?: string | null;
    generator: {
      id: string;
      name: string;
      assetTag?: string | null;
      serialNumber?: string | null;
      client?: { id: string; companyName: string } | null;
    };
    contract?: { id: string; code: string; title?: string | null } | null;
    serviceReport?: { id: string; code: string; status: string } | null;
  };
};

type GeneratorBaseItem = {
  id: string;
  serviceGroup: string;
  quantity: number;
  generator: {
    id: string;
    name: string;
    assetTag?: string | null;
    serialNumber?: string | null;
    client?: { id: string; companyName: string } | null;
  };
};

type Item = {
  id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  commercialDescription?: string | null;
  type: "PART" | "SERVICE";
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
  brand?: string | null;
  manufacturerPartNumber?: string | null;
  supplier?: string | null;
  applicationNotes?: string | null;
  technicalSpecs?: Record<string, unknown> | null;
  ncm?: string | null;
  cest?: string | null;
  origin?: string | null;
  costPrice?: number | null;
  averageCost?: number | null;
  lastCost?: number | null;
  taxPercentage?: number | null;
  profitMargin?: number | null;
  basePrice: number;
  stockCurrent?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  storageLocation?: string | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  taxProfile?: Record<string, unknown> | null;
  isActive: boolean;
  supplierItems?: SupplierItem[];
  inventoryBalances?: InventoryBalance[];
  inventoryMovements?: InventoryMovement[];
  purchaseOrderItems?: PurchaseOrderItem[];
  proposalItems?: ProposalItem[];
  priceRevisions?: PriceRevision[];
  supplierOffers?: CatalogOffer[];
  maintenanceOrderMaterials?: OrderMaterial[];
  generatorBaseItems?: GeneratorBaseItem[];
  operationalSummary?: {
    physicalQty: number;
    reservedQty: number;
    availableQty: number;
    minQty?: number | null;
    maxQty?: number | null;
    reorderPoint?: number | null;
    isLowStock: boolean;
    warehouseCount: number;
    movementCount: number;
    purchaseOrderCount: number;
    maintenanceOrderCount: number;
    relatedGeneratorCount: number;
    primarySupplier?: {
      id: string;
      supplierItemId: string;
      companyName?: string | null;
      supplierSku?: string | null;
      supplierPrice?: number | null;
      leadTimeDays?: number | null;
    } | null;
  };
};

type TabKey = "summary" | "pricing" | "traceability" | "suppliers" | "technical";

export default function CatalogItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [canEdit, setCanEdit] = useState(false);
  const [canAdjust, setCanAdjust] = useState(false);
  const [canViewCosts, setCanViewCosts] = useState(false);

  useEffect(() => {
    const access = getAccessFromToken();
    setCanEdit(access.catalog.update || access.catalog.manageItems);
    setCanAdjust(access.inventory.adjust);
    setCanViewCosts(access.catalog.viewCosts);
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await apiFetch(`/catalogs/${id}`);
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(
              res,
              "Nao foi possivel carregar a ficha do item.",
            ),
          );
        }
        setItem(await res.json());
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Erro ao carregar item.",
        );
      }
    })();
  }, [id]);

  const relatedGenerators = useMemo(() => {
    const fromOrders = (item?.maintenanceOrderMaterials || [])
      .map((material) => material.order.generator)
      .filter(Boolean);
    const fromBase = (item?.generatorBaseItems || []).map((entry) => entry.generator);
    const byId = new Map<string, GeneratorBaseItem["generator"]>();
    for (const generator of [...fromOrders, ...fromBase]) {
      if (generator?.id) byId.set(generator.id, generator);
    }
    return Array.from(byId.values()).slice(0, 8);
  }, [item]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!item) return <div className="p-8 text-zinc-500">Carregando ficha do item...</div>;

  const summary = item.operationalSummary;
  const primarySupplier = item.supplierItems?.find((entry) => entry.isPrimary) || item.supplierItems?.[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <OperationalBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Estoque", href: "/dashboard/inventory" },
          { label: item.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Estoque operacional
          </p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-900">Ficha operacional do item</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Cadastro, saldo, movimentacoes, compras, OS e fornecedores em uma trilha navegavel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionAwareLink href="/dashboard/catalog" permission="catalog.view" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Catalogo
          </PermissionAwareLink>
          <PermissionAwareLink href="/dashboard/inventory" permission="inventory.view" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Estoque
          </PermissionAwareLink>
          {canAdjust ? (
            <PermissionAwareLink href="/dashboard/inventory" permission="inventory.adjust" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
              Ajustar saldo
            </PermissionAwareLink>
          ) : null}
          {canEdit ? (
            <PermissionAwareLink href={`/dashboard/catalog/new?editItemId=${item.id}`} permission="catalog.update" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Editar cadastro
            </PermissionAwareLink>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-zinc-900">{item.name}</h2>
              <Badge tone={item.isActive ? "emerald" : "slate"}>{item.isActive ? "Ativo" : "Inativo"}</Badge>
              <Badge tone={item.type === "PART" ? "blue" : "purple"}>{item.type === "PART" ? "Peca" : "Servico"}</Badge>
              {summary?.isLowStock ? <Badge tone="rose">Baixo estoque</Badge> : null}
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              SKU {item.sku || "-"} | PN {item.manufacturerPartNumber || "-"} | {item.category || "Sem categoria"}
            </p>
            <p className="mt-3 max-w-4xl text-sm text-zinc-700">
              {item.description || item.commercialDescription || "Sem descricao cadastrada."}
            </p>
          </div>
          <div className="min-w-48 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Fornecedor principal</p>
            {primarySupplier ? (
              <Link href={`/dashboard/suppliers/${primarySupplier.supplier.id}`} className="mt-1 block text-sm font-bold text-blue-700 hover:underline">
                {primarySupplier.supplier.companyName}
              </Link>
            ) : (
              <p className="mt-1 text-sm font-semibold text-zinc-700">{item.supplier || "Nao definido"}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              Prazo: {primarySupplier?.leadTimeDays != null ? `${primarySupplier.leadTimeDays} dia(s)` : "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Saldo atual" value={formatNumber(summary?.physicalQty ?? item.stockCurrent ?? 0)} />
        <Metric title="Reservado" value={formatNumber(summary?.reservedQty ?? 0)} />
        <Metric
          title="Disponivel"
          value={formatNumber(summary?.availableQty ?? Number(item.stockCurrent || 0))}
          tone={summary?.isLowStock ? "rose" : "emerald"}
        />
        <Metric title="Min / Max / Reposicao" value={`${formatNumber(summary?.minQty ?? item.stockMin ?? 0)} / ${formatNumber(summary?.maxQty ?? item.stockMax ?? 0)} / ${formatNumber(summary?.reorderPoint ?? 0)}`} />
      </section>

      <div className="flex flex-wrap gap-2">
        <TabButton label="Resumo" value="summary" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Precos" value="pricing" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Rastreabilidade" value="traceability" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Fornecedores" value="suppliers" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Tecnico/Fiscal" value="technical" active={activeTab} onClick={setActiveTab} />
      </div>

      {activeTab === "summary" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 xl:col-span-2">
            <h2 className="text-lg font-bold text-zinc-900">Saldo por almoxarifado</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {(item.inventoryBalances || []).map((balance) => {
                const available = Number(balance.physicalQty || 0) - Number(balance.reservedQty || 0);
                const trigger = Number(balance.reorderPoint ?? balance.minQty ?? 0);
                return (
                  <article key={balance.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{balance.warehouse.name}</p>
                        <p className="text-xs text-zinc-500">{balance.warehouse.code || "-"} | {balance.warehouse.type || "-"}</p>
                      </div>
                      {available <= trigger ? <Badge tone="rose">Reposicao</Badge> : <Badge tone="emerald">OK</Badge>}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <Info label="Fisico" value={formatNumber(balance.physicalQty)} />
                      <Info label="Reservado" value={formatNumber(balance.reservedQty)} />
                      <Info label="Disponivel" value={formatNumber(available)} />
                      <Info label="Minimo" value={formatNumber(balance.minQty)} />
                      <Info label="Maximo" value={formatNumber(balance.maxQty)} />
                      <Info label="Reposicao" value={formatNumber(balance.reorderPoint ?? 0)} />
                    </div>
                  </article>
                );
              })}
              {(item.inventoryBalances || []).length === 0 ? (
                <EmptyBlock text="Nenhum saldo por almoxarifado encontrado para este item." />
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-bold text-zinc-900">Cadastro</h2>
            <div className="mt-4 grid gap-3">
              <Info label="Unidade" value={item.unit || "-"} />
              <Info label="Marca" value={item.brand || "-"} />
              <Info label="Localizacao" value={item.storageLocation || "-"} />
              <Info label="Preco base" value={formatCurrency(item.basePrice)} />
              {canViewCosts ? (
                <>
                  <Info label="Custo medio" value={item.averageCost == null ? "-" : formatCurrency(item.averageCost)} />
                  <Info label="Ultimo custo" value={item.lastCost == null ? "-" : formatCurrency(item.lastCost)} />
                </>
              ) : (
                <Info label="Custos" value="Restrito por permissao" />
              )}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "pricing" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TraceSection title="Ofertas e cotacoes vigentes" empty="Nenhuma oferta registrada para este item.">
            {(item.supplierOffers || []).map((offer) => (
              <TraceRow
                key={offer.id}
                title={`${offer.supplier.companyName}${offer.isPreferred ? " | Preferencial" : ""}`}
                subtitle={`${offer.quoteNumber || `v${offer.version}`} | ${offer.status} | Validade ${formatDate(offer.validUntil)} | ${offer.paymentTerm || "Pagamento nao definido"}`}
                value={`${formatCurrency(offer.effectiveUnitCost)} / un.`}
                extraHref={`/dashboard/suppliers/${offer.supplier.id}`}
                extraLabel="Fornecedor"
              />
            ))}
          </TraceSection>

          <TraceSection title="Historico de revisoes de preco" empty="Nenhuma revisao de preco registrada.">
            {(item.priceRevisions || []).map((revision) => (
              <TraceRow
                key={revision.id}
                title={`${formatCurrency(revision.finalSalePrice)} - ${revision.supplier?.companyName || "Fornecedor nao informado"}`}
                subtitle={`${formatDate(revision.createdAt)} | Custo ${formatCurrency(revision.calculatedPurchaseCost)} | Validade ${formatDate(revision.validFrom)} ate ${formatDate(revision.validUntil)}`}
                value={`M ${formatNumber(revision.profitMarginPercent)}%`}
                extraHref={revision.supplier?.id ? `/dashboard/suppliers/${revision.supplier.id}` : undefined}
                extraLabel="Fornecedor"
              />
            ))}
          </TraceSection>

          <TraceSection title="Historico de vendas" empty="Nenhuma proposta utilizou este item ainda.">
            {(item.proposalItems || []).map((entry) => (
              <TraceRow
                key={entry.id}
                title={entry.proposal.code}
                subtitle={`${entry.proposal.status} | ${entry.proposal.client?.companyName || "Cliente nao informado"} | ${formatDate(entry.proposal.createdAt)}`}
                value={`${formatNumber(entry.quantity)} x ${formatCurrency(entry.unitPrice)} = ${formatCurrency(entry.totalPrice)}`}
                href={`/dashboard/proposals/${entry.proposal.id}`}
                extraHref={entry.proposal.client?.id ? `/dashboard/clients/${entry.proposal.client.id}` : undefined}
                extraLabel="Cliente"
              />
            ))}
          </TraceSection>
        </div>
      ) : null}

      {activeTab === "traceability" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TraceSection title="Movimentos recentes" empty="Nenhum movimento encontrado.">
            {(item.inventoryMovements || []).map((movement) => (
              <TraceRow
                key={movement.id}
                title={movementLabel(movement.movementType)}
                subtitle={`${movement.warehouse.name} | ${formatDate(movement.createdAt)} | Ref: ${movement.referenceType || "-"}`}
                value={`${formatNumber(movement.quantity)} ${item.unit || ""}`}
                href={movement.referenceType === "MAINTENANCE_ORDER" && movement.referenceId ? `/dashboard/orders/${movement.referenceId}` : undefined}
              />
            ))}
          </TraceSection>

          <TraceSection title="Compras relacionadas" empty="Nenhuma compra relacionada.">
            {(item.purchaseOrderItems || []).map((entry) => (
              <TraceRow
                key={entry.id}
                title={entry.purchaseOrder.code}
                subtitle={`${entry.purchaseOrder.status} | ${entry.purchaseOrder.supplier.companyName} | ${formatDate(entry.purchaseOrder.issueDate)}`}
                value={`${formatNumber(entry.receivedQty)} / ${formatNumber(entry.quantity)}`}
                href="/dashboard/purchase-orders"
                extraHref={`/dashboard/suppliers/${entry.purchaseOrder.supplier.id}`}
                extraLabel="Fornecedor"
              />
            ))}
          </TraceSection>

          <TraceSection title="OS relacionadas" empty="Nenhuma OS consumiu ou reservou este item.">
            {(item.maintenanceOrderMaterials || []).map((material) => (
              <TraceRow
                key={material.id}
                title={material.order.title}
                subtitle={`${material.order.status} | ${material.order.generator.name} | ${material.warehouse?.code || material.warehouse?.name || "Sem almoxarifado"}`}
                value={`${formatNumber(material.quantity)} ${item.unit || ""}`}
                href={`/dashboard/orders/${material.order.id}`}
                extraHref={`/dashboard/equipments/${material.order.generator.id}`}
                extraLabel="Equipamento"
              />
            ))}
          </TraceSection>

          <TraceSection title="Equipamentos relacionados" empty="Nenhum equipamento relacionado via OS ou itens base.">
            {relatedGenerators.map((generator) => (
              <TraceRow
                key={generator.id}
                title={generator.name}
                subtitle={`${generator.client?.companyName || "Sem cliente"} | Serie ${generator.serialNumber || "-"}`}
                value={generator.assetTag || "Sem tag"}
                href={`/dashboard/equipments/${generator.id}`}
                extraHref={generator.client?.id ? `/dashboard/clients/${generator.client.id}` : undefined}
                extraLabel="Cliente"
              />
            ))}
          </TraceSection>
        </div>
      ) : null}

      {activeTab === "suppliers" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-bold text-zinc-900">Fornecedores vinculados</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(item.supplierItems || []).map((supplierItem) => (
              <article key={supplierItem.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/dashboard/suppliers/${supplierItem.supplier.id}`} className="font-bold text-blue-700 hover:underline">
                      {supplierItem.supplier.companyName}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">{supplierItem.supplier.cnpj || supplierItem.supplier.tradeName || "-"}</p>
                  </div>
                  {supplierItem.isPrimary ? <Badge tone="emerald">Principal</Badge> : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Info label="SKU fornecedor" value={supplierItem.supplierSku || "-"} />
                  <Info label="Lead time" value={supplierItem.leadTimeDays != null ? `${supplierItem.leadTimeDays} dia(s)` : "-"} />
                  <Info label="Preco" value={supplierItem.supplierPrice == null ? "Restrito" : formatCurrency(supplierItem.supplierPrice)} />
                  <Info label="Pagamento" value={supplierItem.purchasePaymentTerm || supplierItem.supplier.paymentTerm || "-"} />
                  <Info label="Imposto compra" value={formatPurchaseTax(supplierItem)} />
                  <Info label="Validade" value={`${formatDate(supplierItem.priceValidFrom)} ate ${formatDate(supplierItem.priceValidUntil)}`} />
                </div>
                {supplierItem.priceNotes ? (
                  <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                    {supplierItem.priceNotes}
                  </p>
                ) : null}
              </article>
            ))}
            {(item.supplierItems || []).length === 0 ? (
              <EmptyBlock text="Nenhum fornecedor vinculado a este item." />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "technical" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-bold text-zinc-900">Dados tecnicos</h2>
            <p className="mt-2 text-sm text-zinc-600">{item.applicationNotes || "Sem observacoes de aplicacao."}</p>
            <div className="mt-4">
              <KeyValueList data={item.technicalSpecs} emptyLabel="Sem especificacoes tecnicas adicionais." />
            </div>
          </section>
          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-bold text-zinc-900">Fiscal e logistica</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Info label="NCM" value={item.ncm || "-"} />
              <Info label="CEST" value={item.cest || "-"} />
              <Info label="Origem" value={item.origin || "-"} />
              <Info label="Peso B/L" value={`${item.grossWeight ?? "-"} / ${item.netWeight ?? "-"}`} />
            </div>
            <div className="mt-4">
              <KeyValueList data={item.taxProfile} emptyLabel="Sem regras fiscais adicionais." />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string;
  tone?: "slate" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-900";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-800">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "blue" | "purple" | "emerald" | "rose" | "slate";
}) {
  const classes = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{children}</span>;
}

function TabButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: TabKey;
  active: TabKey;
  onClick: (value: TabKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active === value
          ? "bg-blue-600 text-white"
          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  );
}

function TraceSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const rows = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? rows : <EmptyBlock text={empty} />}
      </div>
    </section>
  );
}

function TraceRow({
  title,
  subtitle,
  value,
  href,
  extraHref,
  extraLabel,
}: {
  title: string;
  subtitle: string;
  value: string;
  href?: string;
  extraHref?: string;
  extraLabel?: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {href ? (
            <Link href={href} className="font-bold text-blue-700 hover:underline">
              {title}
            </Link>
          ) : (
            <p className="font-bold text-zinc-900">{title}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <p className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-zinc-800">{value}</p>
      </div>
      {extraHref ? (
        <Link href={extraHref} className="mt-3 inline-flex text-xs font-bold text-zinc-600 hover:text-blue-700 hover:underline">
          {extraLabel || "Abrir vinculo"}
        </Link>
      ) : null}
    </article>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500">
      {text}
    </div>
  );
}

function KeyValueList({ data, emptyLabel }: { data?: Record<string, unknown> | null; emptyLabel: string }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <Info key={key} label={key} value={String(value)} />
      ))}
    </div>
  );
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : "0";
}

function formatCurrency(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatPurchaseTax(item: {
  purchaseTaxMode?: "AMOUNT" | "PERCENT" | null;
  purchaseTaxPercent?: number | null;
  purchaseTaxAmount?: number | null;
}) {
  if (item.purchaseTaxMode === "PERCENT") {
    return `${formatNumber(item.purchaseTaxPercent)}%`;
  }
  return formatCurrency(item.purchaseTaxAmount);
}

function movementLabel(value: string) {
  const labels: Record<string, string> = {
    IN: "Entrada",
    OUT: "Saida",
    TRANSFER_IN: "Transferencia entrada",
    TRANSFER_OUT: "Transferencia saida",
    RESERVATION: "Reserva",
    RELEASE: "Liberacao",
    ADJUSTMENT: "Ajuste",
    PURCHASE_RECEIPT: "Recebimento de compra",
    OS_CONSUMPTION: "Consumo em OS",
  };
  return labels[value] || value;
}
