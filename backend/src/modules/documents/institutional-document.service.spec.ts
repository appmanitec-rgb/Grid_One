import { InstitutionalDocumentService } from './institutional-document.service';

describe('InstitutionalDocumentService contract generation', () => {
  const service = new InstitutionalDocumentService();

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
