import { proposalBrandedLayout } from './proposal-branded-layout';
import { InstitutionalDocumentService } from './institutional-document.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';

function example() {
  return {
    company: { companyName: 'MANITEC RAZÃO SOCIAL', tradeName: 'Manitec' },
    client: { companyName: 'Cliente', code: '2020CLI' },
    generator: {
      name: 'Gerador',
      manufacturer: 'Perkins',
      engineManufacturer: 'Perkins',
      hourMeter: 1450,
    },
    document: {
      code: 'REVISÃO',
      scope: 'TOF - Troca de óleo e filtros\nTestes de funcionamento.',
      internalNotes: 'SEGREDO INTERNO DO VENDEDOR',
      externalNotes: 'Agendar acesso com o cliente.',
      totalValue: 1320,
      discount: 50,
      operationalExpensesTotal: 100,
      operationalExpenses: [
        { expenseType: 'DISPLACEMENT', quantity: 1, total: 100 },
      ],
      deliveryLeadTimeDays: 10,
      paymentSummary: '2 parcelas de R$ 660,00. Primeira em 15/11/2026.',
      paymentSelections: [
        { purpose: 'PARTS', beneficiaryDocument: 'DOC-PECAS' },
        { purpose: 'SERVICES', beneficiaryDocument: 'DOC-SERVICOS' },
      ],
      freight: 'FOB',
    },
    items: [
      {
        kind: 'PART',
        description: 'Filtro',
        quantity: 2,
        unitPrice: 200,
        discountPercent: 10,
        totalPrice: 360,
      },
      {
        kind: 'PART',
        description: 'Óleo',
        quantity: 1,
        unitPrice: 550,
        totalPrice: 550,
      },
      {
        kind: 'HOURLY_SERVICE',
        description: 'Manutenção TOF',
        quantity: 2,
        hours: 2,
        unitPrice: 200,
        discountPercent: 10,
        totalPrice: 360,
      },
    ],
  };
}

describe('Manitec branded proposal v4', () => {
  it('restores applicable commitments and preserves recorded amounts without leaking internal guidance', () => {
    const payload = example(),
      before = JSON.stringify(payload);
    const result = proposalBrandedLayout(payload);
    expect(result.contractorText).toMatch(
      /ferramental[\s\S]*relatório[\s\S]*operador/,
    );
    expect(result.clientText).toMatch(
      /acesso seguro[\s\S]*responsável autorizado[\s\S]*termo[\s\S]*local limpo[\s\S]*não autorizadas/,
    );
    expect(result.execution).toContain('10 dias');
    expect(result.payment).toContain('R$ 660,00');
    expect(result.paymentPending).toContain('2ª parcela');
    expect(result.defaultTerms).toMatch(/2%.*1% ao mês/);
    expect(result.cancellationTerms).toMatch(/cinco dias corridos.*10%/);
    expect(result.partsTiming).toMatch(
      /disponibilidade[\s\S]*aprovação[\s\S]*agendamento[\s\S]*fabricante[\s\S]*comunicadas/,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /SEGREDO|48 horas|modelo prevê|confirmar antes|incompleto|não se presume/i,
    );
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('does not apply service duties or a service cancellation fee to a parts-only sale', () => {
    const payload = example();
    payload.items = payload.items.filter((item) => item.kind === 'PART');
    const result = proposalBrandedLayout(payload);
    expect(result.contractorText).toContain('Fornecer as peças');
    expect(result.contractorText).not.toMatch(/operador|ferramental/);
    expect(result.clientText).not.toMatch(/manutenção|técnicos/);
    expect(result.cancellationTerms).not.toContain('10%');
    expect(result.billingNote).toBe('');
  });

  it('does not claim separate issuer allocations when both item groups use one company', () => {
    const payload = example();
    payload.document.paymentSelections[1].beneficiaryDocument = 'DOC-PECAS';
    expect(proposalBrandedLayout(payload).billingNote).toBe('');
    expect(proposalBrandedLayout(example()).billingNote).toContain(
      'entre os emitentes: a definir',
    );
  });

  it('uses short pending fields instead of editorial instructions for missing payment and CIF cost', () => {
    const payload = example();
    payload.document.paymentSummary = '';
    payload.document.freight = 'CIF';
    const result = proposalBrandedLayout(payload);
    expect(result.payment).toBe('A definir.');
    expect(result.freight).toBe('Por conta da Manitec (CIF). Custo a definir.');
  });

  it.each([undefined, false])(
    'omits unconfirmed warranty (%s) and installation language unrelated to maintenance',
    (confirmed) => {
      const payload = {
        ...example(),
        document: {
          ...example().document,
          warrantyTerms: '90 dias',
          warrantyConfirmed: confirmed,
        },
      };
      const result = proposalBrandedLayout(payload);
      expect(result.warranty).toBe('');
      expect(result.installationNote).toBe('');
      expect(result.contractorText).not.toMatch(/instalação|obra|CREA/);
    },
  );

  it('shows warranty only when explicitly confirmed and keeps sequential acceptance headings', () => {
    const result = proposalBrandedLayout({
      ...example(),
      document: {
        ...example().document,
        warrantyTerms: 'Garantia acordada por escrito.',
        warrantyConfirmed: true,
      },
    });
    expect(result.warranty).toBe('Garantia acordada por escrito.');
    expect(result.acceptanceHeading).toBe('7.8 Aceite');
    const unconfirmed = proposalBrandedLayout(example());
    expect(unconfirmed.acceptanceHeading).toBe('7.7 Aceite');
  });

  it.each([false, true])(
    'renders branded native tables, complete identities and conditional warranty (%s)',
    (confirmed) => {
      const payload = {
        ...example(),
        document: {
          ...example().document,
          warrantyTerms: 'GARANTIA CONFIRMADA PARA TESTE',
          warrantyConfirmed: confirmed,
        },
      };
      const template = new DocumentTemplateService().loadInstitutional(
        'proposal',
        'manitec-default-v4',
      );
      expect(template.key).toBe('proposal/manitec-default-v4');
      const context = new InstitutionalDocumentService().buildContext(
        'proposal',
        payload,
        template.key,
      );
      const renderer = new DocxTemplateRendererService();
      const output = renderer.render({
        template,
        context,
        fileName: 'proposta.docx',
      }).buffer;
      const visible = renderer
        .wordBlocks(output)
        .map((block) => block.text)
        .join('\n');
      expect(visible).toContain('MANITEC RAZÃO SOCIAL');
      expect(visible).toContain('IDENTIFICAÇÃO DAS PARTES');
      expect(visible).toContain('Horímetro: 1450 h');
      expect(visible).toContain('1.320,00');
      expect(visible).toContain('Peças / descrição');
      expect(visible).toContain('Serviços / descrição');
      expect(visible.includes('GARANTIA CONFIRMADA PARA TESTE')).toBe(
        confirmed,
      );
      expect(visible.includes('7.5 Garantia')).toBe(confirmed);
      expect(visible).not.toMatch(
        /SEGREDO|\{\{|!proposta|48 horas|modelo prevê|confirmar antes|incompleto|não se presume/i,
      );
      const xml = output.toString('utf8');
      expect(xml).toContain('<w:tblHeader/>');
      expect(xml).toContain('<w:cantSplit/>');
      expect(xml).toContain('<w:keepLines/>');
      expect(renderer.inspectFriendlyWord(output)).toEqual({
        labels: [],
        technicalMarkers: false,
      });
    },
  );
});
