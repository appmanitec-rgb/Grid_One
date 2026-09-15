"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  FLOW_STEPS,
  statusLabel,
  statusToFlowStep,
} from "../flow";
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
  origin?: "MANITEC" | "EXTERNAL";
  externalReference?: string | null;
  externalCurrency?: string | null;
  externalDocumentFileName?: string | null;
  postSaleGeneratorId?: string | null;
  postSaleGenerator?: { id: string; name: string } | null;
  postSaleConvertedAt?: string | null;
  commercialSnapshot?: { version?: number; capturedAt?: string } | null;
  totalValue: number;
  operationalExpensesTotal?: number | null;
  allowOperationalExpenseDiscount?: boolean;
  operationalExpenses?: Array<{
    expenseType: string;
    label: string;
    unitLabel: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
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
  revisions?: Array<{
    id: string;
    code: string;
    status: string;
    createdAt: string;
  }>;
  client?: { id: string; companyName: string } | null;
  generator?: { id: string; name: string } | null;
  commercialGenerator?: {
    id: string;
    manufacturer: string;
    model: string;
    standbyPowerKva: number;
  } | null;
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
type ReasonedAction = "REVISE" | "REQUEST_ADJUSTMENTS" | "REJECT";

export default function ProposalDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountPercentInput, setDiscountPercentInput] = useState("10");
  const [discountReason, setDiscountReason] = useState("");
  const [showPostSaleForm, setShowPostSaleForm] = useState(false);
  const [postSaleName, setPostSaleName] = useState("");
  const [postSaleSerial, setPostSaleSerial] = useState("");
  const [reasonedAction, setReasonedAction] = useState<ReasonedAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionReasonError, setActionReasonError] = useState("");

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
      const res = await apiFetch(apiUrl(`/proposals/${id}`), {
        cache: "no-store",
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Não foi possível carregar a proposta.",
          ),
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

  function openReasonedAction(action: ReasonedAction) {
    setReasonedAction(action);
    setActionReason("");
    setActionReasonError("");
  }

  function closeReasonedAction() {
    if (isBusy) return;
    setReasonedAction(null);
    setActionReason("");
    setActionReasonError("");
  }

  async function submitReasonedAction() {
    if (!reasonedAction) return;
    const reason = actionReason.trim();
    if (reason.length < 5) {
      setActionReasonError("Informe uma justificativa com pelo menos 5 caracteres.");
      return;
    }

    setActionReasonError("");
    const succeeded =
      reasonedAction === "REVISE"
        ? await runAction("revise", { reason }, true)
        : reasonedAction === "REQUEST_ADJUSTMENTS"
          ? await runAction("board-request-adjustments", { reason })
          : await runAction("board-reject", { reason });

    if (succeeded) closeReasonedAction();
  }

  async function downloadExternalDocument() {
    if (!proposal) return;
    setError("");
    try {
      const response = await apiFetch(
        `/proposals/${proposal.id}/external-document`,
      );
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Falha ao baixar documento externo.",
          ),
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        proposal.externalDocumentFileName || `proposta-${proposal.code}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError: unknown) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Falha ao baixar documento externo.",
      );
    }
  }

  async function convertToPostSale() {
    if (!proposal || !postSaleName.trim()) {
      setError("Informe o nome que identificara o equipamento no pos-venda.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const response = await apiFetch(
        `/proposals/${proposal.id}/convert-post-sale`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: postSaleName.trim(),
            serialNumber: postSaleSerial.trim() || undefined,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Falha ao converter venda para o pos-venda.",
          ),
        );
      const result = (await response.json()) as { generator?: { id: string } };
      if (result.generator?.id) {
        router.push(`/dashboard/equipments/${result.generator.id}`);
        return;
      }
      await load();
    } catch (conversionError: unknown) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Falha ao converter venda para o pos-venda.",
      );
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
  const proposalCurrency = proposal.externalCurrency || "BRL";
  const downPayment = Number(proposal.downPaymentAmount || 0);
  const installments = Math.max(1, Number(proposal.installmentCount || 1));
  const remaining = Math.max(0, Number(proposal.totalValue || 0) - downPayment);
  const installmentValue = remaining / installments;
  const flowStatusKey = statusToFlowStep(proposal.status);
  const flowCurrentIndex = FLOW_STEPS.findIndex(
    (step) => step.key === flowStatusKey,
  );
  const isOperationalProposal = OPERATIONAL_PROPOSAL_TYPES.has(proposal.type);
  const canOpenDispatchFromProposal =
    proposal.status === "WON" &&
    isOperationalProposal &&
    Boolean(proposal.generator?.id) &&
    !isClient;
  const canCreateRevision =
    !isClient &&
    (!proposal.revisions || proposal.revisions.length === 0) &&
    [
      "DRAFT",
      "REVISION_REQUIRED",
      "CLIENT_REVIEW",
      "LOST",
      "REJECTED",
      "SENT",
    ].includes(proposal.status);

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
        run: async () => {
          openReasonedAction("REQUEST_ADJUSTMENTS");
        },
      },
      {
        label: "Reprovar proposta",
        tone: "danger",
        run: async () => {
          openReasonedAction("REJECT");
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
      {reasonedAction ? (
        <ReasonedActionDialog
          action={reasonedAction}
          reason={actionReason}
          error={actionReasonError}
          busy={isBusy}
          onReasonChange={(value) => {
            setActionReason(value);
            if (actionReasonError) setActionReasonError("");
          }}
          onCancel={closeReasonedAction}
          onConfirm={() => void submitReasonedAction()}
        />
      ) : null}
      <OperationalBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          {
            label: isClient ? "Portal" : "Propostas",
            href: "/dashboard/proposals",
          },
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
            value: formatCurrency(
              Number(proposal.totalValue || 0),
              proposalCurrency,
            ),
            helper: "Montante total desta proposta.",
            tone: statusTone(proposal.status),
          },
          {
            label: "Validade",
            value: proposal.validUntil
              ? formatDate(proposal.validUntil)
              : "Sem data",
            helper: "Prazo comercial vigente.",
            tone: "slate",
          },
          {
            label: "Parcelamento",
            value: `${installments}x`,
            helper: `${formatCurrency(installmentValue, proposalCurrency)} por parcela.`,
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
            {proposal.origin === "EXTERNAL" &&
            proposal.externalDocumentFileName ? (
              <ActionButton
                busy={isBusy}
                onClick={() => void downloadExternalDocument()}
              >
                Baixar documento externo
              </ActionButton>
            ) : null}
            {proposal.status === "WON" &&
            proposal.type === "GENERATOR_SALE" &&
            !proposal.postSaleGeneratorId &&
            !isClient ? (
              <ActionButton
                busy={isBusy}
                onClick={() => setShowPostSaleForm((current) => !current)}
              >
                Converter para pós-venda
              </ActionButton>
            ) : null}
            {proposal.status === "WON" &&
            proposal.type === "CONTRACT" &&
            !proposal.generatedContract &&
            !isClient ? (
              <ActionButton
                busy={isBusy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Converter esta proposta ganha em contrato?",
                    )
                  ) {
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
            {canCreateRevision ? (
              <ActionButton
                busy={isBusy}
                onClick={() => openReasonedAction("REVISE")}
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
              value={proposalEquipmentLabel(proposal)}
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

      {showPostSaleForm && proposal.type === "GENERATOR_SALE" ? (
        <SectionCard
          eyebrow="Conversao pos-venda"
          title="Criar pre-cadastro do equipamento vendido"
          description="O ativo nasce separado do catalogo comercial e permanece inativo ate a instalacao ou entrega tecnica."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome do equipamento">
              <TextInput
                value={postSaleName}
                onChange={(event) => setPostSaleName(event.target.value)}
                placeholder={`Gerador ${proposal.commercialGenerator?.model || proposal.externalReference || proposal.code}`}
              />
            </FormField>
            <FormField label="Numero de serie (opcional)">
              <TextInput
                value={postSaleSerial}
                onChange={(event) => setPostSaleSerial(event.target.value)}
              />
            </FormField>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void convertToPostSale()}
            className={`${PRIMARY_BUTTON} mt-5`}
          >
            Criar pre-cadastro e abrir equipamento
          </button>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Navegacao cruzada"
        title="Relacionamentos da proposta"
        description="Atalhos seguros para a origem comercial, cliente, equipamento, documento e contrato gerado quando houver."
      >
        <RelatedEntityGrid
          items={[
            ...(proposal.client
              ? [
                  {
                    label: proposal.client.companyName,
                    description: "Cliente vinculado a proposta.",
                    href: `/dashboard/clients/${proposal.client.id}`,
                    badge: "Cliente",
                    tone: "blue" as const,
                    permission: "clients.view",
                  },
                ]
              : []),
            ...(proposal.generator
              ? [
                  {
                    label: proposal.generator.name,
                    description: "Equipamento associado a proposta.",
                    href: `/dashboard/equipments/${proposal.generator.id}`,
                    badge: "Equipamento",
                    tone: "slate" as const,
                    permission: "equipments.view",
                  },
                ]
              : []),
            ...(proposal.salesOpportunity && !isClient
              ? [
                  {
                    label: proposal.salesOpportunity.title,
                    description: `Etapa CRM: ${opportunityStageLabel(proposal.salesOpportunity.stage)}.`,
                    href: `/dashboard/opportunities?opportunityId=${proposal.salesOpportunity.id}`,
                    badge: "Oportunidade",
                    tone: "amber" as const,
                    permission: "proposals.view",
                  },
                ]
              : []),
            ...(proposal.generatedContract && !isClient
              ? [
                  {
                    label: proposal.generatedContract.code,
                    description: `Contrato ${statusLabel(proposal.generatedContract.status)}.`,
                    href: `/dashboard/contracts/${proposal.generatedContract.id}`,
                    badge: "Contrato",
                    tone: "emerald" as const,
                    permission: "contracts.view",
                  },
                ]
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
            O modulo deixa claro quando a proposta nasceu do CRM para manter o
            contexto da negociação conectado ao restante da trilha comercial.
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
            <DataPill tone="amber">Conteúdo bloqueado — gere uma revisão</DataPill>
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
                  if (
                    action.confirmText &&
                    !window.confirm(action.confirmText)
                  ) {
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
                  onChange={(event) =>
                    setDiscountPercentInput(event.target.value)
                  }
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
              Descontos dentro da alçada do usuário podem ser liberados
              automaticamente. Acima do limite, o pedido segue para aprovação.
            </p>
          </div>
        ) : null}

      </SectionCard>

      {proposal.requestedDiscountPercent ? (
        <StatusBanner tone="amber">
          Desconto solicitado: {proposal.requestedDiscountPercent.toFixed(2)}%
          {proposal.requestedDiscountReason
            ? ` - ${proposal.requestedDiscountReason}`
            : ""}
        </StatusBanner>
      ) : null}

      <SectionCard
        eyebrow="Resumo executivo"
        title="Leitura rápida da proposta"
        description="Contexto essencial para decidir, revisar ou converter em contrato."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info
            label="Status"
            value={statusLabel(proposal.status)}
            tone={statusTone(proposal.status)}
          />
          <Info label="Tipo" value={proposalTypeLabel(proposal.type)} />
          <Info
            label="Origem"
            value={proposal.origin === "EXTERNAL" ? "Externa" : "Manitec"}
          />
          {proposal.externalReference ? (
            <Info
              label="Referencia externa"
              value={proposal.externalReference}
            />
          ) : null}
          {proposal.commercialSnapshot?.capturedAt ? (
            <Info
              label="Snapshot comercial"
              value={`v${proposal.commercialSnapshot.version || 1} · ${formatDateTime(proposal.commercialSnapshot.capturedAt)}`}
            />
          ) : null}
          <Info
            label="Valor total"
            value={formatCurrency(
              Number(proposal.totalValue || 0),
              proposalCurrency,
            )}
            tone="emerald"
          />
          <Info label="Cliente" value={proposal.client?.companyName || "-"} />
          <Info label="Equipamento" value={proposalEquipmentLabel(proposal)} />
          <Info label="Criado por" value={proposal.user?.name || "-"} />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Condições comerciais"
        title="Pagamento, prazo e vencimentos"
        description="Base financeira e logística que sustenta esta negociação."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info
            label="Validade"
            value={proposal.validUntil ? formatDate(proposal.validUntil) : "-"}
          />
          <Info
            label="Condição de pagamento"
            value={proposal.paymentTerm || "-"}
          />
          <Info
            label="Prazo de entrega (dias)"
            value={
              proposal.deliveryLeadTimeDays != null
                ? String(proposal.deliveryLeadTimeDays)
                : "-"
            }
          />
          <Info
            label="Primeiro vencimento"
            value={
              proposal.firstDueDate ? formatDate(proposal.firstDueDate) : "-"
            }
          />
          <Info
            label="Intervalo parcelas (dias)"
            value={
              proposal.installmentIntervalDays != null
                ? String(proposal.installmentIntervalDays)
                : "-"
            }
          />
          <Info
            label="Parcelamento"
            value={`${installments}x de ${formatCurrency(installmentValue, proposalCurrency)}`}
          />
          <Info
            label="Entrada"
            value={
              proposal.hasDownPayment
                ? formatCurrency(downPayment, proposalCurrency)
                : "Sem entrada"
            }
          />
          <Info
            label="Saldo após entrada"
            value={formatCurrency(remaining, proposalCurrency)}
          />
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
                        {item.hourType || "Hora"} |{" "}
                        {item.technicianType || "Tecnico"}
                        {item.discountPercent
                          ? ` | desconto ${item.discountPercent}%`
                          : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {item.kind === "HOURLY_SERVICE"
                      ? `${Number(item.hours || 0).toLocaleString("pt-BR")} h`
                      : item.quantity}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatCurrency(
                      Number(item.unitPrice || 0),
                      proposalCurrency,
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    {formatCurrency(
                      Number(item.totalPrice || 0),
                      proposalCurrency,
                    )}
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

      {!isClient && proposal.operationalExpenses?.length ? (
        <SectionCard
          eyebrow="Uso interno"
          title="Despesas operacionais"
          description={`Composicao completa congelada nesta proposta. ${
            proposal.allowOperationalExpenseDiscount
              ? "Despesas participaram da base de desconto."
              : "Despesas foram protegidas de desconto."
          } O cliente recebe apenas o total e os tipos marcados.`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-3 font-semibold">Despesa</th>
                  <th className="px-3 py-3 font-semibold">Quantidade</th>
                  <th className="px-3 py-3 font-semibold">Tarifa</th>
                  <th className="px-3 py-3 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {proposal.operationalExpenses.map((expense) => (
                  <tr
                    key={expense.expenseType}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {expense.label}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {Number(expense.quantity).toLocaleString("pt-BR")} {expense.unitLabel}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatCurrency(expense.unitPrice, proposalCurrency)}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {formatCurrency(expense.total, proposalCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-right font-bold text-slate-950">
              Despesas operacionais: {formatCurrency(
                Number(proposal.operationalExpensesTotal || 0),
                proposalCurrency,
              )}
            </p>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Relacionamentos"
        title="Revisões da proposta"
        description="Novas rodadas comerciais associadas a este histórico."
      >
        {!proposal.revisions || proposal.revisions.length === 0 ? (
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
                    <p className="text-sm font-semibold text-slate-900">
                      {r.code}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <DataPill tone={statusTone(r.status)}>
                    {statusLabel(r.status)}
                  </DataPill>
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
        {!proposal.movements || proposal.movements.length === 0 ? (
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
                      {m.actorUser?.name || "Sistema"} em{" "}
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                  <DataPill tone={statusTone(m.toStatus)}>
                    {statusLabel(m.toStatus)}
                  </DataPill>
                </div>
                {m.note ? (
                  <p className="mt-3 text-sm text-slate-700">{m.note}</p>
                ) : null}
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

function ReasonedActionDialog({
  action,
  reason,
  error,
  busy,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  action: ReasonedAction;
  reason: string;
  error: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const content = {
    REVISE: {
      eyebrow: "Nova revisão comercial",
      title: "Por que esta proposta precisa ser revisada?",
      description:
        "A versão atual será bloqueada como Revisada e uma nova versão será criada em Rascunho.",
      placeholder: "Ex.: incluir item solicitado pelo cliente e atualizar o prazo de entrega.",
      confirm: "Criar nova revisão",
      button: "bg-slate-950 hover:bg-slate-800",
    },
    REQUEST_ADJUSTMENTS: {
      eyebrow: "Decisão da diretoria",
      title: "Quais ajustes o vendedor deve realizar?",
      description:
        "A versão atual ficará bloqueada em Ajustes solicitados. O vendedor deverá gerar uma nova revisão para editar.",
      placeholder: "Descreva objetivamente os itens, valores ou condições que precisam ser corrigidos.",
      confirm: "Solicitar ajustes",
      button: "bg-amber-600 hover:bg-amber-500",
    },
    REJECT: {
      eyebrow: "Decisão definitiva da diretoria",
      title: "Por que esta proposta está sendo reprovada?",
      description:
        "A proposta ficará em Reprovada e não seguirá para o cliente. Uma revisão poderá ser criada posteriormente, se necessário.",
      placeholder: "Ex.: fornecimento não autorizado para este cliente neste momento.",
      confirm: "Reprovar proposta",
      button: "bg-rose-600 hover:bg-rose-500",
    },
  }[action];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-action-title"
    >
      <div className="w-full max-w-2xl rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {content.eyebrow}
        </p>
        <h2 id="proposal-action-title" className="mt-2 text-2xl font-bold text-slate-950">
          {content.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{content.description}</p>

        <label className="mt-5 block text-sm font-semibold text-slate-800">
          Justificativa obrigatória
          <textarea
            autoFocus
            rows={5}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={content.placeholder}
            className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className={`text-xs ${error ? "font-semibold text-rose-600" : "text-slate-500"}`}>
            {error || "O motivo será registrado na trilha operacional e na auditoria."}
          </p>
          <p className="text-xs text-slate-400">{reason.trim().length} caracteres</p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${content.button}`}
          >
            {busy ? "Processando..." : content.confirm}
          </button>
        </div>
      </div>
    </div>
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
      <p className="mt-3 break-words text-sm font-medium text-slate-800">
        {value}
      </p>
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
      proposal.client?.companyName
        ? `Cliente: ${proposal.client.companyName}.`
        : "",
      proposal.generator?.name
        ? `Equipamento: ${proposal.generator.name}.`
        : "",
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

function proposalEquipmentLabel(proposal: Proposal) {
  if (proposal.commercialGenerator) {
    return `${proposal.commercialGenerator.manufacturer} ${proposal.commercialGenerator.model} - ${proposal.commercialGenerator.standbyPowerKva} kVA`;
  }
  return proposal.generator?.name || "Não vinculado";
}

function proposalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    GENERATOR_SALE: "Venda de gerador",
    PARTS: "Peças",
    SERVICES: "Serviços",
    PARTS_AND_SERVICES: "Peças e serviços",
    CONTRACT: "Contrato",
  };
  return labels[type] || type;
}

function statusTone(status: string): Tone {
  const flowStep = statusToFlowStep(status);

  if (flowStep === "REVISION_REQUIRED") return "amber";
  if (flowStep === "REJECTED") return "rose";
  if (flowStep === "BOARD_REVIEW") return "blue";
  if (flowStep === "CLIENT_REVIEW") return "amber";
  if (flowStep === "WON") return "emerald";
  if (flowStep === "LOST") return "rose";
  return "slate";
}

function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
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
