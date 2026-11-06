/** Pure domain shared by the API and proposal editor. No server dependencies. */
export type ReviewOperation =
  | 'draft'
  | 'submit'
  | 'approve'
  | 'document'
  | 'send'
  | 'accept';
export type ReviewGroup =
  | 'commercial'
  | 'items'
  | 'scope'
  | 'expenses'
  | 'payment'
  | 'discount'
  | 'document';
export type ReviewIssue = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  group: ReviewGroup;
  step: number;
  field: string;
  action: string;
  origin: 'domain' | 'catalog' | 'policy' | 'scope';
  referenceId?: string;
  blocks: ReviewOperation[];
  signature: string;
  requiresReason?: boolean;
};
export type ReviewLine = {
  key?: string;
  kind: string;
  catalogItemId?: string | null;
  description?: string | null;
  quantity: number;
  hours?: number | null;
  unitPrice: number;
  discountPercent?: number | null;
  totalPrice?: number;
  referenceUnitPrice?: number;
};
export type ReviewExpense = {
  expenseType: string;
  label?: string;
  unitLabel?: string;
  quantity: number;
  unitPrice: number;
};
export type ReviewAcknowledgement = {
  code: string;
  signature: string;
  reason: string;
};
export type ExpenseReviewRule = {
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
};
export type ReviewInput = {
  clientId?: string;
  sellerId?: string;
  type?: string;
  items: ReviewLine[];
  expenses?: ReviewExpense[];
  discount?: number;
  allowExpenseDiscount?: boolean;
  totalValue?: number;
  paymentTerm?: string | null;
  paymentPlan?: {
    preset: string;
    entryType: string;
    entryValue: number;
    balanceInstallments: number;
  } | null;
  hasDownPayment?: boolean;
  downPaymentAmount?: number | null;
  installmentCount?: number | null;
  paymentProfiles?: Array<{ purpose: string; issuerCompanyId?: string | null }>;
  requiredPaymentPurposes?: string[];
  discountLimit?: number;
  unrestricted?: boolean;
  scopeText?: string;
  scopeSnapshot?: {
    stale?: boolean;
    manuallyEdited?: boolean;
    alerts?: Array<{
      code: string;
      severity: string;
      message: string;
      sourceKeys?: string[];
    }>;
  } | null;
  acknowledgements?: ReviewAcknowledgement[];
  expenseRules?: ExpenseReviewRule[];
};
type Decimal = { n: bigint; scale: number };
function decimal(value: number): Decimal {
  if (!Number.isFinite(value)) return { n: BigInt(0), scale: 0 };
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e');
  const fraction = (mantissa.split('.')[1] || '').length;
  const scale = fraction - Number(exponent);
  const n = BigInt(mantissa.replace('.', ''));
  return scale < 0
    ? { n: n * BigInt(10) ** BigInt(-scale), scale: 0 }
    : { n, scale };
}
function plus(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return {
    n:
      a.n * BigInt(10) ** BigInt(scale - a.scale) +
      b.n * BigInt(10) ** BigInt(scale - b.scale),
    scale,
  };
}
function times(a: Decimal, b: Decimal): Decimal {
  return { n: a.n * b.n, scale: a.scale + b.scale };
}
function cents(value: Decimal): number {
  if (value.scale <= 2)
    return Number(value.n * BigInt(10) ** BigInt(2 - value.scale));
  const base = BigInt(10) ** BigInt(value.scale - 2),
    sign = value.n < BigInt(0) ? -BigInt(1) : BigInt(1);
  const absolute = value.n * sign;
  return Number(((absolute + base / BigInt(2)) / base) * sign);
}
export function moneyCents(value: number) {
  return cents(decimal(value));
}
export function lineDecimal(item: ReviewLine): Decimal {
  const factor = plus(decimal(100), {
    ...decimal(item.discountPercent || 0),
    n: -decimal(item.discountPercent || 0).n,
  });
  const value = times(
    times(
      decimal(
        item.kind === 'HOURLY_SERVICE'
          ? Number(item.hours ?? item.quantity)
          : item.quantity,
      ),
      decimal(item.unitPrice),
    ),
    factor,
  );
  return { n: value.n, scale: value.scale + 2 };
}
export function exactLineValue(item: ReviewLine): number {
  const value = lineDecimal(item);
  return Number(value.n) / 10 ** value.scale;
}
export function roundedLineTotal(items: ReviewLine[]): number {
  return (
    cents(
      items.reduce((sum, item) => plus(sum, lineDecimal(item)), {
        n: BigInt(0),
        scale: 0,
      }),
    ) / 100
  );
}
export function exactExpenseValue(quantity: number, unitPrice: number): number {
  return cents(times(decimal(quantity), decimal(unitPrice))) / 100;
}
export function financialComposition(
  items: ReviewLine[],
  expenses: ReviewExpense[],
  discount: number,
  allowExpenseDiscount: boolean,
) {
  // Preserve the established order: aggregate raw commercial lines, round subtotal; expenses round per type.
  const parts = moneyCents(
    roundedLineTotal(items.filter((item) => item.kind === 'PART_MATERIAL')),
  );
  const itemsTotal = moneyCents(roundedLineTotal(items));
  const services = itemsTotal - parts;
  const expense = expenses.reduce(
    (sum, item) =>
      sum + moneyCents(exactExpenseValue(item.quantity, item.unitPrice)),
    0,
  );
  const eligible = itemsTotal + (allowExpenseDiscount ? expense : 0);
  const discountCents = moneyCents(discount);
  const categories = [
    {
      key: 'EXPENSES',
      label: 'Despesas operacionais',
      subtotalCents: expense,
      discountEligible: allowExpenseDiscount,
    },
    {
      key: 'PARTS',
      label: 'Peças e materiais',
      subtotalCents: parts,
      discountEligible: true,
    },
    {
      key: 'SERVICES',
      label: 'Serviços',
      subtotalCents: services,
      discountEligible: true,
    },
  ];
  let remaining = Math.max(0, Math.min(eligible, discountCents));
  const last = categories.findLastIndex(
    (item) => item.discountEligible && item.subtotalCents > 0,
  );
  const breakdown = categories.map((item, index) => {
    const safe = [remaining, item.subtotalCents, eligible, discountCents].every(
      Number.isSafeInteger,
    );
    const proportional =
      safe && eligible > 0
        ? Number(
            (BigInt(Math.max(0, discountCents)) * BigInt(item.subtotalCents) +
              BigInt(Math.floor(eligible / 2))) /
              BigInt(eligible),
          )
        : 0;
    const allocated =
      safe && item.discountEligible && item.subtotalCents > 0 && eligible > 0
        ? Math.min(
            remaining,
            item.subtotalCents,
            index === last ? remaining : proportional,
          )
        : 0;
    remaining -= allocated;
    return {
      key: item.key,
      label: item.label,
      subtotal: item.subtotalCents / 100,
      discountEligible: item.discountEligible,
      discount: allocated / 100,
      total: (item.subtotalCents - allocated) / 100,
    };
  });
  return {
    parts: parts / 100,
    services: services / 100,
    expenses: expense / 100,
    itemsSubtotal: itemsTotal / 100,
    subtotal: (itemsTotal + expense) / 100,
    eligible: eligible / 100,
    discount: discountCents / 100,
    total: (itemsTotal + expense - discountCents) / 100,
    breakdown,
  };
}
export function issueSignature(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
/** Commercial wording only; never assigns aggregate receipts to an issuer. */
export function paymentSummary(
  total: number,
  entry: number,
  installments: number,
  firstDueDate?: string | null,
  intervalDays?: number | null,
): string {
  const format = (value: number) =>
    (value / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  const totalCents = moneyCents(total),
    entryCents = moneyCents(entry),
    balance = totalCents - entryCents;
  if (
    totalCents < 0 ||
    entryCents < 0 ||
    entryCents > totalCents ||
    !Number.isInteger(installments) ||
    installments < 0 ||
    installments > 36
  )
    return 'Confira a entrada e o parcelamento.';
  const text: string[] = [];
  if (entryCents > 0)
    text.push(
      (entryCents === totalCents ? 'Pagamento antecipado de ' : 'Entrada de ') +
        format(entryCents),
    );
  if (balance > 0) {
    const count = Math.max(1, installments),
      base = Math.floor(balance / count),
      last = balance - base * (count - 1);
    text.push(
      count === 1
        ? 'Pagamento de ' + format(balance)
        : last === base
          ? count + ' parcelas de ' + format(base)
          : count -
            1 +
            ' parcela(s) de ' +
            format(base) +
            ' e última de ' +
            format(last),
    );
    if (firstDueDate && /^\d{4}-\d{2}-\d{2}/.test(firstDueDate)) {
      const [year, month, day] = firstDueDate.slice(0, 10).split('-');
      text.push('Primeiro vencimento em ' + day + '/' + month + '/' + year);
    }
    if (count > 1 && intervalDays && intervalDays > 0)
      text.push('Intervalo de ' + intervalDays + ' dias');
  }
  return text.length ? text.join('. ') + '.' : 'Sem saldo a receber.';
}
const sensitive: ReviewOperation[] = [
  'submit',
  'approve',
  'document',
  'send',
  'accept',
];
export function reviewProposal(input: ReviewInput) {
  const issues: ReviewIssue[] = [];
  function add(
    code: string,
    severity: ReviewIssue['severity'],
    title: string,
    description: string,
    group: ReviewGroup,
    step: number,
    field: string,
    action: string,
    facts: unknown,
    options: Partial<ReviewIssue> = {},
  ) {
    issues.push({
      code,
      severity,
      title,
      description,
      group,
      step,
      field,
      action,
      origin: 'domain',
      blocks: severity === 'error' ? sensitive : [],
      signature: issueSignature([code, facts]),
      ...options,
    });
  }
  if (!input.clientId)
    add(
      'CLIENT_REQUIRED',
      'error',
      'Selecione o cliente',
      'O rascunho pode ser salvo; a proposta precisa de um cliente para seguir.',
      'commercial',
      0,
      'client',
      'Selecionar cliente',
      null,
    );
  if (!input.sellerId)
    add(
      'SELLER_REQUIRED',
      'error',
      'Selecione o responsável',
      'Identifique quem acompanha esta proposta.',
      'commercial',
      0,
      'seller',
      'Selecionar vendedor',
      null,
    );
  const identified = input.items.filter(
    (item) =>
      item.catalogItemId ||
      item.description?.trim() ||
      item.kind === 'HOURLY_SERVICE',
  );
  if (!identified.length)
    add(
      'ITEM_REQUIRED',
      'error',
      'Adicione uma peça ou serviço',
      'Linhas vazias não serão cobradas nem incluídas na proposta.',
      'items',
      1,
      'items',
      'Adicionar item',
      null,
    );
  if (identified.length !== input.items.length)
    add(
      'EMPTY_ROWS',
      'info',
      'Linhas vazias serão ignoradas',
      'Selecione um item ou remova a linha antes de concluir.',
      'items',
      1,
      'items',
      'Conferir itens',
      input.items.length,
    );
  const seen = new Map<string, number>();
  identified.forEach((item, index) => {
    const hourly = item.kind === 'HOURLY_SERVICE',
      quantity = hourly ? Number(item.hours ?? item.quantity) : item.quantity;
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (!hourly && !Number.isInteger(quantity))
    )
      add(
        'QUANTITY_INVALID',
        'error',
        'Confira a quantidade',
        'Use quantidade inteira positiva para itens e horas positivas para mão de obra por hora.',
        'items',
        hourly || item.kind === 'CATALOG_SERVICE' ? 2 : 1,
        'items',
        'Corrigir quantidade',
        [index, quantity],
        { referenceId: item.key || String(index) },
      );
    if (
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0 ||
      !Number.isFinite(item.discountPercent ?? 0) ||
      (item.discountPercent ?? 0) < 0 ||
      (item.discountPercent ?? 0) > 100
    )
      add(
        'LINE_PRICE_INVALID',
        'error',
        'Confira preço e desconto do item',
        'Valores negativos ou percentuais fora de 0 a 100% precisam ser corrigidos.',
        'items',
        1,
        'items',
        'Conferir valores',
        [index, item.unitPrice, item.discountPercent],
      );
    if (item.catalogItemId) {
      const key = item.kind + ':' + item.catalogItemId;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  });
  for (const [key, count] of seen)
    if (count > 1)
      add(
        'DUPLICATE_ITEM',
        'warning',
        'Item repetido na proposta',
        'Confira se as linhas representam fornecimentos distintos. Se forem intencionais, registre o motivo.',
        'items',
        1,
        'items',
        'Conferir duplicidade',
        [
          key,
          identified
            .filter((item) => item.kind + ':' + item.catalogItemId === key)
            .map((item) => [item.quantity, item.unitPrice]),
        ],
        { referenceId: key, requiresReason: true },
      );
  const expenses = input.expenses || [];
  for (const item of expenses) {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity < 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    )
      add(
        'EXPENSE_INVALID',
        'error',
        'Confira a despesa',
        'Quantidade e tarifa precisam ser valores não negativos.',
        'expenses',
        2,
        'expenses',
        'Corrigir despesa',
        item.expenseType,
      );
    const rule = input.expenseRules?.find(
      (rule) => rule.code === item.expenseType,
    );
    if (rule && item.quantity >= rule.sortOrder)
      add(
        'EXPENSE_ATYPICAL',
        'warning',
        rule.name || 'Quantidade de despesa a conferir',
        (rule.description ||
          'A quantidade atingiu o limite de conferência configurado.') +
          ' A conferência é limitada: equipe, duração e deslocamento não foram inferidos.',
        'expenses',
        2,
        'expenses',
        'Conferir quantidade',
        [item.expenseType, item.quantity, rule.sortOrder],
        { origin: 'policy', referenceId: item.expenseType },
      );
  }
  const totals = financialComposition(
    identified,
    expenses,
    input.discount || 0,
    Boolean(input.allowExpenseDiscount),
  );
  if (
    ![totals.total, totals.eligible, totals.subtotal].every(
      (value) =>
        Number.isFinite(value) && Number.isSafeInteger(moneyCents(value)),
    )
  )
    add(
      'MONEY_PRECISION',
      'error',
      'Valor fora da precisão monetária suportada',
      'Reduza o valor ou a quantidade antes de liberar a proposta.',
      'items',
      1,
      'items',
      'Conferir valores',
      null,
    );
  if (
    !Number.isFinite(input.discount ?? 0) ||
    (input.discount ?? 0) < 0 ||
    moneyCents(input.discount ?? 0) > moneyCents(totals.eligible)
  )
    add(
      'DISCOUNT_INVALID',
      'error',
      'Desconto acima da base permitida',
      'O desconto deve respeitar as categorias elegíveis; despesas protegidas não participam da base.',
      'discount',
      3,
      'discount',
      'Corrigir desconto',
      [input.discount, totals.eligible],
    );
  if (
    input.totalValue !== undefined &&
    moneyCents(input.totalValue) !== moneyCents(totals.total)
  )
    add(
      'TOTAL_MISMATCH',
      'error',
      'Total diferente da composição',
      'O total registrado não fecha com itens, despesas e desconto. Corrija o rascunho antes de liberar.',
      'discount',
      3,
      'discount',
      'Conferir composição',
      [input.totalValue, totals.total],
    );
  const grossItems = roundedLineTotal(
    identified.map((item) => ({
      ...item,
      unitPrice: Math.max(item.unitPrice, item.referenceUnitPrice || 0),
      discountPercent: 0,
    })),
  );
  const grossReference =
    grossItems + (input.allowExpenseDiscount ? totals.expenses : 0);
  const reduction = moneyCents(
    Math.max(0, grossItems - totals.itemsSubtotal) + (input.discount || 0),
  );
  if (
    !input.unrestricted &&
    input.discountLimit !== undefined &&
    reduction > moneyCents((grossReference * input.discountLimit) / 100)
  )
    add(
      'DISCOUNT_AUTHORITY',
      'error',
      'Desconto exige alçada superior',
      'Sua alçada configurada é ' +
        input.discountLimit +
        '%. O rascunho será preservado; a liberação exige o fluxo autorizado.',
      'discount',
      3,
      'discount',
      'Revisar desconto/alçada',
      [reduction, grossReference, input.discountLimit],
      { blocks: ['approve', 'document', 'send', 'accept'], origin: 'policy' },
    );
  const plan = input.paymentPlan;
  const entry = plan
    ? plan.entryType === 'PERCENTAGE'
      ? (totals.total * plan.entryValue) / 100
      : plan.entryValue
    : input.hasDownPayment
      ? Number(input.downPaymentAmount || 0)
      : 0;
  const count = plan ? plan.balanceInstallments : input.installmentCount || 1;
  if (
    !Number.isFinite(entry) ||
    entry < 0 ||
    moneyCents(entry) > moneyCents(totals.total) ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 36 ||
    (moneyCents(totals.total - entry) > 0 && count < 1)
  )
    add(
      'PAYMENT_INVALID',
      'error',
      'Confira entrada e parcelas',
      'A entrada não pode superar o total, e o saldo deve ter de 1 a 36 parcelas.',
      'payment',
      0,
      'payment',
      'Corrigir pagamento',
      [entry, count, totals.total],
    );
  const normalizedTerm = (input.paymentTerm || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f _]/g, '')
    .toUpperCase();
  if (
    ['AVISTA', 'CASH'].includes(normalizedTerm) &&
    ((entry > 0 && entry < totals.total) || count > 1)
  )
    add(
      'PAYMENT_LEGACY_AMBIGUOUS',
      plan?.preset === 'CASH' ? 'error' : 'warning',
      'Descrição de pagamento ambígua',
      'A descrição informa à vista, mas o plano tem entrada ou parcelamento. Confira o texto e a composição real.',
      'payment',
      0,
      'payment',
      'Revisar condição',
      [normalizedTerm, entry, count],
    );
  if (
    plan &&
    ['CASH', 'CONFIGURED'].includes(plan.preset) &&
    (plan.entryValue !== 0 || plan.balanceInstallments !== 1)
  )
    add(
      'PAYMENT_PRESET_MISMATCH',
      'error',
      'Plano incompatível com a condição',
      'Esta condição estruturada prevê uma parcela sem entrada antecipada.',
      'payment',
      0,
      'payment',
      'Corrigir plano',
      plan,
    );
  for (const purpose of input.requiredPaymentPurposes || [])
    if (!input.paymentProfiles?.some((profile) => profile.purpose === purpose))
      add(
        'PAYMENT_PROFILE_REQUIRED',
        'error',
        'Selecione a conta de ' + (purpose === 'PARTS' ? 'peças' : 'serviços'),
        'Confirme a conta e a empresa emitente para esta categoria.',
        'payment',
        0,
        'payment',
        'Selecionar conta',
        purpose,
      );
  if (
    new Set(
      input.paymentProfiles
        ?.map((profile) => profile.issuerCompanyId)
        .filter(Boolean),
    ).size > 1
  )
    add(
      'MULTIPLE_ISSUERS',
      'warning',
      'Recebimentos de empresas diferentes',
      'As contas pertencem a emitentes diferentes. O plano agregado não autoriza atribuir um único recebimento aos dois CNPJs; confira a destinação com o Financeiro.',
      'payment',
      0,
      'payment',
      'Conferir emitentes',
      input.paymentProfiles?.map((profile) => [
        profile.purpose,
        profile.issuerCompanyId,
      ]),
    );
  if (input.scopeSnapshot?.stale)
    add(
      'SCOPE_STALE',
      'error',
      'Escopo precisa de nova conferência',
      'Itens ou equipamento mudaram após a geração. Preserve os ajustes manuais e confira uma nova prévia.',
      'scope',
      3,
      'scope',
      'Revisar escopo',
      input.scopeSnapshot,
    );
  if (input.scopeSnapshot?.manuallyEdited)
    add(
      'SCOPE_MANUAL_REVIEW',
      'warning',
      'Escopo com ajustes manuais',
      'Confirme que o texto mantém os serviços contratados e as condições operacionais. A diretoria poderá conferir a alteração.',
      'scope',
      3,
      'scope',
      'Conferir texto',
      input.scopeText || '',
      { requiresReason: true },
    );
  for (const alert of input.scopeSnapshot?.alerts || [])
    if (['error', 'warning', 'info'].includes(alert.severity))
      add(
        'SCOPE_' + alert.code,
        alert.severity as ReviewIssue['severity'],
        alert.severity === 'error'
          ? 'Pendência técnica no escopo'
          : 'Aviso técnico no escopo',
        alert.message,
        'scope',
        alert.code.includes('SERVICE') || alert.code === 'UNMAPPED_SERVICE'
          ? 2
          : 3,
        alert.code.includes('SERVICE') || alert.code === 'UNMAPPED_SERVICE'
          ? 'serviceTechnical'
          : 'scope',
        'Corrigir escopo',
        alert,
        { origin: 'scope' },
      );
  const acknowledgements = input.acknowledgements || [];
  const resolved = issues.filter(
    (issue) =>
      issue.requiresReason &&
      acknowledgements.some(
        (ack) =>
          ack.code === issue.code &&
          ack.signature === issue.signature &&
          ack.reason.trim().length >= 8,
      ),
  );
  const pending = issues.filter((issue) => !resolved.includes(issue));
  return {
    issues,
    pending,
    resolved,
    totals,
    errors: pending.filter((issue) => issue.severity === 'error').length,
    warnings: pending.filter((issue) => issue.severity === 'warning').length,
    blocks: (operation: ReviewOperation) =>
      pending.filter(
        (issue) =>
          issue.blocks.includes(operation) ||
          (operation !== 'draft' && issue.requiresReason),
      ),
  };
}
