import { DocumentGenerationService } from './document-generation.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';

describe('DocumentGenerationService', () => {
  const service = new DocumentGenerationService(
    new DocumentTemplateService(),
    new InstitutionalDocumentService(),
    new DocxTemplateRendererService(),
  );

  it('generates proposal DOCX from normalized institutional payload', () => {
    const generated = service.generateDocx('proposal', {
      company: {
        companyName: 'MANITEC',
        tradeName: 'MANITEC Operacao Integrada',
        cnpj: '00.000.000/0001-00',
      },
      document: {
        id: 'proposal-1',
        code: 'PROP-9001',
        statusLabel: 'Cliente',
        issuedAt: '2026-07-22T12:00:00.000Z',
        validUntil: '2026-08-22T00:00:00.000Z',
        totalValue: 2500,
        scope: 'Escopo tecnico visivel ao cliente.',
        paymentTerm: '30 dias',
      },
      client: {
        id: 'client-1',
        companyName: 'Cliente Exemplo',
        cnpj: '11.111.111/0001-11',
        contactName: 'Maria Cliente',
      },
      generator: {
        name: 'GMG Principal',
        brand: 'Cummins',
        serialNumber: 'SN-001',
        power: 500,
      },
      items: [
        {
          quantity: 1,
          unitPrice: 2500,
          totalPrice: 2500,
          catalogItem: { name: 'Manutencao preventiva', sku: 'SERV-001' },
        },
      ],
    });
    const content = generated.buffer.toString('utf8');

    expect(generated.fileName).toBe('proposal-PROP-9001.docx');
    expect(generated.templateKey).toBe('proposal/manitec-default-v1');
    expect(content).toContain('Proposta Comercial PROP-9001');
    expect(content).toContain('Cliente Exemplo');
    expect(content).toContain('Manutencao preventiva');
    expect(content).not.toContain('internalCost');
    expect(content).not.toContain('margin');
  });

  it('documents PDF conversion from DOCX as unavailable without a converter', () => {
    expect(service.pdfFromDocxStatus()).toEqual({
      available: false,
      reason: expect.stringContaining('LibreOffice/headless'),
    });
  });
});
