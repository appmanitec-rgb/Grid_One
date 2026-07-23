import { BadRequestException } from '@nestjs/common';
import { DocumentTemplateService } from './document-template.service';
import { DocxTemplateRendererService } from './docx-template-renderer.service';

describe('DocxTemplateRendererService', () => {
  const templates = new DocumentTemplateService();
  const renderer = new DocxTemplateRendererService();

  it('loads an institutional proposal template and renders DOCX with variables and table rows', () => {
    const template = templates.loadInstitutional('proposal');
    const generated = renderer.render({
      template,
      fileName: 'proposta-PROP-1.docx',
      context: {
        company: {
          name: 'MANITEC',
          document: '00.000.000/0001-00',
          stateRegistration: 'ISENTO',
          address: 'Rua Teste',
          city: 'Sao Paulo',
          state: 'SP',
          email: 'contato@manitec.test',
          phone: '(11) 0000-0000',
          billingPartsName: 'MANITEC Pecas',
          billingPartsDocument: '00.000.000/0001-00',
          billingServicesName: 'MANITEC Servicos',
          billingServicesDocument: '00.000.000/0001-00',
        },
        client: {
          name: 'Cliente Exemplo',
          document: '11.111.111/0001-11',
          stateRegistration: 'ISENTO',
          address: 'Endereco Cliente',
          city: 'Sao Paulo',
          state: 'SP',
          contactName: 'Contato Cliente',
          email: 'cliente@example.test',
        },
        contact: {
          name: 'Contato Cliente',
          email: 'cliente@example.test',
          phone: '(11) 9999-9999',
        },
        proposal: {
          number: 'PROP-1',
          title: 'Proposta Comercial PROP-1',
          date: '22/07/2026',
          validUntil: '22/08/2026',
          summary: 'Resumo comercial da proposta.',
          total: 'R$ 1.000,00',
          laborTotal: 'R$ 800,00',
          expensesTotal: 'R$ 0,00',
          materialsTotal: 'R$ 200,00',
          discountTotal: 'R$ 0,00',
          status: 'Cliente',
          scope: 'Manutencao preventiva.',
          notes: 'Sem observacoes.',
          paymentTerms: '30 dias',
          paymentMethod: 'Boleto',
          deliveryTerm: '10 dias',
          freight: 'Incluso',
          taxes: 'Inclusos.',
          validationCode: 'PROP-1',
          validationUrl: '-',
        },
        equipment: {
          name: 'GMG Principal',
          type: 'Grupo gerador',
          manufacturer: 'Cummins',
          engineManufacturer: 'Cummins',
          serialNumber: 'SN-001',
          serial: 'SN-001',
          site: 'Matriz',
          power: '500 kVA',
          hourMeter: '100 h',
          generator: {
            model: 'Cummins',
            power: '500 kVA',
          },
        },
        service: {
          description: 'Manutencao preventiva.',
          notes: 'Sem observacoes.',
        },
        terms: {
          standards: 'Normas tecnicas aplicaveis.',
          delivery: '10 dias',
          warranty: 'Garantia de fabricante.',
          contractorObligations: 'Executar o escopo aprovado.',
          clientObligations: 'Garantir acesso ao equipamento.',
          default: 'Condicoes comerciais da proposta.',
          cancellation: 'Cancelamento mediante formalizacao.',
          additional: 'Sem observacoes.',
        },
        commercial: { notes: 'Sem observacoes.' },
        approval: {
          clientSignerName: 'Contato Cliente',
          clientSignerRole: 'Responsavel',
          date: '22/07/2026',
        },
        consultant: {
          name: 'Consultor MANITEC',
          email: 'consultor@manitec.test',
          phone: '(11) 0000-0000',
          role: 'Consultor comercial',
        },
        manager: {
          name: 'Gestor MANITEC',
          role: 'Gestor comercial',
        },
        scopeItems: [{ description: 'Inspecao geral do equipamento.' }],
        deliverables: [{ description: 'Relatorio tecnico.' }],
        exclusions: [{ description: 'Obras civis.' }],
        items: [
          {
            code: 'FLT-001',
            description: 'Filtro de oleo',
            sku: 'FLT-001',
            quantity: '1',
            unit: 'UN',
            unitPrice: 'R$ 100,00',
            total: 'R$ 100,00',
          },
        ],
        services: [
          {
            code: 'SERV-001',
            description: 'Manutencao preventiva',
            quantity: '1',
            unit: 'UN',
            unitPrice: 'R$ 900,00',
            total: 'R$ 900,00',
          },
        ],
        commercialTerms: {
          payment: '30 dias',
          freight: 'Incluso',
          delivery: '10 dias',
        },
        technicalScope: {
          warranty: 'Garantia de fabricante.',
          exclusions: 'Obras civis.',
        },
        signatures: { client: 'Assinatura do cliente' },
        metadata: {
          templateKey: 'proposal/manitec-default-v1',
          generatedAt: '2026-07-22T00:00:00.000Z',
        },
      },
    });
    const content = generated.buffer.toString('utf8');

    expect(generated.buffer.subarray(0, 4).toString('ascii')).toBe(
      'PK\u0003\u0004',
    );
    expect(generated.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(generated.templateKey).toBe('proposal/manitec-default-v1');
    expect(generated.checksumSha256).toHaveLength(64);
    expect(content).toContain('PROP-1');
    expect(content).toContain('Cliente Exemplo');
    expect(content).toContain('Filtro de oleo');
    expect(content).not.toContain('hourCost');
    expect(content).not.toContain('storageKey');
  });

  it('rejects missing required variables from template schema', () => {
    const template = templates.loadInstitutional('proposal');

    expect(() =>
      renderer.render({
        template,
        fileName: 'invalid.docx',
        context: {
          company: { name: 'MANITEC' },
          client: {},
          proposal: { number: '' },
          items: [],
        },
      }),
    ).toThrow(BadRequestException);
  });
});
