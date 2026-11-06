import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  moneyCents,
  roundedLineTotal,
} from '../proposals/proposal-review.domain';

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export const TEMPLATE_VARIABLES = [
  'cliente.nome',
  'vendedor.nome',
  'proposta.codigo',
  'proposta.total',
  'proposta.validade',
  'proposta.itens',
  'proposta.escopo',
  'equipamento.nome',
] as const;
export function validateTemplate(body: string) {
  const variables = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(
    (match) => match[1].trim(),
  );
  const invalid = variables.filter(
    (value) => !(TEMPLATE_VARIABLES as readonly string[]).includes(value),
  );
  if (invalid.length)
    throw new BadRequestException(
      `Variáveis não permitidas: ${[...new Set(invalid)].join(', ')}.`,
    );
  if (/[{}]/.test(body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '')))
    throw new BadRequestException('Confira as chaves das variáveis do modelo.');
  if (!body.trim())
    throw new BadRequestException('Informe o conteúdo do modelo.');
}
export function renderTemplate(body: string, values: Record<string, string>) {
  validateTemplate(body);
  return body.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_, key: string) => values[key.trim()] ?? 'Não informado',
  );
}
export function proposalSourceHash(value: {
  totalValue: number;
  items: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}) {
  // Status transitions and downloads do not invalidate an otherwise identical
  // commercial estimate. Hash the commercial facts, not the record timestamp.
  const fields = [
    'totalValue',
    'items',
    'discount',
    'scope',
    'paymentTerm',
    'paymentPlan',
    'paymentSelections',
    'deliveryLeadTimeDays',
    'freight',
    'validUntil',
    'operationalExpenses',
    'externalNotes',
  ];
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(fields.map((key) => [key, value[key] ?? null])),
      ),
    )
    .digest('hex');
}
export function estimateProfit(input: {
  revenue: number;
  items: Array<{
    key: string;
    quantity: number;
    unitCost: number | null;
    source: string;
    description?: string;
  }>;
  laborCost?: number;
  travelCost?: number;
  freightCost?: number;
  otherCost?: number;
}) {
  const missing = input.items
    .filter((item) => item.unitCost === null)
    .map((item) => item.description || item.key);
  const extras = [
    'laborCost',
    'travelCost',
    'freightCost',
    'otherCost',
  ] as const;
  const labels = {
    laborCost: 'Mão de obra adicional',
    travelCost: 'Deslocamento',
    freightCost: 'Frete',
    otherCost: 'Outros custos e tributos',
  };
  for (const key of extras)
    if (input[key] === undefined) missing.push(labels[key]);
  if (
    !Number.isFinite(input.revenue) ||
    input.revenue < 0 ||
    input.items.some(
      (item) =>
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        (item.unitCost !== null &&
          (!Number.isFinite(item.unitCost) || item.unitCost < 0)),
    ) ||
    extras.some(
      (key) =>
        input[key] !== undefined &&
        (!Number.isFinite(input[key]) || input[key] < 0),
    )
  )
    throw new BadRequestException(
      'Confira as quantidades e os custos informados.',
    );
  const itemCost = roundedLineTotal(
    input.items.map((item) => ({
      kind: 'OTHER',
      quantity: item.quantity,
      unitPrice: item.unitCost ?? 0,
    })),
  );
  const extraCost =
    extras.reduce((sum, key) => sum + moneyCents(input[key] ?? 0), 0) / 100;
  const complete = missing.length === 0 && input.items.length > 0;
  const estimatedCost = money(itemCost + extraCost);
  if (
    ![input.revenue, itemCost, extraCost, estimatedCost].every((value) =>
      Number.isSafeInteger(moneyCents(value)),
    )
  )
    throw new BadRequestException(
      'Os valores excedem o limite de precisão monetária desta estimativa.',
    );
  const contribution = complete ? money(input.revenue - estimatedCost) : null;
  return {
    complete,
    missing,
    revenue: money(input.revenue),
    itemCost,
    extraCost,
    estimatedCost,
    contribution,
    marginPercent:
      complete && input.revenue > 0
        ? money((contribution! / input.revenue) * 100)
        : null,
    items: input.items,
    costs: Object.fromEntries(extras.map((key) => [key, input[key] ?? null])),
    note: 'Estimativa sobre custos informados. Não representa lucro contábil; custos e tributos não incluídos precisam de conferência.',
  };
}
export function compareCommercialVersions(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const labels: Record<string, string> = {
    totalValue: 'Total',
    discount: 'Desconto geral',
    scope: 'Escopo',
    paymentTerm: 'Condição de pagamento',
    paymentPlan: 'Parcelamento',
    paymentSelections: 'Emitentes e contas',
    deliveryLeadTimeDays: 'Prazo de entrega',
    freight: 'Frete',
    validUntil: 'Validade',
    operationalExpenses: 'Despesas',
    externalNotes: 'Observações ao cliente',
  };
  const fields = Object.entries(labels)
    .filter(
      ([key]) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]),
    )
    .map(([key, label]) => ({
      field: key,
      label,
      before: previous[key] ?? null,
      after: current[key] ?? null,
    }));
  const canonical = (items: unknown) =>
    (Array.isArray(items) ? items : [])
      .map((item: Record<string, unknown>) => ({
        catalogItemId: item.catalogItemId,
        kind: item.kind,
        description: item.description,
        quantity: item.quantity,
        hours: item.hours,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        totalPrice: item.totalPrice,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    fields,
    itemsChanged:
      JSON.stringify(canonical(previous.items)) !==
      JSON.stringify(canonical(current.items)),
    previousItems: canonical(previous.items),
    currentItems: canonical(current.items),
  };
}
