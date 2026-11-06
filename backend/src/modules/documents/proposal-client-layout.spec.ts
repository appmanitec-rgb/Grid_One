import { proposalClientLayout } from './proposal-client-layout';
import { InstitutionalDocumentService } from './institutional-document.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';

function example() {
  return {
    company: { companyName: 'MANITEC' },
    client: { companyName: 'Cliente demonstrativo', code: '2020CLI' },
    document: {
      code: 'EXEMPLO',
      isDemonstration: true,
      scope:
        'TOF - Troca de óleo e filtros\nSubstituição dos filtros e do óleo.\nTestes de funcionamento.',
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
        description: 'Troca de óleo e filtros',
        quantity: 2,
        hours: 2,
        unitPrice: 200,
        discountPercent: 10,
        totalPrice: 360,
      },
    ],
  };
}

describe('Customer-first proposal layout v3', () => {
  it('preserves the R$1320 example and separates technical travel from other expenses and freight', () => {
    const payload = example(),
      before = JSON.stringify(payload),
      result = proposalClientLayout(payload);
    expect(result.arithmeticConsistent).toBe(true);
    expect(result.displacementTotal).toBe('R$\u00a0100,00');
    expect(result.otherExpensesTotal).toBe('R$\u00a00,00');
    expect(result.freight).toContain('Custo não especificado');
    expect(result.reviewLabel).toContain('DADOS DEMONSTRATIVOS');
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('flags the day basis, starting event and second installment without choosing them', () => {
    const result = proposalClientLayout(example());
    expect(result.execution).toContain('10 dias');
    expect(result.execution).toContain('Confirmar dias úteis ou corridos');
    expect(result.execution).toContain('início da contagem');
    expect(result.payment).toContain('15/11/2026');
    expect(result.paymentPending).toBe(
      'Vencimento da segunda parcela a confirmar.',
    );
    expect(JSON.stringify(result)).not.toContain('15/12/2026');
    expect(result.partsTiming).not.toContain('48 horas');
  });

  it('does not create arbitrary installment dates when the saved cadence is available', () => {
    const payload = {
      ...example(),
      document: {
        ...example().document,
        installmentCount: 2,
        firstDueDate: '2026-11-15',
        installmentIntervalDays: 30,
      },
    };
    const result = proposalClientLayout(payload);
    expect(result.paymentPending).toBe('');
    expect(result.payment).toBe(payload.document.paymentSummary);
  });

  it('keeps penalties visible as conditions for confirmation rather than silently changing percentages', () => {
    const result = proposalClientLayout(example());
    expect(result.defaultTerms).toMatch(/2%.*1% ao mês.*correção monetária/);
    expect(result.defaultTerms).toContain('30 dias');
    expect(result.defaultTerms).toContain('incompleto');
    expect(result.cancellationTerms).toContain('10%');
    expect(result.cancellationTerms).toContain('cinco dias corridos');
    expect(result.warranty).toContain('não estabelece um prazo');
    expect(result.paymentAllocation).toContain(
      'não se presume divisão igual ou proporcional',
    );
  });

  it.each([
    'TOF - Troca de óleo e filtros',
    'Excluída a instalação elétrica',
    'Sem instalação elétrica',
    'Não inclui interligação elétrica',
  ])('omits generic installation language for scope %s', (scope) => {
    const payload = example();
    payload.document.scope = scope;
    expect(proposalClientLayout(payload).installationNote).toBe('');
  });

  it('shows installation guidance only for an expressly included activity and cites no assumed standards', () => {
    const payload = example();
    payload.document.scope = 'Instalação e interligação elétrica do gerador.';
    const result = proposalClientLayout(payload);
    expect(result.installationNote).toContain('expressamente contratados');
    expect(result.installationNote).not.toMatch(/NBR|NR-10|CREA/);
  });

  it('flags inconsistent totals without changing the recorded commercial values', () => {
    const payload = example();
    payload.document.totalValue = 1500;
    const result = proposalClientLayout(payload);
    expect(result.arithmeticConsistent).toBe(false);
    expect(result.arithmeticNote).toContain('divergência');
    expect(payload.document.totalValue).toBe(1500);
  });

  it('renders two commercial tables and customer-first content without the obsolete cover or clauses', () => {
    const template = new DocumentTemplateService().loadInstitutional(
      'proposal',
      'manitec-default-v3',
    );
    expect(template.key).toBe('proposal/manitec-default-v3');
    const context = new InstitutionalDocumentService().buildContext(
      'proposal',
      example(),
      template.key,
    );
    const renderer = new DocxTemplateRendererService();
    const output = renderer.render({
      template,
      context,
      fileName: 'example.docx',
    }).buffer;
    const xml = output.toString('utf8');
    expect(xml).toContain('Peças e materiais');
    expect(xml).toContain('Serviços e mão de obra');
    expect(xml).toContain('1.320,00');
    expect(xml).toContain('Subtotal');
    expect(xml).toContain('<w:keepLines/>');
    expect(xml).toContain('Substituição dos filtros e do óleo.');
    expect(xml).not.toContain('manitec_compact_items');
    expect(xml).not.toContain('manitec_extended_items');
    expect(xml).not.toContain('48 horas');
    const visibleText = renderer
      .wordBlocks(output)
      .map((block) => block.text)
      .join('\n');
    expect(visibleText).not.toMatch(
      /NBR-5410|NBR-14039|\bCREA\b|supervisão de obra/i,
    );
    expect(xml).not.toContain('image2.png');
    expect(renderer.inspectFriendlyWord(output)).toEqual({
      labels: [],
      technicalMarkers: false,
    });
  });

  it('selects the long layout and emits each detailed table only once', () => {
    const payload = example();
    payload.items = Array.from({ length: 12 }, (_, index) => ({
      ...payload.items[index % 3],
    }));
    expect(proposalClientLayout(payload).extendedLayout).toBe(true);
    const template = new DocumentTemplateService().loadInstitutional(
      'proposal',
      'manitec-default-v3',
    );
    const context = new InstitutionalDocumentService().buildContext(
      'proposal',
      payload,
      template.key,
    );
    const renderer = new DocxTemplateRendererService();
    const buffer = renderer.render({
      template,
      context,
      fileName: 'long.docx',
    }).buffer;
    const visible = renderer
      .wordBlocks(buffer)
      .map((block) => block.text)
      .join('\n');
    expect(visible).toContain(
      'A relação completa de itens está nas páginas seguintes.',
    );
    expect(visible.match(/Preço unit\./g)).toHaveLength(2);
    expect(buffer.toString('utf8')).not.toContain('manitec_extended_items');
  });
});
