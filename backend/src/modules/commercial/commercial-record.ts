import type { Prisma } from '@prisma/client';
export const itemSelect = {
  id: true,
  kind: true,
  description: true,
  catalogItemId: true,
  quantity: true,
  hours: true,
  unitPrice: true,
  discountPercent: true,
  totalPrice: true,
} satisfies Prisma.ProposalItemSelect;
export const comparisonSelect = {
  id: true,
  code: true,
  totalValue: true,
  discount: true,
  scope: true,
  paymentTerm: true,
  paymentPlan: true,
  paymentSelections: true,
  deliveryLeadTimeDays: true,
  freight: true,
  validUntil: true,
  operationalExpenses: true,
  externalNotes: true,
  items: { select: itemSelect, orderBy: { id: 'asc' as const } },
} satisfies Prisma.ProposalSelect;
export const proposalSelect = {
  ...comparisonSelect,
  type: true,
  status: true,
  origin: true,
  userId: true,
  updatedAt: true,
  createdAt: true,
  requestedDiscountPercent: true,
  requestedDiscountReason: true,
  parentProposalId: true,
  hasDownPayment: true,
  downPaymentConfirmedAt: true,
  postSaleConvertedAt: true,
  client: { select: { id: true, companyName: true, tradeName: true } },
  user: { select: { id: true, name: true } },
  generator: { select: { id: true, name: true } },
  salesOrder: {
    select: {
      id: true,
      code: true,
      status: true,
      items: {
        select: {
          quantity: true,
          deliveredQty: true,
          allocations: { select: { pickedQty: true, reservedQty: true } },
        },
      },
    },
  },
  executionOrder: {
    select: { id: true, status: true, technicianId: true, scheduledTo: true },
  },
  generatedContract: { select: { id: true, code: true, status: true } },
} satisfies Prisma.ProposalSelect;
