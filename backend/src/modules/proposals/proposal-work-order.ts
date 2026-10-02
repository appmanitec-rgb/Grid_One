import { Prisma, ProposalItemKind, ProposalType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

type ApprovedProposal = {
  id: string;
  code: string;
  generatorId: string | null;
  type: ProposalType;
  totalValue: number;
};

/** Creates the operational order in the same transaction as customer approval. */
export async function createApprovedProposalOrder(
  tx: Prisma.TransactionClient,
  proposal: ApprovedProposal,
) {
  if (proposal.type === ProposalType.PARTS) {
    const source = await tx.proposal.findUnique({
      where: { id: proposal.id },
      select: {
        clientId: true,
        totalValue: true,
        paymentTerm: true,
        items: {
          where: { kind: ProposalItemKind.PART_MATERIAL },
          include: { catalogItem: { select: { name: true } } },
        },
      },
    });
    if (!source || source.items.length === 0) {
      throw new BadRequestException(
        'A proposta de pecas nao possui itens para entrega.',
      );
    }
    if (source.items.some((item) => item.quantity <= 0)) {
      throw new BadRequestException(
        'A proposta possui quantidade de pecas invalida.',
      );
    }
    await tx.salesOrder.upsert({
      where: { proposalId: proposal.id },
      update: {},
      create: {
        code: `PV-${proposal.code}`,
        proposalId: proposal.id,
        clientId: source.clientId,
        totalValue: source.totalValue,
        paymentTerm: source.paymentTerm,
        items: {
          create: source.items.map((item) => ({
            proposalItemId: item.id,
            catalogItemId: item.catalogItemId,
            description:
              item.description?.trim() || item.catalogItem?.name || 'Peca',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
    });
    return null;
  }

  if (
    !proposal.generatorId ||
    (proposal.type !== ProposalType.SERVICES &&
      proposal.type !== ProposalType.PARTS_AND_SERVICES)
  ) {
    return null;
  }

  const generator = await tx.generator.findUnique({
    where: { id: proposal.generatorId },
    select: { currentSiteId: true },
  });
  const parts = await tx.proposalItem.findMany({
    where: {
      proposalId: proposal.id,
      kind: ProposalItemKind.PART_MATERIAL,
      catalogItemId: { not: null },
    },
    select: { catalogItemId: true, quantity: true },
  });

  return tx.maintenanceOrder.upsert({
    where: { sourceProposalId: proposal.id },
    update: {},
    create: {
      title: `OS Automatica - Proposta ${proposal.code}`,
      description: `Ordem gerada automaticamente apos aprovacao do cliente. Valor: R$ ${proposal.totalValue}`,
      sourceProposalId: proposal.id,
      generatorId: proposal.generatorId,
      siteId: generator?.currentSiteId ?? null,
      materials: parts.length
        ? {
            create: parts.map((item) => ({
              catalogItemId: item.catalogItemId!,
              quantity: item.quantity,
            })),
          }
        : undefined,
    },
  });
}
