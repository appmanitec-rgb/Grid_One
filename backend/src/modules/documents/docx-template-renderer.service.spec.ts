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
        parts: [
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
    expect(content).toContain('PROPOSTA COMERCIAL');
    expect(content).toContain('VALOR TOTAL DA PROPOSTA');
    expect(content).toContain('Informações de CNPJ para faturamentos');
    expect(content).toContain('word/media/image1.jpg');
    expect(content).toContain('word/media/image2.png');
    expect(content).not.toContain('Controle documental');
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

  it('renders the institutional contract DOCX with current system variables', () => {
    const template = templates.loadInstitutional('contract');
    const generated = renderer.render({
      template,
      fileName: 'contrato-CTR-1.docx',
      context: {
        company: {
          name: 'MANITEC',
          document: '00.000.000/0001-00',
          street: 'Rua Teste',
          addressNumber: '100',
          city: 'Sao Paulo',
          state: 'SP',
          email: 'contratos@manitec.test',
        },
        client: {
          id: 'CLI-1',
          name: 'Cliente Contrato',
          document: '11.111.111/0001-11',
          street: 'Avenida Cliente',
          city: 'Campinas',
          state: 'SP',
        },
        contact: {
          name: 'Contato Cliente',
          email: 'cliente@example.test',
          phone: '(19) 9999-9999',
          mobile: '(19) 9888-8888',
          role: 'Gerente',
        },
        consultant: {
          name: 'Consultor MANITEC',
          email: 'consultor@manitec.test',
          phone: '(19) 0000-0000',
        },
        contract: {
          number: 'CTR-1',
          date: '22/07/2026',
          startDate: '01/08/2026',
          endDate: '31/07/2027',
          recurringAmount: 'R$ 5.000,00',
          dueDay: '10',
          billingPeriod: 'mensal',
          paymentMethod: 'Boleto',
          validityDescription: '01/08/2026 a 31/07/2027',
          renewalNotes: 'Renovacao mediante aceite.',
          renewalNotice: '30 dias antes do termino',
          maintenanceWindow: 'Horario comercial',
          preventiveRecurrence: 'Mensal',
          correctiveVisitAllowance: '2',
          correctiveVisitAllowancePeriod: 'chamados mensais',
          preventiveVisitSummary: 'Mensal',
          responseTime: '4h',
          partsCoverage: 'Pecas faturadas separadamente',
          notes: 'Sem observacoes.',
        },
        commercialTerms: {
          adjustmentIndex: 'IPCA',
        },
        equipment: {},
        items: [
          {
            description: 'GMG Principal',
            serialNumber: 'SN-001',
            site: 'Matriz',
            coverage: 'R$ 5.000,00',
          },
        ],
        services: [
          {
            description: 'Manutencao preventiva mensal',
            quantity: '1',
            unit: 'contrato',
            total: 'R$ 5.000,00',
          },
        ],
        technicalScope: {},
        signatures: {},
        metadata: {
          templateKey: 'contract/manitec-default-v1',
          generatedAt: '2026-07-22T00:00:00.000Z',
        },
      },
    });
    const content = generated.buffer.toString('utf8');

    expect(generated.buffer.subarray(0, 4).toString('ascii')).toBe(
      'PK\u0003\u0004',
    );
    expect(content).toContain('CTR-1');
    expect(content).toContain('Cliente Contrato');
    expect(content).toContain('word/media/image1.png');
    expect(content).toContain('word/media/image2.jpeg');
    expect(content).not.toContain('Controle documental');
    expect(content).not.toContain('!contratospx');
    expect(content).not.toContain('^datacon');
  });
});
