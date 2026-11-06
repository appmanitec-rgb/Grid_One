import { proposalPaymentLayout } from './proposal-payment-layout';
import { DocumentTemplateService } from './document-template.service';
import { InstitutionalDocumentService } from './institutional-document.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';

function example() {
  return {
    company: { companyName: 'Manitec' },
    client: { companyName: 'Cliente demonstrativo' },
    document: {
      code: 'PAGAMENTO-TESTE',
      totalValue: 1500,
      hasDownPayment: true,
      downPaymentAmount: 450,
      installmentCount: 1,
      paymentTerm: '30/70',
      internalNotes: 'SEGREDO_DO_VENDEDOR',
      paymentSelections: [
        {
          purpose: 'SERVICES',
          beneficiary: 'MANITEC SERVICES GERADORES LTDA',
          beneficiaryDocument: '24.878.520/0001-60',
          method: 'PIX',
          bankName: 'Santander',
          agency: '3729',
          accountNumber: '13003264-4',
          pixKey: '24878520000160',
        },
        {
          purpose: 'PARTS',
          beneficiary: 'MANITEC ENERGIA EQUIPAMENTOS LTDA',
          beneficiaryDocument: '39315244000107',
          method: 'PIX',
          bankName: 'Santander',
          agency: '0157',
          accountNumber: '1300575-2',
          pixKey: '39315244000107',
        },
      ],
    },
    items: [
      {
        kind: 'PART_MATERIAL',
        quantity: 3,
        unitPrice: 300,
        totalPrice: 900,
        catalogItem: { sku: 'PEC-01', name: 'Peça' },
      },
      {
        kind: 'CATALOG_SERVICE',
        quantity: 2,
        unitPrice: 300,
        totalPrice: 600,
        catalogItem: { sku: 'SRV-01', name: 'Serviço' },
      },
    ],
  };
}

describe('Proposal payment cards and instructions', () => {
  it('keeps leading zeros and the correct beneficiary for each category without mutating snapshots', () => {
    const payload = example(),
      before = JSON.stringify(payload),
      result = proposalPaymentLayout(payload);
    expect(result.services.value).toContain('600,00');
    expect(result.services.account).toBe('Conta: 13003264-4');
    expect(result.services.agency).toBe('Agência: 3729');
    expect(result.services.pix).toBe('CHAVE PIX: 24878520000160');
    expect(result.parts.value).toContain('900,00');
    expect(result.parts.account).toBe('Conta: 1300575-2');
    expect(result.parts.agency).toBe('Agência: 0157');
    expect(result.parts.cnpj).toBe('CNPJ: 39.315.244/0001-07');
    expect(JSON.stringify(payload)).toBe(before);
  });

  it.each(['24878520000160', '39315244000107', '11222333000181'])(
    'does not restore banking details removed from a selected profile, even for beneficiary %s',
    (beneficiaryDocument) => {
      const payload = example();
      Object.assign(payload.document.paymentSelections[0], {
        beneficiaryDocument,
        bankName: '',
        agency: '',
        accountNumber: '',
        pixKey: '',
      });
      const result = proposalPaymentLayout(payload);
      expect(result.services.bank).toBe('Banco: A definir');
      expect(result.services.agency).toBe('Agência: A definir');
      expect(result.services.account).toBe('Conta: A definir');
      expect(result.services.pix).toBe('CHAVE PIX: A definir');
    },
  );

  it('renders the selected replacement account without mixing banking details or changing the previous snapshot', () => {
    const payload = example();
    const before = JSON.stringify(payload);
    const changed = {
      ...payload,
      document: {
        ...payload.document,
        paymentSelections: payload.document.paymentSelections.map((profile) =>
          profile.purpose === 'SERVICES'
            ? {
                ...profile,
                beneficiary: 'Outra empresa de serviços',
                beneficiaryDocument: '11222333000181',
                bankName: 'Outro banco',
                agency: '0099',
                accountNumber: '123-4',
                pixKey: 'pagamentos@example.test',
              }
            : profile,
        ),
      },
    };
    const selected = proposalPaymentLayout(changed);
    expect(selected.services.company).toBe('Outra empresa de serviços');
    expect(selected.services.cnpj).toBe('CNPJ: 11.222.333/0001-81');
    expect(selected.services.bank).toBe('Banco: Outro banco');
    expect(selected.services.agency).toBe('Agência: 0099');
    expect(selected.services.account).toBe('Conta: 123-4');
    expect(selected.services.pix).toBe('CHAVE PIX: pagamentos@example.test');
    expect(selected.parts).toEqual(proposalPaymentLayout(payload).parts);
    expect(JSON.stringify(payload)).toBe(before);

    const template = new DocumentTemplateService().loadInstitutional(
      'proposal',
    );
    const renderer = new DocxTemplateRendererService();
    const rendered = renderer.render({
      template,
      context: new InstitutionalDocumentService().buildContext(
        'proposal',
        changed,
        template.key,
      ),
      fileName: 'outra-conta.docx',
    }).buffer;
    const visible = renderer
      .wordBlocks(rendered)
      .map((row) => row.text)
      .join('\n');
    expect(visible).toContain('Outra empresa de serviços');
    expect(visible).toContain('Conta: 123-4');
    expect(visible).toContain('Agência: 0099');
    expect(visible).toContain('CHAVE PIX: pagamentos@example.test');
    expect(visible).not.toContain('13003264-4');
    expect(visible).toContain('1300575-2');
  });

  it('omits bank information for a category not included in the sale', () => {
    const payload = example();
    payload.items = payload.items.filter(
      (item) => item.kind === 'PART_MATERIAL',
    );
    const result = proposalPaymentLayout(payload);
    expect(result.services.value).toBe('Sem serviços nesta proposta');
    expect(result.services.company).toBe('');
    expect(result.services.pix).toBe('');
    expect(result.parts.account).toContain('1300575-2');
  });

  it('explains entry and balance without inventing dates or assigning an aggregate installment to either issuer', () => {
    const result = proposalPaymentLayout(example());
    expect(result.entryInstruction).toMatch(/Entrada de R\$\s450,00/);
    expect(result.entryInstruction).toMatch(/saldo de R\$\s1.050,00/i);
    expect(result.entryInstruction).toContain('confirmação da entrada');
    expect(result.entryInstruction).not.toMatch(
      /\d{2}\/\d{2}\/\d{4}|após a conclusão|30 dias/,
    );
    expect(JSON.stringify(result)).not.toContain('SEGREDO');
    expect(result.adjustmentNote).toBe('');
  });

  it('distinguishes prepaid and no-entry conditions', () => {
    const payload = example();
    payload.document.downPaymentAmount = 1500;
    expect(proposalPaymentLayout(payload).entryInstruction).toMatch(
      /Pagamento antecipado de R\$\s1.500,00/,
    );
    payload.document.hasDownPayment = false;
    expect(proposalPaymentLayout(payload).entryInstruction).not.toContain(
      'confirmação da entrada',
    );
  });

  it('preserves item discounts while explaining separate expenses/general discount instead of allocating them', () => {
    const payload = {
      ...example(),
      document: {
        ...example().document,
        operationalExpensesTotal: 100,
        discount: 50,
      },
      items: [
        { ...example().items[0], discountPercent: 10, totalPrice: 810 },
        example().items[1],
      ],
    };
    const result = proposalPaymentLayout(payload);
    expect(result.parts.value).toContain('810,00');
    expect(result.services.value).toContain('600,00');
    expect(result.adjustmentNote).toContain('100,00');
    expect(result.adjustmentNote).toContain('50,00');
    expect(result.adjustmentNote).toContain('destinação desses ajustes');
  });

  it('renders the new default with separate payment cards, original cover and a signature field per paragraph', () => {
    const template = new DocumentTemplateService().loadInstitutional(
      'proposal',
    );
    expect(template.key).toBe('proposal/manitec-default-v6');
    const renderer = new DocxTemplateRendererService();
    const buffer = renderer.render({
      template,
      context: new InstitutionalDocumentService().buildContext(
        'proposal',
        example(),
        template.key,
      ),
      fileName: 'pagamento.docx',
    }).buffer;
    const blocks = renderer.wordBlocks(buffer),
      visible = blocks.map((row) => row.text).join('\n');
    expect(visible).toContain('DADOS DE PAGAMENTO');
    expect(visible).toContain('Conta: 13003264-4');
    expect(visible).toContain('Conta: 1300575-2');
    for (const label of [
      'Assinatura do responsável:',
      'Nome do responsável:',
      'Data:',
    ])
      expect(blocks.some((row) => row.text.startsWith(label))).toBe(true);
    expect(visible.indexOf('Assinatura do responsável:')).toBeLessThan(
      visible.indexOf('Nome do responsável:'),
    );
    expect(visible).not.toContain('SEGREDO');
    expect(buffer.toString('utf8')).toContain('Capa institucional Manitec');
    expect(renderer.inspectFriendlyWord(buffer)).toEqual({
      labels: [],
      technicalMarkers: false,
    });
  });
});
