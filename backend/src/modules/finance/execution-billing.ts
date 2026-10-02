import {
  AccountsReceivableStatus,
  AuditDomain,
  CostCenterEntryType,
  ExecutionBillingCategory,
  OrderStatus,
  Prisma,
  ProposalItemKind,
  ProposalStatus,
  ProposalType,
} from '@prisma/client';

export type ExecutionBillingResult = {
  status: 'CREATED' | 'ALREADY_BILLED' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE';
  reason?: string;
  receivableIds: string[];
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

/** Creates receivables only when the approved commercial amount and due date are reliable. */
export async function billCompletedExecution(
  tx: Prisma.TransactionClient,
  orderId: string,
  options: { dueDate?: Date; actorUserId?: string } = {},
): Promise<ExecutionBillingResult> {
  const order = await tx.maintenanceOrder.findUnique({
    where: { id: orderId },
    include: {
      generator: { select: { clientId: true } },
      sourceProposal: {
        include: {
          items: { select: { kind: true, totalPrice: true } },
        },
      },
    },
  });
  const result = (
    status: ExecutionBillingResult['status'],
    reason?: string,
  ): ExecutionBillingResult => ({ status, reason, receivableIds: [] });
  if (!order || order.status !== OrderStatus.COMPLETED || order.contractId)
    return result('NOT_APPLICABLE');
  const proposal = order.sourceProposal;
  if (!proposal)
    return result('REVIEW_REQUIRED', 'OS sem proposta comercial vinculada.');
  if (
    proposal.status !== ProposalStatus.WON ||
    (proposal.type !== ProposalType.SERVICES &&
      proposal.type !== ProposalType.PARTS_AND_SERVICES)
  ) {
    return result(
      'REVIEW_REQUIRED',
      'A proposta vinculada nao esta aprovada como servico.',
    );
  }
  if (proposal.clientId !== order.generator.clientId)
    return result(
      'REVIEW_REQUIRED',
      'Cliente da proposta difere do cliente do equipamento.',
    );
  if (proposal.hasDownPayment)
    return result(
      'REVIEW_REQUIRED',
      'Proposta com entrada exige conferencia dos pagamentos anteriores.',
    );
  const totalCents = Math.round(Number(proposal.totalValue) * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0)
    return result('REVIEW_REQUIRED', 'Proposta sem valor comercial valido.');

  const existing = await tx.accountsReceivable.findMany({
    where: {
      maintenanceOrderId: orderId,
      status: { not: AccountsReceivableStatus.CANCELED },
    },
    select: { id: true },
  });
  if (existing.length)
    return {
      status: 'ALREADY_BILLED',
      receivableIds: existing.map((row) => row.id),
    };
  const canceled = await tx.accountsReceivable.findFirst({
    where: {
      maintenanceOrderId: orderId,
      status: AccountsReceivableStatus.CANCELED,
    },
    select: { id: true },
  });
  if (canceled)
    return result(
      'REVIEW_REQUIRED',
      'Cobranca anterior cancelada: confira o motivo antes de reemitir.',
    );

  const now = new Date();
  const requestedDate = options.dueDate ?? proposal.firstDueDate;
  if (
    !requestedDate ||
    Number.isNaN(requestedDate.getTime()) ||
    requestedDate.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)
  ) {
    return result(
      'REVIEW_REQUIRED',
      'Financeiro deve definir um vencimento atual antes de gerar os titulos.',
    );
  }
  const installments = proposal.installmentCount ?? 1;
  const intervalDays = proposal.installmentIntervalDays ?? 30;
  if (
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 36 ||
    !Number.isInteger(intervalDays) ||
    intervalDays < 1
  ) {
    return result('REVIEW_REQUIRED', 'Parcelamento comercial invalido.');
  }

  const partsBase = proposal.items
    .filter((item) => item.kind === ProposalItemKind.PART_MATERIAL)
    .reduce((sum, item) => sum + Number(item.totalPrice), 0);
  const serviceBase = proposal.items
    .filter((item) => item.kind !== ProposalItemKind.PART_MATERIAL)
    .reduce((sum, item) => sum + Number(item.totalPrice), 0);
  if (partsBase < 0 || serviceBase < 0 || partsBase + serviceBase <= 0) {
    return result(
      'REVIEW_REQUIRED',
      'Itens da proposta sem valores validos para separar pecas e servicos.',
    );
  }
  const partsCents =
    partsBase > 0 && serviceBase > 0
      ? Math.round((totalCents * partsBase) / (partsBase + serviceBase))
      : partsBase > 0
        ? totalCents
        : 0;
  if (
    (partsBase > 0 && partsCents === 0) ||
    (serviceBase > 0 && totalCents - partsCents === 0)
  ) {
    return result(
      'REVIEW_REQUIRED',
      'Valor insuficiente para separar pecas e servicos.',
    );
  }
  const categories = [
    {
      category: ExecutionBillingCategory.PARTS,
      cents: partsCents,
      label: 'Pecas',
    },
    {
      category: ExecutionBillingCategory.SERVICES,
      cents: totalCents - partsCents,
      label: 'Servicos',
    },
  ].filter((group) => group.cents > 0);
  if (categories.some((group) => group.cents < installments)) {
    return result(
      'REVIEW_REQUIRED',
      'Valor de alguma categoria e menor que o numero de parcelas.',
    );
  }

  const receivableIds: string[] = [];
  for (const group of categories) {
    const baseCents = Math.floor(group.cents / installments);
    for (let number = 1; number <= installments; number++) {
      const cents =
        baseCents +
        (number === installments ? group.cents - baseCents * installments : 0);
      const amount = cents / 100;
      const receivable = await tx.accountsReceivable.create({
        data: {
          clientId: order.generator.clientId,
          maintenanceOrderId: order.id,
          costCenterId: order.costCenterId,
          executionBillingKey: `${order.id}:${group.category}:${number}`,
          executionBillingCategory: group.category,
          installmentNumber: number,
          installmentCount: installments,
          description: `OS ${order.title} - ${group.label} - proposta ${proposal.code}${installments > 1 ? ` - ${number}/${installments}` : ''}`,
          competenceDate: order.finishedAt ?? now,
          dueDate: addDays(requestedDate, (number - 1) * intervalDays),
          grossAmount: amount,
          netAmount: amount,
          status: AccountsReceivableStatus.OPEN,
        },
      });
      receivableIds.push(receivable.id);
      if (order.costCenterId) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: order.costCenterId,
            entryType: CostCenterEntryType.REVENUE,
            sourceType: 'ACCOUNTS_RECEIVABLE',
            sourceId: receivable.id,
            amount,
            competenceDate: order.finishedAt ?? now,
          },
        });
      }
      const audit = {
        domain: AuditDomain.FINANCE,
        entityType: 'ACCOUNTS_RECEIVABLE',
        entityId: receivable.id,
        action: 'AUTO_BILL_EXECUTION',
        actorUserId: options.actorUserId,
        afterPayload: {
          maintenanceOrderId: order.id,
          sourceProposalId: proposal.id,
          category: group.category,
          installment: number,
          amount,
        },
      };
      await tx.financialAuditLog.create({
        data: {
          module: 'FINANCE',
          entityType: audit.entityType,
          entityId: audit.entityId,
          action: audit.action,
          actorUserId: audit.actorUserId,
          payload: audit.afterPayload,
        },
      });
      await tx.systemAuditLog.create({ data: audit });
    }
  }
  return { status: 'CREATED', receivableIds };
}
