import { proposalClientLayout } from './proposal-client-layout';

type Data = Record<string, any>;
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** V4 restores the applicable reference content without changing the V3 document. */
export function proposalBrandedLayout(
  payload: Data,
  previous = proposalClientLayout(payload),
) {
  const document = payload.document || {};
  const hasService = previous.serviceCount > 0;
  const contractor = hasService
    ? [
        'Fornecer o ferramental necessário à execução dos serviços contratados.',
        'Executar as atividades descritas no escopo desta proposta.',
        'Elaborar relatório de execução dos serviços prestados.',
        'Orientar o operador do cliente quanto aos procedimentos relacionados ao atendimento.',
      ]
    : [
        'Fornecer as peças e os materiais nas quantidades e especificações discriminadas nesta proposta.',
      ];
  if (hasService && previous.installationNote)
    contractor.push(
      'Realizar o acompanhamento técnico das atividades de instalação ou interligação expressamente incluídas no escopo contratado.',
    );
  const client = hasService
    ? [
        'Garantir acesso seguro aos técnicos e aos equipamentos sujeitos à manutenção.',
        'Indicar um responsável autorizado para acompanhar os serviços.',
        'Assinar o termo de execução e conclusão apresentado ao término da manutenção.',
        'Manter o local limpo e com acesso adequado ao equipamento.',
        'Controlar o acesso ao local, aos equipamentos e às ferramentas, restringindo a presença de pessoas não autorizadas pela Manitec durante o atendimento.',
      ]
    : [
        'Indicar um responsável autorizado para acompanhar o recebimento das peças e dos materiais.',
      ];
  const warranty =
    document.warrantyConfirmed === true ? text(document.warrantyTerms) : '';
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
  const freight = text(document.freight);
  const freightText =
    (
      {
        FOB: 'Por conta do cliente (FOB). Custo a definir.',
        CIF: 'Por conta da Manitec (CIF). Custo a definir.',
        SEM_FRETE: 'Sem frete de materiais previsto.',
        NONE: 'Sem frete de materiais previsto.',
      } as Record<string, string>
    )[freight] ||
    (freight ? `${freight}. Condições e custo a definir.` : 'A definir.');
  const chain = (values: string[]) =>
    values.slice(0, -1).map((description) => ({ description }));
  const last = (values: string[]) =>
    values.slice(-1).map((description) => ({ description }));
  return {
    reviewLabel: 'Prévia para revisão',
    demonstrationNote:
      document.isDemonstration === true ? 'Dados demonstrativos' : '',
    execution:
      document.deliveryLeadTimeDays == null
        ? 'A definir.'
        : `${document.deliveryLeadTimeDays} dias (contagem a definir).`,
    payment:
      text(document.paymentSummary || document.paymentTerm) || 'A definir.',
    paymentPending: previous.paymentPending
      ? previous.paymentPending.includes('segunda')
        ? '2ª parcela: vencimento a definir.'
        : 'Demais vencimentos: a definir.'
      : '',
    availability: previous.materialCount
      ? 'Disponibilidade das peças: a definir.'
      : 'Sem fornecimento de peças nesta proposta.',
    freight: freightText,
    receivingDetails:
      text(document.paymentDetails) ||
      'Dados de faturamento e recebimento: a definir.',
    billingNote:
      previous.materialCount && hasService && issuers.size > 1
        ? 'Peças e serviços serão faturados pelos emitentes indicados. Distribuição dos pagamentos entre os emitentes: a definir.'
        : '',
    contractorText: contractor.join('\n'),
    contractorChain: chain(contractor),
    contractorLast: last(contractor),
    clientText: client.join('\n'),
    clientChain: chain(client),
    clientLast: last(client),
    deliverables: hasService
      ? 'Relatório de execução dos serviços e orientações relacionadas ao atendimento.'
      : 'Peças e materiais discriminados nesta proposta.',
    installationNote: previous.installationNote
      ? 'As condições de acesso e execução das atividades de instalação ou interligação incluídas no escopo serão alinhadas com o responsável do cliente.'
      : '',
    customerNotes: text(document.externalNotes),
    partsTiming: previous.partsTiming,
    warranty,
    warrantyConfirmed: Boolean(warranty),
    defaultHeading: warranty
      ? '7.6 Atraso no pagamento'
      : '7.5 Atraso no pagamento',
    cancellationHeading: warranty ? '7.7 Cancelamento' : '7.6 Cancelamento',
    acceptanceHeading: warranty ? '7.8 Aceite' : '7.7 Aceite',
    defaultTerms:
      'Em caso de atraso no pagamento, incidem sobre o valor em atraso multa de 2%, juros de mora de 1% ao mês e correção monetária. Índice de correção: a definir.',
    cancellationTerms: hasService
      ? 'Em caso de desistência após cinco dias corridos da contratação, será devida multa de 10% sobre o valor do serviço.'
      : 'Condições de cancelamento: a definir.',
    arithmeticWarning: previous.arithmeticConsistent
      ? ''
      : 'Valores em revisão.',
  };
}
