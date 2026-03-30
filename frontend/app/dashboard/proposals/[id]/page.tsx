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
  salesOpportunity?: { id: string; title: string; stage: string } | null;
  generatedContract?: { id: string; code: string; status: string } | null;
  user?: { id: string; name: string; role: string } | null;
  items: Array<{ id: string; quantity: number; unitPrice: number; totalPrice: number; catalogItem?: { name: string } | null }>;
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

  const isBoard = tokenPayload?.role === "ADMIN";
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
          await readApiErrorMessage(res, "Nao foi possivel carregar a proposta."),
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
        throw new Error(await readApiErrorMessage(res, "Falha na acao."));
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
      await load();
      setNotice("Acao executada com sucesso.");
      return true;
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Erro ao executar acao."));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRequestDiscount() {
    const percent = Number(discountPercentInput.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0) {
      setError("Informe um percentual de desconto valido.");
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
          description="Estamos reunindo o contexto comercial, os itens e o historico desta proposta."
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

  const flowActions: Array<{
    label: string;
    tone: "primary" | "danger" | "amber";
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
        run: async () => {
          await runAction("board-approve");
        },
      },
      {
        label: "Solicitar ajustes",
        tone: "amber",
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
        label: "Marcar como ganho",
        tone: "primary",
        run: async () => {
          await runAction("client-approve");
        },
      },
      {
        label: "Marcar como perdido",
        tone: "danger",
        run: async () => {
          await runAction("client-reject", {
            note: "Cliente recusou a proposta.",
          });
        },
      },
      {
        label: "Solicitar desconto",
        tone: "amber",
        run: async () => {
          setError("");
          setNotice("");
          setShowDiscountForm((current) => !current);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Proposta comercial"
        title={`Proposta ${proposal.code}`}
        description={`Status atual: ${statusLabel(proposal.status)}. Esta visao organiza fluxo, condicoes comerciais, itens e historico em uma leitura unica.`}
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
            label: "Historico",
            value: String(proposal.movements?.length || 0),
            helper: "Eventos registrados nesta proposta.",
            tone: "amber",
          },
        ]}
        actions={
          <>
            {proposal.status === "WON" && !proposal.generatedContract ? (
              <ActionButton busy={isBusy} onClick={() => runAction("convert-contract")}>
                Converter em contrato
              </ActionButton>
            ) : null}
            {proposal.generatedContract ? (
              <Link
                href={`/dashboard/contracts/${proposal.generatedContract.id}`}
                className={PRIMARY_BUTTON}
              >
                Ver contrato {proposal.generatedContract.code}
              </Link>
            ) : null}
            <ActionButton busy={isBusy} onClick={() => runAction("revise", undefined, true)}>
              Revisar proposta
            </ActionButton>
            <Link href="/dashboard/proposals" className={SECONDARY_BUTTON}>
              Voltar para carteira
            </Link>
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
              value={proposal.client?.companyName || "Nao vinculado"}
              helper="Cadastro comercial que recebe esta proposta."
            />
            <MiniInfo
              label="Equipamento"
              value={proposal.generator?.name || "Nao vinculado"}
              helper="Ativo ou conjunto tecnico associado."
            />
            <MiniInfo
              label="Criado por"
              value={proposal.user?.name || "Sistema"}
              helper="Origem do registro e da negociacao."
            />
          </FieldBox>
        }
      />
      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {proposal.salesOpportunity ? (
        <SectionCard
          eyebrow="Origem CRM"
          title={proposal.salesOpportunity.title}
          description={`Oportunidade vinculada ao funil comercial. Etapa atual: ${opportunityStageLabel(proposal.salesOpportunity.stage)}.`}
          actions={
            <>
              <Link
                href={`/dashboard/opportunities?opportunityId=${proposal.salesOpportunity.id}`}
                className={SECONDARY_BUTTON}
              >
                Abrir oportunidade
              </Link>
              <Link
                href={`/dashboard/proposals/new?opportunityId=${proposal.salesOpportunity.id}`}
                className={SECONDARY_BUTTON}
              >
                Nova proposta vinculada
              </Link>
            </>
          }
        >
          <InlineMessage>
            O modulo deixa claro quando a proposta nasceu do CRM para manter o contexto da
            negociacao conectado ao restante da trilha comercial.
          </InlineMessage>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Governanca do fluxo"
        title="Ritmo comercial e aprovacoes"
        description="Acompanhe o passo atual da proposta, acione mudancas de etapa e trate solicitacoes de desconto sem perder o contexto."
        actions={
          proposal.status === "REVISION_REQUIRED" ? (
            <DataPill tone="amber">Em revisao para diretoria</DataPill>
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
              Descontos dentro da alcada do usuario podem ser liberados automaticamente.
              Acima do limite, o pedido segue para aprovacao.
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
        title="Leitura rapida da proposta"
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
        eyebrow="Condicoes comerciais"
        title="Pagamento, prazo e vencimentos"
        description="Base financeira e logistica que sustenta esta negociacao."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Validade" value={proposal.validUntil ? formatDate(proposal.validUntil) : "-"} />
          <Info label="Condicao de pagamento" value={proposal.paymentTerm || "-"} />
          <Info label="Prazo de entrega (dias)" value={proposal.deliveryLeadTimeDays != null ? String(proposal.deliveryLeadTimeDays) : "-"} />
          <Info label="Primeiro vencimento" value={proposal.firstDueDate ? formatDate(proposal.firstDueDate) : "-"} />
          <Info label="Intervalo parcelas (dias)" value={proposal.installmentIntervalDays != null ? String(proposal.installmentIntervalDays) : "-"} />
          <Info label="Parcelamento" value={`${installments}x de ${formatCurrency(installmentValue)}`} />
          <Info label="Entrada" value={proposal.hasDownPayment ? formatCurrency(downPayment) : "Sem entrada"} />
          <Info label="Saldo apos entrada" value={formatCurrency(remaining)} />
        </div>
      </SectionCard>

      {proposal.paymentDetails ? (
        <SectionCard
          eyebrow="Financeiro"
          title="Dados para pagamento"
          description="Observacoes complementares para o fechamento financeiro."
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
        description="Resumo dos itens, quantidades e valores unitarios que compoem a proposta."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-3 font-semibold">Item</th>
                <th className="px-3 py-3 font-semibold">Quantidade</th>
                <th className="px-3 py-3 font-semibold">Unitario</th>
                <th className="px-3 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposalItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 text-slate-800">{item.catalogItem?.name || "Item"}</td>
                  <td className="px-3 py-3 text-slate-600">{item.quantity}</td>
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
                description="Inclua itens na proposta para fechar a composicao comercial."
              />
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Relacionamentos"
        title="Revisoes da proposta"
        description="Novas rodadas comerciais associadas a este historico."
      >
        {(!proposal.revisions || proposal.revisions.length === 0) ? (
          <EmptyState
            title="Sem revisoes"
            description="Novas rodadas de proposta aparecerao aqui."
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
        title="Movimentacoes registradas"
        description="Linha do tempo das acoes aplicadas nesta proposta."
      >
        {(!proposal.movements || proposal.movements.length === 0) ? (
          <EmptyState
            title="Sem movimentacoes registradas"
            description="A trilha operacional aparecera aqui conforme o fluxo evoluir."
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
    PROSPECTION: "Prospeccao",
    SITE_SURVEY_SCHEDULED: "Vistoria Agendada",
    PROPOSAL_SENT: "Proposta Enviada",
    NEGOTIATION: "Em Negociacao",
    WON: "Ganha",
    LOST: "Perdida",
  };

  return map[stage] || stage;
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
