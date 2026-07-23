import { DocumentGenerationService } from './document-generation.service';
import { DocumentTemplateService } from './document-template.service';
import { DocxToPdfService } from './docx-to-pdf.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';

describe('DocumentGenerationService', () => {
  const docxToPdf = {
    status: jest.fn().mockReturnValue({
      available: true,
      binaryPath: 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    }),
    convertDocxToPdf: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-1.4\nPDF gerado\n%%EOF')),
  };
  const service = new DocumentGenerationService(
    new DocumentTemplateService(),
    new InstitutionalDocumentService(),
    new DocxTemplateRendererService(),
    docxToPdf as unknown as DocxToPdfService,
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
    expect(content).toContain('PROP-9001');
    expect(content).toContain('Cliente Exemplo');
    expect(content).toContain('Manutencao preventiva');
    expect(content).not.toContain('internalCost');
    expect(content).not.toContain('margin');
  });

  it('documents PDF conversion from DOCX as available when LibreOffice is configured', () => {
    expect(service.pdfFromDocxStatus()).toEqual({
      available: true,
      binaryPath: 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    });
  });

  it('generates proposal PDF from the rendered DOCX', async () => {
    const generated = await service.generatePdfFromDocx('proposal', {
      company: { companyName: 'MANITEC', tradeName: 'MANITEC' },
      document: {
        id: 'proposal-1',
        code: 'PROP-9002',
        statusLabel: 'Cliente',
        issuedAt: '2026-07-22T12:00:00.000Z',
        totalValue: 3500,
        scope: 'Escopo PDF.',
      },
      client: {
        id: 'client-1',
        companyName: 'Cliente PDF',
        cnpj: '11.111.111/0001-11',
      },
      items: [],
    });

    expect(generated.fileName).toBe('proposal-PROP-9002.pdf');
    expect(generated.mimeType).toBe('application/pdf');
    expect(generated.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(generated.sourceDocxChecksumSha256).toHaveLength(64);
    expect(docxToPdf.convertDocxToPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'proposal-PROP-9002.docx',
        buffer: expect.any(Buffer),
      }),
    );
  });
});
