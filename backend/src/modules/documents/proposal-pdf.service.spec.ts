import { DocumentTemplateService } from './document-template.service';
import { PdfRenderService } from './pdf-render.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { TemplateRendererService } from './template-renderer.service';

describe('ProposalPdfService', () => {
  const service = new ProposalPdfService(
    new DocumentTemplateService(),
    new TemplateRendererService(),
    new PdfRenderService(),
  );

  it('generates a real proposal PDF from a versioned template without internal metadata', () => {
    const generated = service.generate({
      company: {
        companyName: 'MANITEC',
        tradeName: 'MANITEC Operacao Integrada',
        cnpj: '00.000.000/0001-00',
        email: 'contato@manitec.test',
      },
      document: {
        code: 'PROP-9001',
        statusLabel: 'Cliente',
        type: 'SALE',
        totalValue: 12345.67,
        validUntil: '2026-08-01T00:00:00.000Z',
        issuedAt: '2026-07-17T12:00:00.000Z',
        scope: 'Manutencao preventiva de grupo gerador.',
        freight: 'Incluso',
        paymentTerm: '30 dias',
        paymentDetails: 'Pagamento via boleto.',
        hasDownPayment: false,
      },
      client: {
        companyName: 'Cliente Exemplo',
        cnpj: '11.111.111/0001-11',
        email: 'cliente@example.test',
        city: 'Sao Paulo',
        state: 'SP',
      },
      generator: {
        name: 'GMG Principal',
        brand: 'Cummins',
        serialNumber: 'SN-001',
        power: 500,
      },
      seller: { name: 'Comercial MANITEC', email: 'vendas@manitec.test' },
      items: [
        {
          quantity: 2,
          unitPrice: 1000,
          totalPrice: 2000,
          catalogItem: { name: 'Filtro de oleo', sku: 'FLT-001', unit: 'UN' },
        },
      ],
    });
    const pdf = generated.buffer;
    const content = pdf.toString('latin1');

    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('Proposta Comercial PROP-9001');
    expect(content).toContain('Cliente Exemplo');
    expect(content).toContain('Filtro de oleo');
    expect(generated.templateKey).toBe('proposal/manitec-default-v1');
    expect(generated.templateVersion).toBe('manitec-default-v1');
    expect(generated.html).toContain('Proposta Comercial');
    expect(generated.html).toContain('Cliente Exemplo');
    expect(content).not.toContain('internalNotes');
    expect(content).not.toContain('approvalDiscountLimit');
    expect(content).not.toContain('hourCost');
    expect(content).not.toContain('sidebar');
    expect(content).not.toContain('button');
  });

  it('renders optional proposal fields without breaking the template', () => {
    const preview = service.renderHtml({
      company: { companyName: 'MANITEC' },
      document: {
        code: 'PROP-SEM-CAMPOS',
        statusLabel: 'Cliente',
        type: 'SALE',
        totalValue: 0,
        issuedAt: '2026-07-17T12:00:00.000Z',
      },
      client: {
        companyName: 'Cliente sem opcionais',
      },
      items: [],
    });

    expect(preview.templateKey).toBe('proposal/manitec-default-v1');
    expect(preview.html).toContain('PROP-SEM-CAMPOS');
    expect(preview.html).not.toContain('{{');
  });
});
