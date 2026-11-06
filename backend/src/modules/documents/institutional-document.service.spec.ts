import { InstitutionalDocumentService } from './institutional-document.service';

describe('InstitutionalDocumentService contract generation', () => {
  const service = new InstitutionalDocumentService();

  it.each([
    '2026-11-13',
    '2026-11-13T00:00:00.000Z',
    new Date('2026-11-13T00:00:00.000Z'),
  ])('keeps the calendar validity date across timezones: %s', (validUntil) => {
    const context = service.buildContext(
      'proposal',
      { document: { validUntil } },
      'proposal/manitec-default-v6',
    );
    expect(context.proposal?.validUntil).toBe('13/11/2026');
  });

  it('keeps customer notes separate from banking details and private observations', () => {
    const context = service.buildContext(
      'proposal',
      {
        document: {
          code: 'P-2',
          externalNotes: 'Agendar com o cliente.',
          paymentDetails: 'Conta de recebimento',
          internalNotes: 'PRIVADO',
        },
        client: { id: 'uuid-interno', code: '2020CLI', companyName: 'Cliente' },
      },
      'proposal/manitec-default-v2',
    );
    expect(context.proposal?.notes).toBe('Agendar com o cliente.');
    expect(context.proposal?.paymentMethod).toBe('Conta de recebimento');
    expect(context.client.code).toBe('2020CLI');
    expect(JSON.stringify(context)).not.toContain('PRIVADO');
    expect(context.proposal?.validUntil).toBe('Não informada');
    expect(context.proposal?.deliveryTerms).toBe(
      'A confirmar com o planejamento',
    );
  });

  it('shows the selected issuers and subtracts only the general discount from net lines', () => {
    const context = service.buildContext(
      'proposal',
      {
        document: {
          code: 'P-3',
          totalValue: 1220,
          discount: 50,
          paymentSelections: [
            {
              purpose: 'PARTS',
              issuerCompanyName: 'Empresa de peças',
              beneficiaryDocument: 'DOC-PECAS',
            },
            {
              purpose: 'SERVICES',
              beneficiary: 'Empresa de serviços',
              beneficiaryDocument: 'DOC-SERVICOS',
            },
          ],
        },
        client: { companyName: 'Cliente' },
        items: [
          {
            kind: 'PART',
            quantity: 2,
            unitPrice: 200,
            discountPercent: 10,
            totalPrice: 360,
          },
          { kind: 'PART', quantity: 1, unitPrice: 550, totalPrice: 550 },
          {
            kind: 'HOURLY_SERVICE',
            hours: 2,
            quantity: 1,
            unitPrice: 200,
            discountPercent: 10,
            totalPrice: 360,
          },
        ],
      },
      'proposal/manitec-default-v2',
    );
    expect(context.proposal).toMatchObject({
      summaryMaterialsTotal: 'R$\u00a0910,00',
      summaryLaborTotal: 'R$\u00a0360,00',
      generalDiscountTotal: 'R$\u00a050,00',
      total: 'R$\u00a01.220,00',
      billingSummary:
        'Peças e materiais · Empresa de peças · CPF/CNPJ: DOC-PECAS\nServiços · Empresa de serviços · CPF/CNPJ: DOC-SERVICOS',
    });
    expect(context.items[2]).toMatchObject({
      quantity: '2',
      unit: 'h',
      discountPercent: '10%',
    });
  });

  it('does not show a parts issuer in a service-only proposal or expose UUID as the customer code', () => {
    const context = service.buildContext(
      'proposal',
      {
        document: {
          code: 'P-4',
          deliveryLeadTimeDays: 0,
          paymentSelections: [
            { purpose: 'PARTS', beneficiary: 'Emitente inaplicável' },
            {
              purpose: 'SERVICES',
              beneficiary: 'Prestadora',
              beneficiaryDocument: 'DOC',
            },
          ],
        },
        client: { id: 'uuid-interno', companyName: 'Cliente' },
        items: [
          { kind: 'SERVICE', quantity: 1, unitPrice: 100, totalPrice: 100 },
        ],
      },
      'proposal/manitec-default-v2',
    );
    expect(context.proposal?.billingSummary).toBe(
      'Serviços · Prestadora · CPF/CNPJ: DOC',
    );
    expect(context.client.code).toBe('Não informado');
    expect(context.proposal?.deliveryTerms).toBe('0 dia(s)');
  });

  it('keeps proposal item semantics and calculates every discount in the document', () => {
    const context = service.buildContext(
      'proposal',
      {
        company: { companyName: 'MANITEC' },
        client: { id: 'client-1', companyName: 'Cliente Exemplo' },
        document: {
          id: 'proposal-1',
          code: '90001/00',
          issuedAt: '2026-09-03T12:00:00.000Z',
          totalValue: 800,
          discount: 100,
        },
        items: [
          {
            kind: 'HOURLY_SERVICE',
            description: 'Manutencao especializada',
            hours: 5,
            quantity: 5,
            unitPrice: 200,
            discountPercent: 10,
            totalPrice: 900,
          },
        ],
      },
      'proposal/manitec-default-v1',
    );

    expect(context.items[0]).toMatchObject({
      description: 'Manutencao especializada',
      quantity: '5',
      unit: 'h',
      discountPercent: '10%',
    });
    expect(context.parts).toHaveLength(0);
    expect(context.services).toHaveLength(1);
    expect(context.proposal).toMatchObject({
      laborTotal: 'R$\u00a0900,00',
      materialsTotal: 'R$\u00a00,00',
      discountTotal: 'R$\u00a0200,00',
      total: 'R$\u00a0800,00',
    });
  });

  it('exposes only the consolidated operational expense total and composition in the client document', () => {
    const context = service.buildContext(
      'proposal',
      {
        company: { companyName: 'MANITEC' },
        client: { id: 'client-1', companyName: 'Cliente Exemplo' },
        document: {
          id: 'proposal-1',
          code: '90001/00',
          totalValue: 1450,
          operationalExpensesTotal: 450,
          operationalExpenses: [
            {
              expenseType: 'DISPLACEMENT',
              quantity: 100,
              unitPrice: 2.5,
              total: 250,
            },
            {
              expenseType: 'TOLL',
              quantity: 2,
              unitPrice: 100,
              total: 200,
            },
          ],
        },
        items: [],
      },
      'proposal/manitec-default-v1',
    );

    expect(context.proposal).toMatchObject({
      expensesTotal: 'R$\u00a0450,00',
      expensesComposition:
        '☑ Deslocamento  ☐ Alimentacao  ☑ Pedagio  ☐ Hospedagem  ☐ Estacionamento',
    });
    expect(context.proposal).not.toHaveProperty('operationalExpenses');
  });

  it('applies document options without changing the contract master data', () => {
    const context = service.buildContext(
      'contract',
      {
        company: {
          companyName: 'MANITEC',
          cnpj: '00.000.000/0001-00',
          city: 'Indaiatuba',
          state: 'SP',
          email: 'contratos@manitec.test',
        },
        client: {
          id: 'client-1',
          companyName: 'Cliente Exemplo',
          cnpj: '11.111.111/0001-11',
          contactName: 'Contato Padrao',
        },
        createdByUser: {
          name: 'Gestor MANITEC',
          email: 'gestor@manitec.test',
        },
        document: {
          id: 'contract-1',
          code: 'CTR-1',
          issuedAt: '2026-08-29T12:00:00.000Z',
          startDate: '2026-09-01T12:00:00.000Z',
          endDate: '2027-08-31T12:00:00.000Z',
          preventiveRecurrence: 'MONTHLY',
          responseTimeHours: 4,
          correctiveVisitAllowance: 2,
          partsCoverage: 'BILLED_SEPARATELY',
          recurringAmount: 5000,
          dueDay: 10,
          adjustmentIndex: 'IPCA',
        },
        equipments: [],
        generationOptions: {
          paymentMethod: 'PIX',
          maintenanceWindow: 'sabados, das 8h as 12h',
          companySigner: 'Diretor MANITEC',
          clientSigner: 'Diretor Cliente',
          includePreventiveChecklist: false,
        },
      },
      'contract/manitec-default-v1',
    );

    expect(context.contract).toMatchObject({
      number: 'CTR-1',
      recurringAmount: 'R$\u00a05.000,00',
      preventiveRecurrence: 'mensal',
      paymentMethod: 'PIX',
      maintenanceWindow: 'sabados, das 8h as 12h',
      preventiveChecklist:
        'O roteiro técnico detalhado não integra esta emissão.',
    });
    expect(context.signatures).toMatchObject({
      companySigner: 'Diretor MANITEC',
      clientSigner: 'Diretor Cliente',
    });
  });
});
