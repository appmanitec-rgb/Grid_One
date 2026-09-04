"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_STATUS_OPTIONS, FLOW_STEPS, statusLabel, statusToFlowStep } from "../flow";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import {
  clearAuthSession,
  decodeJwtPayload,
  getStoredAccessToken,
} from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  InlineMessage,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextInput,
} from "../../components/DashboardPageKit";
import {
  OperationalBreadcrumb,
  PermissionAwareLink,
  RelatedEntityGrid,
} from "../../components/OperationalLinks";

type Proposal = {
  id: string;
  code: string;
  status: string;
  type: string;
  totalValue: number;
  validUntil?: string | null;
  paymentTerm?: string | null;
  deliveryLeadTimeDays?: number | null;
  paymentDetails?: string | null;
  hasDownPayment?: boolean | null;
  downPaymentAmount?: number | null;
  installmentCount?: number | null;
  installmentIntervalDays?: number | null;
  firstDueDate?: string | null;
  requestedDiscountPercent?: number | null;
  requestedDiscountReason?: string | null;
  parentProposal?: { id: string; code: string } | null;
  revisions?: Array<{ id: string; code: string; status: string; createdAt: string }>;
  client?: { id: string; companyName: string } | null;
  generator?: { id: string; name: string } | null;
  salesOpportunity?: {
    id: string;
    title: string;
    stage: string;
    pipeline?: string | null;
    opportunityType?: string | null;
  } | null;
  generatedContract?: { id: string; code: string; status: string } | null;
  user?: { id: string; name: string; role: string } | null;
  items: Array<{
    id: string;
    kind?: string | null;
    description?: string | null;
    quantity: number;
    hours?: number | null;
    unitPrice: number;
    discountPercent?: number | null;
    totalPrice: number;
    hourType?: string | null;
    technicianType?: string | null;
    catalogItem?: { name: string } | null;
  }>;
  movements?: Array<{
    id: string;
    action: string;
    note?: string | null;
    fromStatus?: string | null;
    toStatus: string;
    createdAt: string;
    actorUser?: { id: string; name: string; role: string } | null;
  }>;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

const OPERATIONAL_PROPOSAL_TYPES = new Set(["SERVICES", "PARTS_AND_SERVICES"]);

export default function ProposalDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [adminStatus, setAdminStatus] = useState("DRAFT");
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountPercentInput, setDiscountPercentInput] = useState("10");
  const [discountReason, setDiscountReason] = useState("");

  const tokenPayload = useMemo(() => {
    const token = getStoredAccessToken();
    if (!token) return null;
    return decodeJwtPayload<{ role?: string }>(token);
  }, []);

  const viewerRole = tokenPayload?.role || "NORMAL";
  const isBoard = viewerRole === "ADMIN";
  const isClient = viewerRole === "CLIENT";
  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiFetch(apiUrl(`/proposals/${id}`), { cache: "no-store" });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Não foi possível carregar a proposta."),
        );
      }
      setProposal(await res.json());
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Erro ao carregar proposta."));
    }
  }, [handleUnauthorized, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (proposal?.status) {
      setAdminStatus(proposal.status);
    }
  }, [proposal?.status]);

  useEffect(() => {
    if (proposal?.status !== "CLIENT_REVIEW") {
      setShowDiscountForm(false);
    }
  }, [proposal?.status]);

  async function runAction(
    path: string,
    body?: unknown,
    redirectToNew = false,
  ): Promise<boolean> {
    if (!proposal) return false;
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(apiUrl(`/proposals/${proposal.id}/${path}`), {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (await handleUnauthorized(res)) return false;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha na ação."));
      }

      const data = await res.json();
      if (redirectToNew && data?.id) {
        router.push(`/dashboard/proposals/${data.id}`);
        return true;
      }
      if (path === "convert-contract" && data?.contract?.id) {
        router.push(`/dashboard/contracts/${data.contract.id}`);
        return true;
      }
      if (
        path === "client-approve" &&
        !isClient &&
        OPERATIONAL_PROPOSAL_TYPES.has(proposal.type) &&
        data?.ordemDeServico?.id
      ) {
        router.push(`/dashboard/orders/${data.ordemDeServico.id}`);
        return true;
      }
      await load();
      setNotice("Ação executada com sucesso.");
      return true;
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Erro ao executar ação."));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRequestDiscount() {
    const percent = Number(discountPercentInput.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0) {
      setError("Informe um percentual de desconto válido.");
      return;
    }

    const executed = await runAction("request-discount", {
      discountPercent: percent,
      reason: discountReason.trim() || undefined,
    });

    if (executed) {
      setShowDiscountForm(false);
      setDiscountPercentInput("10");
      setDiscountReason("");
    }
  }

  async function updateStatusDirect(nextStatus: string) {
    if (!proposal || !nextStatus || nextStatus === proposal.status) return;
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(apiUrl(`/proposals/${proposal.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao atualizar status."),
        );
      }

      await load();
      setNotice(`Status atualizado para ${statusLabel(nextStatus)}.`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Erro ao atualizar status."));
    } finally {
      setIsBusy(false);
    }
  }

  if (!proposal) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title="Carregando proposta"
          description="Estamos reunindo o contexto comercial, os itens e o histórico desta proposta."
        />
      </div>
    );
  }

  const proposalItems = proposal.items ?? [];
  const downPayment = Number(proposal.downPaymentAmount || 0);
  const installments = Math.max(1, Number(proposal.installmentCount || 1));
  const remaining = Math.max(0, Number(proposal.totalValue || 0) - downPayment);
  const installmentValue = remaining / installments;
  const flowStatusKey = statusToFlowStep(proposal.status);
  const flowCurrentIndex = FLOW_STEPS.findIndex((step) => step.key === flowStatusKey);
  const isOperationalProposal = OPERATIONAL_PROPOSAL_TYPES.has(proposal.type);
  const canOpenDispatchFromProposal =
    proposal.status === "WON" && isOperationalProposal && Boolean(proposal.generator?.id) && !isClient;

  const flowActions: Array<{
    label: string;
    tone: "primary" | "danger" | "amber";
    confirmText?: string;
    run: () => Promise<void>;
  }> = [];

  if (proposal.status === "DRAFT") {
    flowActions.push({
      label: "Enviar para diretoria",
      tone: "primary",
      run: async () => {
        await runAction("submit-board");
      },
    });
  }

  if (proposal.status === "REVISION_REQUIRED") {
    flowActions.push({
      label: "Reenviar para diretoria",
      tone: "primary",
      run: async () => {
        await runAction("submit-board");
      },
    });
  }

  if (proposal.status === "BOARD_REVIEW" && isBoard) {
    flowActions.push(
      {
        label: "Aprovar diretoria",
        tone: "primary",
        confirmText: "Aprovar esta proposta para seguir no fluxo comercial?",
        run: async () => {
          await runAction("board-approve");
        },
      },
      {
        label: "Solicitar ajustes",
        tone: "amber",
        confirmText: "Solicitar ajustes nesta proposta?",
        run: async () => {
          await runAction("board-reject", {
            note: "Diretoria solicitou ajustes.",
          });
        },
      },
    );
  }

  if (proposal.status === "CLIENT_REVIEW") {
    flowActions.push(
      {
        label: isClient ? "Aprovar proposta" : "Marcar como ganho",
        tone: "primary",
        confirmText: isClient
          ? "Confirmar aprovação desta proposta?"
          : "Marcar esta proposta como ganha?",
        run: async () => {
          await runAction("client-approve");
        },
      },
      {
        label: isClient ? "Recusar proposta" : "Marcar como perdido",
        tone: "danger",
        confirmText: isClient
          ? "Confirmar recusa desta proposta?"
          : "Marcar esta proposta como perdida?",
        run: async () => {
          await runAction("client-reject", {
            note: "Cliente recusou a proposta.",
          });
        },
      },
    );

    if (!isClient) {
      flowActions.push({
        label: "Solicitar desconto",
        tone: "amber",
        run: async () => {
          setError("");
          setNotice("");
          setShowDiscountForm((current) => !current);
        },
      });
    }
  }

  return (
    <div className="space-y-6">
      <OperationalBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: isClient ? "Portal" : "Propostas", href: "/dashboard/proposals" },
          { label: `Proposta ${proposal.code}` },
        ]}
      />

      <PageHero
        compact
        eyebrow="Proposta comercial"
        title={`Proposta ${proposal.code}`}
        description={
          isClient
            ? `Status atual: ${statusLabel(proposal.status)}. Revise condições, itens e responda quando a proposta estiver pronta para sua decisão.`
            : `Status atual: ${statusLabel(proposal.status)}. Fluxo, condições comerciais, itens e histórico em uma leitura única.`
        }
        stats={[
          {
            label: "Valor total",
            value: formatCurrency(Number(proposal.totalValue || 0)),
            helper: "Montante total desta proposta.",
            tone: statusTone(proposal.status),
          },
          {
            label: "Validade",
            value: proposal.validUntil ? formatDate(proposal.validUntil) : "Sem data",
            helper: "Prazo comercial vigente.",
            tone: "slate",
          },
          {
            label: "Parcelamento",
            value: `${installments}x`,
            helper: `${formatCurrency(installmentValue)} por parcela.`,
            tone: "blue",
          },
          {
            label: "Histórico",
            value: String(proposal.movements?.length || 0),
            helper: "Eventos registrados nesta proposta.",
            tone: "amber",
          },
        ]}
        actions={
          <>
            {proposal.status === "WON" && proposal.type === "CONTRACT" && !proposal.generatedContract && !isClient ? (
              <ActionButton
                busy={isBusy}
                onClick={() => {
                  if (!window.confirm("Converter esta proposta ganha em contrato?")) {
                    return;
                  }
                  void runAction("convert-contract");
                }}
              >
                Converter em contrato
              </ActionButton>
            ) : null}
            {canOpenDispatchFromProposal ? (
              <PermissionAwareLink
                href={buildProposalDispatchHref(proposal)}
                permission="orders.create"
                className={PRIMARY_BUTTON}
              >
                Abrir O.S. no despacho
              </PermissionAwareLink>
            ) : null}
            {!isClient ? (
              <ActionButton
                busy={isBusy}
                onClick={() => {
                  if (!window.confirm("Criar uma nova revisão desta proposta?")) {
                    return;
                  }
                  void runAction("revise", undefined, true);
                }}
              >
                Revisar proposta
              </ActionButton>
            ) : null}
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Contexto da proposta
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DataPill tone={statusTone(proposal.status)}>
                  {statusLabel(proposal.status)}
                </DataPill>
                <DataPill tone="slate">{proposal.type}</DataPill>
                {proposal.generatedContract ? (
                  <DataPill tone="emerald">Contrato gerado</DataPill>
                ) : null}
              </div>
            </div>
            <MiniInfo
              label="Cliente"
              value={proposal.client?.companyName || "Não vinculado"}
              helper="Cadastro comercial que recebe esta proposta."
            />
            <MiniInfo
              label="Equipamento"
              value={proposal.generator?.name || "Não vinculado"}
              helper="Ativo ou conjunto técnico associado."
            />
            <MiniInfo
              label="Criado por"
              value={proposal.user?.name || "Sistema"}
              helper="Origem do registro e da negociação."
            />
          </FieldBox>
        }
      />
      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Navegacao cruzada"
        title="Relacionamentos da proposta"
        description="Atalhos seguros para a origem comercial, cliente, equipamento, documento e contrato gerado quando houver."
      >
        <RelatedEntityGrid
          items={[
            ...(proposal.client
              ? [{
                  label: proposal.client.companyName,
                  description: "Cliente vinculado a proposta.",
                  href: `/dashboard/clients/${proposal.client.id}`,
                  badge: "Cliente",
                  tone: "blue" as const,
                  permission: "clients.view",
                }]
              : []),
            ...(proposal.generator
              ? [{
                  label: proposal.generator.name,
                  description: "Equipamento associado a proposta.",
                  href: `/dashboard/equipments/${proposal.generator.id}`,
                  badge: "Equipamento",
                  tone: "slate" as const,
                  permission: "equipments.view",
                }]
              : []),
            ...(proposal.salesOpportunity && !isClient
              ? [{
                  label: proposal.salesOpportunity.title,
                  description: `Etapa CRM: ${opportunityStageLabel(proposal.salesOpportunity.stage)}.`,
                  href: `/dashboard/opportunities?opportunityId=${proposal.salesOpportunity.id}`,
                  badge: "Oportunidade",
                  tone: "amber" as const,
                  permission: "proposals.view",
                }]
              : []),
            ...(proposal.generatedContract && !isClient
              ? [{
                  label: proposal.generatedContract.code,
                  description: `Contrato ${statusLabel(proposal.generatedContract.status)}.`,
                  href: `/dashboard/contracts/${proposal.generatedContract.id}`,
                  badge: "Contrato",
                  tone: "emerald" as const,
                  permission: "contracts.view",
                }]
              : []),
            {
              label: `Documento ${proposal.code}`,
              description: "Visualizacao documental da proposta.",
              href: `/dashboard/documents/proposals/${proposal.id}`,
              badge: "Documento",
              tone: "slate" as const,
              permission: "proposals.view",
            },
          ]}
        />
      </SectionCard>

      {proposal.salesOpportunity && !isClient ? (
        <SectionCard
          eyebrow="Origem CRM"
          title={proposal.salesOpportunity.title}
          description={`Oportunidade vinculada ao funil comercial. Etapa atual: ${opportunityStageLabel(proposal.salesOpportunity.stage)}.`}
          actions={
            <>
              {!isClient ? (
                <PermissionAwareLink
                  href={`/dashboard/opportunities?opportunityId=${proposal.salesOpportunity.id}`}
                  permission="proposals.view"
                  className={SECONDARY_BUTTON}
                >
                  Abrir oportunidade
                </PermissionAwareLink>
              ) : null}
              {!isClient ? (
                <PermissionAwareLink
                  href={`/dashboard/proposals/new?opportunityId=${proposal.salesOpportunity.id}`}
                  permission="proposals.create"
                  className={SECONDARY_BUTTON}
                >
                  Nova proposta vinculada
                </PermissionAwareLink>
              ) : null}
            </>
          }
        >
          <InlineMessage>
            O modulo deixa claro quando a proposta nasceu do CRM para manter o contexto da
            negociação conectado ao restante da trilha comercial.
          </InlineMessage>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Governanca do fluxo"
        title="Ritmo comercial e aprovações"
        description={
          isClient
            ? "Acompanhe a etapa atual e responda quando a proposta estiver em analise do cliente."
            : "Acompanhe o passo atual da proposta, acione mudanças de etapa e trate solicitações de desconto sem perder o contexto."
        }
        actions={
          proposal.status === "REVISION_REQUIRED" ? (
            <DataPill tone="amber">Em revisão para diretoria</DataPill>
          ) : (
            <DataPill tone={statusTone(proposal.status)}>
              {statusLabel(proposal.status)}
            </DataPill>
          )
        }
      >
        <div className="grid gap-3 md:grid-cols-5">
          {FLOW_STEPS.map((step, index) => {
            const isCurrent = step.key === flowStatusKey;
            const isDone = flowCurrentIndex > index;
            return (
              <div
                key={step.key}
                className={`rounded-[22px] border px-4 py-4 ${
                  isCurrent
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : isDone
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-slate-50/80 text-slate-500"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                  Etapa {index + 1}
                </p>
                <p className="mt-2 text-sm font-semibold">{step.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {flowActions.length > 0 ? (
            flowActions.map((action) => (
              <StatusActionButton
                key={action.label}
                busy={isBusy}
                tone={action.tone}
                onClick={() => {
                  if (action.confirmText && !window.confirm(action.confirmText)) {
                    return;
                  }
                  void action.run();
                }}
              >
                {action.label}
              </StatusActionButton>
            ))
          ) : (
            <InlineMessage>
              Nenhuma mudanca de status disponivel para esta etapa.
            </InlineMessage>
          )}
        </div>

        {showDiscountForm ? (
          <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4">
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto]">
              <FormField label="Percentual (%)">
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={discountPercentInput}
                  onChange={(event) => setDiscountPercentInput(event.target.value)}
                  className="border-amber-200 bg-white"
                />
              </FormField>
              <FormField label="Motivo comercial">
                <TextInput
                  type="text"
                  value={discountReason}
                  onChange={(event) => setDiscountReason(event.target.value)}
                  placeholder="Explique o motivo do desconto."
                  className="border-amber-200 bg-white"
                />
              </FormField>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    void handleRequestDiscount();
                  }}
                  className={PRIMARY_BUTTON}
                >
                  Enviar
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setShowDiscountForm(false);
                    setDiscountPercentInput("10");
                    setDiscountReason("");
                  }}
                  className={SECONDARY_BUTTON}
                >
                  Cancelar
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              Descontos dentro da alçada do usuário podem ser liberados automaticamente.
              Acima do limite, o pedido segue para aprovação.
            </p>
          </div>
        ) : null}

        {isBoard ? (
          <div className="mt-5 rounded-[24px] border border-sky-200 bg-sky-50/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">
              Controle direto admin
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SelectInput
                value={adminStatus}
                onChange={(event) => setAdminStatus(event.target.value)}
                className="min-w-[240px] border-sky-200 bg-white"
              >
                {ADMIN_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </SelectInput>
              <button
                type="button"
                disabled={isBusy || adminStatus === proposal.status}
                onClick={() => {
                  void updateStatusDirect(adminStatus);
                }}
                className={PRIMARY_BUTTON}
              >
                Atualizar status
              </button>
              <p className="text-sm text-sky-900">
                Admins podem mover livremente entre etapas.
              </p>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {proposal.requestedDiscountPercent ? (
        <StatusBanner tone="amber">
          Desconto solicitado: {proposal.requestedDiscountPercent.toFixed(2)}%
          {proposal.requestedDiscountReason ? ` - ${proposal.requestedDiscountReason}` : ""}
        </StatusBanner>
      ) : null}

      <SectionCard
        eyebrow="Resumo executivo"
        title="Leitura rápida da proposta"
        description="Contexto essencial para decidir, revisar ou converter em contrato."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Status" value={statusLabel(proposal.status)} tone={statusTone(proposal.status)} />
          <Info label="Tipo" value={proposal.type} />
          <Info label="Valor total" value={formatCurrency(Number(proposal.totalValue || 0))} tone="emerald" />
          <Info label="Cliente" value={proposal.client?.companyName || "-"} />
          <Info label="Equipamento" value={proposal.generator?.name || "-"} />
          <Info label="Criado por" value={proposal.user?.name || "-"} />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Condições comerciais"
        title="Pagamento, prazo e vencimentos"
        description="Base financeira e logística que sustenta esta negociação."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Validade" value={proposal.validUntil ? formatDate(proposal.validUntil) : "-"} />
          <Info label="Condição de pagamento" value={proposal.paymentTerm || "-"} />
          <Info label="Prazo de entrega (dias)" value={proposal.deliveryLeadTimeDays != null ? String(proposal.deliveryLeadTimeDays) : "-"} />
          <Info label="Primeiro vencimento" value={proposal.firstDueDate ? formatDate(proposal.firstDueDate) : "-"} />
          <Info label="Intervalo parcelas (dias)" value={proposal.installmentIntervalDays != null ? String(proposal.installmentIntervalDays) : "-"} />
          <Info label="Parcelamento" value={`${installments}x de ${formatCurrency(installmentValue)}`} />
          <Info label="Entrada" value={proposal.hasDownPayment ? formatCurrency(downPayment) : "Sem entrada"} />
          <Info label="Saldo após entrada" value={formatCurrency(remaining)} />
        </div>
      </SectionCard>

      {proposal.paymentDetails ? (
        <SectionCard
          eyebrow="Financeiro"
          title="Dados para pagamento"
          description="Observações complementares para o fechamento financeiro."
        >
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {proposal.paymentDetails}
            </p>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Escopo da proposta"
        title="Itens comerciais"
        description="Resumo dos itens, quantidades e valores unitários que compõem a proposta."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-semibold">Item</th>
                <th className="px-3 py-3 font-semibold">Quantidade</th>
                <th className="px-3 py-3 font-semibold">Unitário</th>
                <th className="px-3 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposalItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 text-slate-800">
                    <p className="font-medium">
                      {item.catalogItem?.name || item.description || "Item"}
                    </p>
                    {item.kind === "HOURLY_SERVICE" ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {item.hourType || "Hora"} | {item.technicianType || "Tecnico"}
                        {item.discountPercent ? ` | desconto ${item.discountPercent}%` : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {item.kind === "HOURLY_SERVICE"
                      ? `${Number(item.hours || 0).toLocaleString("pt-BR")} h`
                      : item.quantity}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatCurrency(Number(item.unitPrice || 0))}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    {formatCurrency(Number(item.totalPrice || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposalItems.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nenhum item cadastrado"
                description="Inclua itens na proposta para fechar a composição comercial."
              />
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Relacionamentos"
        title="Revisões da proposta"
        description="Novas rodadas comerciais associadas a este histórico."
      >
        {(!proposal.revisions || proposal.revisions.length === 0) ? (
          <EmptyState
            title="Sem revisões"
            description="Novas rodadas de proposta aparecerão aqui."
          />
        ) : (
          <div className="space-y-2">
            {proposal.revisions.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/proposals/${r.id}`}
                className="block rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.code}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <DataPill tone={statusTone(r.status)}>{statusLabel(r.status)}</DataPill>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Trilha operacional"
        title="Movimentações registradas"
        description="Linha do tempo das ações aplicadas nesta proposta."
      >
        {(!proposal.movements || proposal.movements.length === 0) ? (
          <EmptyState
            title="Sem movimentações registradas"
            description="A trilha operacional aparecerá aqui conforme o fluxo evoluir."
          />
        ) : (
          <div className="space-y-3">
            {proposal.movements.map((m) => (
              <div
                key={m.id}
                className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {m.action} - {statusLabel(m.toStatus)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {m.actorUser?.name || "Sistema"} em {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                  <DataPill tone={statusTone(m.toStatus)}>{statusLabel(m.toStatus)}</DataPill>
                </div>
                {m.note ? <p className="mt-3 text-sm text-slate-700">{m.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={PRIMARY_BUTTON}
    >
      {children}
    </button>
  );
}

function StatusActionButton({
  busy,
  onClick,
  children,
  tone,
}: {
  busy: boolean;
  onClick: () => void;
  children: ReactNode;
  tone: "primary" | "danger" | "amber";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-sky-600 hover:bg-sky-500"
      : tone === "danger"
        ? "bg-rose-600 hover:bg-rose-500"
        : "bg-amber-600 hover:bg-amber-500";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function Info({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "blue"
        ? "border-sky-200 bg-sky-50/70"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50/70"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50/70"
            : "border-slate-200 bg-slate-50/85";

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function opportunityStageLabel(stage: string) {
  const map: Record<string, string> = {
    PROSPECTION: "Prospecção",
    SITE_SURVEY_SCHEDULED: "Vistoria Agendada",
    PROPOSAL_SENT: "Proposta Enviada",
    NEGOTIATION: "Em Negociação",
    WON: "Ganha",
    LOST: "Perdida",
  };

  return map[stage] || stage;
}

function buildProposalDispatchHref(proposal: Proposal) {
  const params = new URLSearchParams({
    proposalId: proposal.id,
    title: `Execucao da proposta ${proposal.code}`,
    description: [
      `Demanda originada da proposta ${proposal.code}.`,
      proposal.client?.companyName ? `Cliente: ${proposal.client.companyName}.` : "",
      proposal.generator?.name ? `Equipamento: ${proposal.generator.name}.` : "",
      `Valor comercial: ${formatCurrency(Number(proposal.totalValue || 0))}.`,
    ]
      .filter(Boolean)
      .join("\n"),
    type: proposal.type === "SERVICES" ? "CORRECTIVE" : "INSTALLATION",
    priority: "NORMAL",
  });

  if (proposal.generator?.id) params.set("generatorId", proposal.generator.id);
  return `/dashboard/dispatch?${params.toString()}`;
}

function statusTone(status: string): Tone {
  const flowStep = statusToFlowStep(status);

  if (flowStep === "BOARD_REVIEW") return "blue";
  if (flowStep === "CLIENT_REVIEW") return "amber";
  if (flowStep === "WON") return "emerald";
  if (flowStep === "LOST") return "rose";
  return "slate";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem registro";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}
