import type { Prisma } from '@prisma/client';

export function pendingHandoffWhere(): Prisma.ProposalWhereInput {
  return {
    OR: [
      { hasDownPayment: true, downPaymentConfirmedAt: null },
      { type: 'CONTRACT', generatedContract: { is: null } },
      { type: 'GENERATOR_SALE', postSaleConvertedAt: null },
      {
        type: { in: ['PARTS', 'PARTS_AND_SERVICES'] },
        salesOrder: { is: null },
      },
      { salesOrder: { status: { notIn: ['DELIVERED', 'CLOSED'] } } },
      {
        type: { in: ['SERVICES', 'PARTS_AND_SERVICES'] },
        OR: [
          { executionOrder: { is: null } },
          { executionOrder: { status: 'CANCELED' } },
          {
            executionOrder: {
              status: { not: 'COMPLETED' },
              OR: [{ technicianId: null }, { scheduledTo: null }],
            },
          },
        ],
      },
    ],
  };
}
type Sale = {
  status: string;
  type: string;
  hasDownPayment: boolean;
  downPaymentConfirmedAt: unknown;
  generatedContract: unknown;
  postSaleConvertedAt: unknown;
  salesOrder: { status: string } | null;
  executionOrder: {
    status: string;
    technicianId: string | null;
    scheduledTo: unknown;
  } | null;
};
export function handoffSteps(
  proposal: Sale,
  availability: Array<{ status: string }>,
) {
  if (proposal.status !== 'WON') return [];
  const order = proposal.salesOrder;
  const orderFinished =
    !!order && ['DELIVERED', 'CLOSED'].includes(order.status);
  const execution = proposal.executionOrder;
  const steps: Array<{ step: string; title: string; department: string }> = [];
  if (proposal.hasDownPayment && !proposal.downPaymentConfirmedAt)
    steps.push({
      step: 'finance',
      title: 'Confirmar entrada',
      department: 'Financeiro',
    });
  if (
    !orderFinished &&
    order?.status !== 'CANCELED' &&
    availability.some((item) => item.status === 'PURCHASE_REQUIRED')
  )
    steps.push({
      step: 'purchase',
      title: 'Conferir necessidade de compra',
      department: 'Compras',
    });
  if (
    !orderFinished &&
    (order || ['PARTS', 'PARTS_AND_SERVICES'].includes(proposal.type))
  )
    steps.push({
      step: 'separation',
      title:
        order?.status === 'CANCELED'
          ? 'Revisar pedido de venda cancelado'
          : order
            ? 'Acompanhar separação e entrega'
            : 'Conferir geração do pedido de venda',
      department: 'Almoxarifado',
    });
  if (proposal.type === 'CONTRACT' && !proposal.generatedContract)
    steps.push({
      step: 'contract',
      title: 'Revisar conversão em contrato',
      department: 'Contratos',
    });
  if (proposal.type === 'GENERATOR_SALE' && !proposal.postSaleConvertedAt)
    steps.push({
      step: 'postSale',
      title: 'Conferir pós-venda do gerador',
      department: 'Comercial de geradores',
    });
  if (
    ['SERVICES', 'PARTS_AND_SERVICES'].includes(proposal.type) &&
    execution?.status !== 'COMPLETED' &&
    (!execution ||
      execution.status === 'CANCELED' ||
      !execution.technicianId ||
      !execution.scheduledTo)
  )
    steps.push({
      step: 'planning',
      title:
        execution?.status === 'CANCELED'
          ? 'Revisar execução cancelada'
          : execution
            ? 'Confirmar equipe e programação'
            : 'Conferir liberação para O.S.',
      department: 'Planejamento',
    });
  return steps;
}
