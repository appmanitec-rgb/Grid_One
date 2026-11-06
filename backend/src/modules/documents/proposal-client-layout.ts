import {
  moneyCents,
  roundedLineTotal,
} from '../proposals/proposal-review.domain';

type Data = Record<string, any>;
const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value,
  );
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** Presentation only: no changes to approvals, prices, payment schedules or frozen documents. */
export function proposalClientLayout(payload: Data) {
  const document = payload.document || {};
  const items: Data[] = Array.isArray(payload.items) ? payload.items : [];
  const parts = items.filter(
    (item) => !String(item.kind || '').includes('SERVICE'),
  );
  const services = items.filter((item) =>
    String(item.kind || '').includes('SERVICE'),
  );
  const lines = items.map((item) => ({
    kind: String(item.kind || 'OTHER'),
    quantity: Number(item.quantity ?? 1),
    hours: item.hours == null ? undefined : Number(item.hours),
    unitPrice: Number(item.unitPrice || 0),
    discountPercent: Number(item.discountPercent || 0),
  }));
  const expenses: Data[] = Array.isArray(document.operationalExpenses)
    ? document.operationalExpenses
    : [];
  const expenseValue = (row: Data) =>
    typeof row.total === 'number'
      ? moneyCents(row.total)
      : moneyCents(Number(row.quantity || 0) * Number(row.unitPrice || 0));
  const displacement = expenses
    .filter((row) => row.expenseType === 'DISPLACEMENT')
    .reduce((sum, row) => sum + expenseValue(row), 0);
  const expenseTotal = moneyCents(
    Number(document.operationalExpensesTotal || 0),
  );
  const discount = moneyCents(Number(document.discount || 0));
  const expected =
    moneyCents(roundedLineTotal(lines)) + expenseTotal - discount;
  const recorded = moneyCents(Number(document.totalValue || 0));
  const issues: string[] = [];
  if (expected !== recorded)
    issues.push(
      'Conferir a divergência entre os itens, as despesas, o desconto e o total cadastrado.',
    );
  if (
    expenses.length &&
    expenses.reduce((sum, row) => sum + expenseValue(row), 0) !== expenseTotal
  )
    issues.push('Conferir a composição das despesas operacionais.');
  const scopeLines = [
    ...new Set(
      text(document.scope)
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean),
    ),
  ];
  const fullObjective =
    text(services[0]?.description || services[0]?.catalogItem?.name) ||
    scopeLines[0] ||
    (parts.length
      ? 'Fornecimento dos materiais discriminados nesta proposta.'
      : 'Atendimento conforme os itens discriminados nesta proposta.');
  const objective =
    fullObjective.length <= 180
      ? fullObjective
      : scopeLines[0]?.length <= 180
        ? scopeLines[0]
        : 'Serviços descritos no detalhamento técnico desta proposta.';
  const extendedLayout =
    items.length > 6 ||
    items.reduce(
      (sum, item) =>
        sum + text(item.description || item.catalogItem?.name).length,
      0,
    ) > 650;
  const lead =
    document.deliveryLeadTimeDays == null
      ? ''
      : `${document.deliveryLeadTimeDays} dias`;
  const execution = lead
    ? `${lead}. Confirmar dias úteis ou corridos e o início da contagem.`
    : 'A confirmar com o planejamento.';
  issues.push(
    lead
      ? 'Confirmar se o prazo informado é em dias úteis ou corridos e a partir de qual evento é contado.'
      : 'Confirmar a previsão de execução.',
  );
  if (parts.length)
    issues.push(
      'Confirmar a disponibilidade ou o prazo de aquisição das peças.',
    );
  const payment =
    text(document.paymentSummary || document.paymentTerm) ||
    'Condição de pagamento a confirmar.';
  const count = Number(
    document.installmentCount || payment.match(/(\d+)\s+parcelas?/i)?.[1] || 1,
  );
  const datedInstallments =
    count > 1 &&
    document.firstDueDate &&
    Number(document.installmentIntervalDays) > 0;
  const paymentPending =
    count > 1 && !datedInstallments
      ? count === 2
        ? 'Vencimento da segunda parcela a confirmar.'
        : 'Confirmar os vencimentos das demais parcelas.'
      : '';
  if (paymentPending) issues.push(paymentPending);
  if (!text(document.paymentSummary || document.paymentTerm))
    issues.push('Confirmar as condições de pagamento.');
  if (!document.validUntil) issues.push('Confirmar a validade da proposta.');
  issues.push('Confirmar prazo e cobertura de garantia, se aplicáveis.');
  issues.push(
    'Revisar a redação incompleta de inadimplemento e a aplicação do cancelamento a propostas de peças e serviços.',
  );
  const freight = text(document.freight);
  const freightText =
    (
      {
        FOB: 'Por conta do cliente (FOB). Custo não especificado.',
        CIF: 'Por conta da Manitec (CIF). Confirmar a composição do custo.',
        SEM_FRETE: 'Sem frete de materiais previsto.',
        NONE: 'Sem frete de materiais previsto.',
      } as Record<string, string>
    )[freight] ||
    (freight
      ? `Frete dos materiais: ${freight}. Confirmar as condições e o custo.`
      : 'Frete dos materiais a confirmar.');
  const installations = scopeLines
    .filter((line) => !/exclu|não|nao|\bsem\b|fora do escopo/i.test(line))
    .some((line) =>
      /instala[cç][aã]o|interliga[cç][aã]o el[eé]trica|obra el[eé]trica/i.test(
        line,
      ),
    );
  const accounts: Data[] = Array.isArray(document.paymentSelections)
    ? document.paymentSelections
    : [];
  const issuers = new Set(
    accounts
      .map((row) =>
        text(
          row.beneficiaryDocument || row.issuerCompanyName || row.beneficiary,
        ),
      )
      .filter(Boolean),
  );
  return {
    reviewLabel:
      document.isDemonstration === true
        ? 'DADOS DEMONSTRATIVOS | PRÉVIA PARA REVISÃO'
        : 'PRÉVIA PARA REVISÃO | CONDIÇÕES A CONFIRMAR',
    objective,
    extendedLayout,
    footerLabel:
      document.isDemonstration === true
        ? 'Exemplo | Prévia para revisão'
        : 'Prévia para revisão',
    displacementTotal: currency(displacement / 100),
    otherExpensesTotal: currency((expenseTotal - displacement) / 100),
    execution,
    scheduling:
      'Agendamento sujeito à aprovação, à disponibilidade das peças e ao acesso ao equipamento.',
    availability: parts.length
      ? 'Disponibilidade das peças a confirmar antes do agendamento.'
      : 'Não há fornecimento de peças previsto.',
    payment,
    paymentPending,
    freight: freightText,
    exclusions:
      'Não incluídos: itens e atividades não discriminados nesta proposta. Serviços adicionais dependem de novo orçamento.',
    activities:
      scopeLines.join('\n') ||
      'Atividades conforme a descrição dos serviços na parte comercial. Detalhamento a confirmar.',
    activityParagraphs: (scopeLines.length
      ? scopeLines
      : [
          'Atividades conforme a descrição dos serviços na parte comercial. Detalhamento a confirmar.',
        ]
    ).map((description) => ({ description })),
    deliverables:
      'Entregas técnicas conforme o escopo. Confirmar quais registros serão disponibilizados ao cliente.',
    installationNote: installations
      ? 'Para os serviços de instalação ou interligação expressamente contratados, confirmar previamente as condições de acesso e de execução com o cliente. Intervenções adicionais dependem de orçamento e autorização.'
      : '',
    partsTiming:
      'Quando houver necessidade de substituição de peças, a Manitec apresentará ao cliente o diagnóstico, o orçamento e a previsão de atendimento. O prazo de substituição será informado após a confirmação da disponibilidade das peças e dependerá da aprovação do orçamento e do agendamento de acesso ao equipamento. Para peças sob encomenda, será considerado o prazo de fornecimento informado pelo fabricante ou distribuidor. Eventuais alterações na previsão serão comunicadas ao cliente.',
    paymentAllocation:
      parts.length && services.length && issuers.size > 1
        ? 'Peças e serviços são faturados pelos emitentes indicados. A Manitec deve confirmar como distribuir as parcelas entre os CNPJs; não se presume divisão igual ou proporcional.'
        : 'O faturamento deve seguir os emitentes e os meios de recebimento informados nesta proposta. Dados ausentes devem ser confirmados antes do envio ao cliente.',
    arithmeticNote:
      expected !== recorded
        ? 'ATENÇÃO: há divergência nos valores cadastrados. Conferir antes da emissão.'
        : '',
    defaultTerms:
      'Em caso de atraso, o modelo prevê multa de 2%, juros de mora de 1% ao mês e correção monetária. O trecho sobre 30 dias e cobrança complementar está incompleto; confirmar antes da emissão.',
    cancellationTerms:
      'Desistência após cinco dias corridos da contratação: o modelo prevê multa de 10% sobre o valor do serviço. Confirmar a aplicação a propostas com peças e serviços.',
    warranty:
      'Prazo e cobertura de garantia a confirmar pela Manitec. Esta prévia não estabelece um prazo de garantia.',
    reviewIssues: issues,
    arithmeticConsistent: expected === recorded,
    materialCount: parts.length,
    serviceCount: services.length,
  };
}
