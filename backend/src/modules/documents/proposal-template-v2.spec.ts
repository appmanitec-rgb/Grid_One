import { readFileSync } from 'fs';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';
import { InstitutionalDocumentService } from './institutional-document.service';

describe('Proposal standard template v2', () => {
  const templates = new DocumentTemplateService();
  const renderer = new DocxTemplateRendererService();

  it('keeps v2 explicitly available alongside the legacy version', () => {
    expect(
      templates.loadInstitutional('proposal', 'manitec-default-v2').key,
    ).toBe('proposal/manitec-default-v2');
    expect(templates.loadInstitutional('contract').key).toBe(
      'contract/manitec-default-v1',
    );
    expect(
      templates.loadInstitutional('proposal', 'manitec-default-v1').key,
    ).toBe('proposal/manitec-default-v1');
  });

  it('renders multiline public scope, real customer code, units and separate discounts', () => {
    const template = templates.loadInstitutional(
      'proposal',
      'manitec-default-v2',
    );
    const context = new InstitutionalDocumentService().buildContext(
      'proposal',
      {
        company: { companyName: 'Manitec' },
        client: {
          id: 'UUID-NAO-IMPRIMIR',
          code: '2020CLI',
          companyName: 'Razão social Ltda.',
          tradeName: 'Fantasia',
        },
        document: {
          code: 'P-V2',
          scope: 'Linha um & teste\nLinha dois <teste>',
          externalNotes: 'Nota pública',
          internalNotes: 'PRIVADO-NAO-IMPRIMIR',
          paymentDetails: 'Conta de recebimento',
          discount: 50,
          totalValue: 310,
        },
        items: [
          {
            kind: 'HOURLY_SERVICE',
            description: 'Atendimento técnico',
            hours: 2,
            quantity: 1,
            unitPrice: 200,
            discountPercent: 10,
            totalPrice: 360,
            catalogItem: { sku: 'SERV-1' },
          },
        ],
      },
      template.key,
    );
    const buffer = renderer.render({
      template,
      context,
      fileName: 'preview.docx',
    }).buffer;
    const xml = buffer.toString('utf8');
    expect(xml).toContain('2020CLI');
    expect(xml).toContain('Razão social Ltda.');
    expect(xml).not.toContain('Fantasia');
    expect(xml).not.toContain('UUID-NAO-IMPRIMIR');
    expect(xml).not.toContain('PRIVADO-NAO-IMPRIMIR');
    expect(xml).toContain('Linha um &amp; teste</w:t><w:br/>');
    expect(xml).toContain('Linha dois &lt;teste&gt;');
    expect(xml).toContain('Desc.');
    expect(xml).toContain('>h</w:t>');
    expect(xml).toContain('10%');
    expect(xml).not.toContain('R$ R$');
    expect(renderer.inspectFriendlyWord(buffer)).toEqual({
      labels: [],
      technicalMarkers: false,
    });
    expect(
      renderer.wordTemplatePaths(readFileSync(template.docxTemplatePath!)),
    ).toContain('__proposal_items__');
  });
});
