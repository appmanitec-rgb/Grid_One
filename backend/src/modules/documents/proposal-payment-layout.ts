import {
  moneyCents,
  roundedLineTotal,
} from '../proposals/proposal-review.domain';

type Data = Record<string, any>;
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );

/** Customer presentation only: does not allocate receipts or change saved profiles. */
export function proposalPaymentLayout(payload: Data) {
  const document: Data = payload.document || {};
  const items: Data[] = Array.isArray(payload.items) ? payload.items : [];
  const profiles: Data[] = Array.isArray(document.paymentSelections)
    ? document.paymentSelections
    : [];
  const category = (purpose: 'PARTS' | 'SERVICES') => {
    const rows = items.filter(
      (item) =>
        String(item.kind || '').includes('SERVICE') ===
        (purpose === 'SERVICES'),
    );
    const amount = moneyCents(
      roundedLineTotal(
        rows.map((item) => ({
          kind: String(item.kind || 'OTHER'),
          quantity: Number(item.quantity ?? 1),
          hours: item.hours == null ? undefined : Number(item.hours),
          unitPrice: Number(item.unitPrice || 0),
          discountPercent: Number(item.discountPercent || 0),
        })),
      ),
    );
    if (!rows.length)
      return {
        value:
          purpose === 'PARTS'
            ? 'Sem peças nesta proposta'
            : 'Sem serviços nesta proposta',
        company: '',
        cnpj: '',
        bank: '',
        agency: '',
        account: '',
        pix: '',
        method: '',
      };
    const profile = profiles.find((row) => row.purpose === purpose) || {};
    const cnpj = text(profile.beneficiaryDocument).replace(/\D/g, '');
    // The selected profile snapshot is the sole source of banking details.
    // Missing fields must never resurrect an old institutional account.
    const value = (key: string) => text(profile[key]) || 'A definir';
    const formattedCnpj =
      cnpj.length === 14
        ? cnpj.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            '$1.$2.$3/$4-$5',
          )
        : text(profile.beneficiaryDocument) || 'A definir';
    return {
      value: `VALOR DE ${purpose === 'PARTS' ? 'PEÇAS' : 'SERVIÇOS'}: ${money(amount)}`,
      company:
        text(profile.beneficiary || profile.issuerCompanyName) ||
        'Favorecido: a definir',
      cnpj: `CNPJ: ${formattedCnpj}`,
      bank: `Banco: ${value('bankName')}`,
      agency: `Agência: ${value('agency')}`,
      account: `Conta: ${value('accountNumber')}`,
      pix: `CHAVE PIX: ${value('pixKey')}`,
      method:
        profile.method === 'BOLETO'
          ? `Boleto: ${text(profile.boletoInstructions) || 'conforme cobrança emitida'}`
          : '',
    };
  };
  const total = moneyCents(Number(document.totalValue || 0));
  const entry = document.hasDownPayment
    ? moneyCents(Number(document.downPaymentAmount || 0))
    : 0;
  const balance = total - entry;
  const entryInstruction =
    entry > 0 && entry <= total
      ? entry === total
        ? `Pagamento antecipado de ${money(entry)}. A liberação do atendimento ou fornecimento depende da confirmação deste pagamento.`
        : `Entrada de ${money(entry)}: a liberação do atendimento ou fornecimento depende da confirmação da entrada. Saldo de ${money(balance)} conforme as parcelas e os vencimentos desta proposta.`
      : 'O pagamento segue a condição e os vencimentos indicados nesta proposta.';
  const expenses = moneyCents(Number(document.operationalExpensesTotal || 0));
  const discount = moneyCents(Number(document.discount || 0));
  return {
    services: category('SERVICES'),
    parts: category('PARTS'),
    entryInstruction,
    transferInstruction:
      'Pague cada categoria na conta do respectivo favorecido e informe o número da proposta no comprovante.',
    adjustmentNote:
      expenses || discount
        ? `Valores por categoria referentes aos itens. Despesas de ${money(expenses)} e desconto geral de ${money(discount)} seguem o resumo do investimento; a destinação desses ajustes será indicada na cobrança de cada emitente.`
        : '',
    reference:
      'Os favorecidos, dados bancários e instruções de pagamento estão no quadro Dados de pagamento, nas condições comerciais desta proposta.',
  };
}
