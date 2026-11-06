import {
  composeTechnicalScope,
  technicalScopeSourceHash,
} from './technical-scope.engine';
import {
  DEFAULT_SCOPE_FAMILIES,
  DEFAULT_SCOPE_PROCEDURES,
} from './technical-scope.defaults';
import {
  classifyScopeItems,
  sufficientManualService,
} from './technical-service-classification';
import { reviewProposal } from '../proposals/proposal-review.domain';
import type { EngineInput, ScopeSourceItem } from './technical-scope.types';

function setup(
  entries: Array<{
    key: string;
    family?: string;
    kind?: string;
    quantity?: number;
    description?: string;
    hours?: number;
  }>,
): EngineInput {
  return {
    proposalType: 'PARTS_AND_SERVICES',
    equipment: { name: 'Gerador de ensaio', clientId: 'client' },
    families: structuredClone(DEFAULT_SCOPE_FAMILIES),
    procedures: structuredClone(DEFAULT_SCOPE_PROCEDURES),
    items: entries.map((row) => ({
      key: row.key,
      kind: row.kind || 'MATERIAL',
      catalogItemId: row.kind === 'HOURLY' ? null : row.key,
      description: row.description || row.family || row.key,
      quantity: row.quantity || 1,
      ...(row.hours === undefined ? {} : { hours: row.hours }),
    })),
    profiles: entries
      .filter((row) => row.family)
      .map((row) => ({ catalogItemId: row.key, familyCodes: [row.family!] })),
  };
}
const service = (family: string, key = 'labor', quantity = 1) => ({
  key,
  family,
  kind: 'SERVICE',
  quantity,
});
const errors = (input: EngineInput) =>
  composeTechnicalScope(input).alerts.filter(
    (alert) => alert.severity === 'error',
  );

describe('refinamento profissional do escopo contratado', () => {
  it('1. filtro isolado gera somente fornecimento, sem exigir substituição', () => {
    const input = setup([{ key: 'filtro', family: 'OIL_FILTER', quantity: 2 }]);
    const preview = composeTechnicalScope(input);
    expect(preview.procedures).toEqual([]);
    expect(errors(input)).toEqual([]);
    expect(preview.generatedText).toContain('FORNECIMENTO DE MATERIAIS');
    expect(preview.generatedText).toContain('2 × OIL_FILTER');
    expect(preview.generatedText).not.toMatch(
      /serviço comercial|detalhamento|objetivo|substituição|teste/i,
    );
  });
  it('2. óleo e filtros sem mão de obra não inferem capacidade do cárter', () => {
    const input = setup([
      {
        key: 'oil',
        family: 'OIL',
        quantity: 3,
        description: 'Embalagem de óleo de 20 L',
      },
      { key: 'filter', family: 'OIL_FILTER' },
    ]);
    const preview = composeTechnicalScope(input);
    expect(errors(input)).toEqual([]);
    expect(preview.procedures).toEqual([]);
    expect(preview.generatedText).toContain('3 × Embalagem de óleo de 20 L');
    expect(preview.generatedText).not.toMatch(
      /60 L|capacidade|abastecimento|substituição/i,
    );
  });
  it('3. troca contratada de óleo e filtros inclui somente procedimentos correspondentes', () => {
    const input = setup([
      { key: 'oil', family: 'OIL' },
      { key: 'filter', family: 'OIL_FILTER' },
      service('REPLACEMENT'),
    ]);
    const codes = composeTechnicalScope(input).procedures.map(
      (row) => row.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'MAT-OIL-REPLACEMENT',
        'MAT-OIL-FILTER-REPLACEMENT',
      ]),
    );
    expect(codes.some((code) => code.includes('TEST'))).toBe(false);
  });
  it('4. horas sem finalidade geram pendência interna impeditiva, sem texto genérico público', () => {
    const input = setup([
      {
        key: 'hours',
        kind: 'HOURLY',
        hours: 4,
        description: 'Serviço por hora',
      },
    ]);
    const preview = composeTechnicalScope(input);
    expect(preview.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SERVICE_PURPOSE_REQUIRED',
          severity: 'error',
        }),
      ]),
    );
    expect(preview.generatedText).not.toMatch(
      /Serviço comercial|Detalhamento técnico|serviço por hora/i,
    );
    const review = reviewProposal({
      clientId: 'client',
      sellerId: 'seller',
      items: [
        { kind: 'HOURLY_SERVICE', hours: 4, quantity: 1, unitPrice: 100 },
      ],
      scopeSnapshot: preview,
    });
    expect(review.blocks('draft')).toEqual([]);
    expect(
      review
        .blocks('approve')
        .some((row) => row.code === 'SCOPE_SERVICE_PURPOSE_REQUIRED'),
    ).toBe(true);
  });
  it('5. horas com procedimento explícito mantêm as horas e a rastreabilidade', () => {
    const input = setup([
      {
        key: 'hours',
        kind: 'HOURLY',
        hours: 2.5,
        description: 'Serviço por hora',
      },
    ]);
    input.items = classifyScopeItems(input.items, [
      { sourceKey: 'hours', procedureCodes: ['SERV-TEST-NO-LOAD'] },
    ]);
    const preview = composeTechnicalScope(input);
    expect(errors(input)).toEqual([]);
    expect(preview.generatedText).toContain('2.5 h contratadas');
    expect(preview.procedures[0].sourceKeys).toEqual(['hours']);
    expect(preview.procedures.map((row) => row.code)).toEqual([
      'SERV-TEST-NO-LOAD',
    ]);
  });
  it('6. inspeção preventiva sem material omite a seção de fornecimento', () => {
    const preview = composeTechnicalScope(
      setup([service('MECHANICAL_INSPECTION')]),
    );
    expect(preview.procedures.length).toBeGreaterThan(0);
    expect(preview.sections.some((row) => row.id === 'SUPPLY')).toBe(false);
    expect(preview.generatedText).not.toMatch(
      /Fornecimento de|Serviços a detalhar/,
    );
  });
  it('7. substituição de bateria mantém condições próprias sem presumir tensão', () => {
    const preview = composeTechnicalScope(
      setup([{ key: 'battery', family: 'BATTERY' }, service('REPLACEMENT')]),
    );
    expect(
      preview.procedures.some((row) => row.code === 'MAT-BATTERY-REPLACEMENT'),
    ).toBe(true);
    expect(
      preview.operationalConditions.every((row) => row.status === 'PENDING'),
    ).toBe(true);
    expect(preview.generatedText).not.toMatch(/12V|24V/);
  });
  it('8. instalação de pré-aquecedor não acrescenta testes de carga', () => {
    const preview = composeTechnicalScope(
      setup([
        { key: 'preheater', family: 'PREHEATER' },
        service('INSTALLATION'),
      ]),
    );
    expect(
      preview.procedures.some((row) => row.code.includes('PREHEATER')),
    ).toBe(true);
    expect(preview.procedures.some((row) => row.code.includes('TEST'))).toBe(
      false,
    );
  });
  it('9. teste sem carga não contrata ensaio com carga', () => {
    const input = setup([{ key: 'hours', kind: 'HOURLY', hours: 1 }]);
    input.items = classifyScopeItems(input.items, [
      { sourceKey: 'hours', procedureCodes: ['SERV-TEST-NO-LOAD'] },
    ]);
    expect(
      composeTechnicalScope(input).operationalConditions.some((row) =>
        row.code.startsWith('CLIENT_OPERATIONAL_AUTHORIZATION'),
      ),
    ).toBe(false);
  });
  it('10. teste com carga permanece condicionado à autorização, mesmo selecionado explicitamente', () => {
    const input = setup([{ key: 'hours', kind: 'HOURLY', hours: 1 }]);
    const code = DEFAULT_SCOPE_PROCEDURES.find(
      (row) => row.definitionJson.loadMode === 'INSTALLATION',
    )!.code;
    input.items = classifyScopeItems(input.items, [
      { sourceKey: 'hours', procedureCodes: [code] },
    ]);
    const preview = composeTechnicalScope(input);
    expect(
      preview.operationalConditions.some(
        (row) =>
          row.code.startsWith('CLIENT_OPERATIONAL_AUTHORIZATION') &&
          row.status === 'PENDING',
      ),
    ).toBe(true);
    expect(preview.generatedText).toContain('autorização prévia');
  });
  it('11. procedimentos compartilhados não duplicam atividades e preservam quantidades dos serviços', () => {
    const input = setup([
      service('MECHANICAL_INSPECTION', 's1', 2),
      service('MECHANICAL_INSPECTION', 's2', 3),
      { key: 'm1', family: 'OIL_FILTER', quantity: 2 },
      { key: 'm2', family: 'OIL_FILTER', quantity: 4 },
    ]);
    const preview = composeTechnicalScope(input),
      activities = preview.sections.flatMap((row) => row.activities);
    expect(activities.filter((row) => row.id === 'PREP-SAFETY')).toHaveLength(
      1,
    );
    expect(
      preview.sections
        .find((row) => row.id === 'SERVICES')
        ?.activities.map((row) => row.text),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^2 ×/),
        expect.stringMatching(/^3 ×/),
      ]),
    );
    expect(
      preview.sections.find((row) => row.id === 'SUPPLY')?.activities,
    ).toHaveLength(2);
  });
  it('12. mudar finalidade após revisar invalida o hash sem alterar o objeto anterior', () => {
    const input = setup([{ key: 'hours', kind: 'HOURLY', hours: 1 }]);
    input.items = classifyScopeItems(input.items, [
      { sourceKey: 'hours', procedureCodes: ['SERV-TEST-NO-LOAD'] },
    ]);
    const saved = composeTechnicalScope(input),
      before = JSON.stringify(saved);
    const changed = {
      ...input,
      items: classifyScopeItems(input.items, [
        {
          sourceKey: 'hours',
          manualDescription:
            'Inspecionar o painel de comando e registrar as conexões e os sinais identificados durante o diagnóstico.',
        },
      ]),
    };
    expect(technicalScopeSourceHash(changed)).not.toBe(saved.sourceHash);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('13. biblioteca posterior não altera texto ou definições do snapshot anterior', () => {
    const input = setup([service('MECHANICAL_INSPECTION')]);
    const saved = structuredClone(composeTechnicalScope(input)),
      before = JSON.stringify(saved);
    input.procedures[0].definitionJson.activities[0].text =
      'Alteração posterior';
    expect(JSON.stringify(saved)).toBe(before);
    expect(composeTechnicalScope(input).libraryHash).not.toBe(
      saved.libraryHash,
    );
  });
  it('14. notas internas não são fonte de conteúdo técnico público', () => {
    const input = setup([
      { key: 'filtro', family: 'OIL_FILTER' },
    ]) as EngineInput & { internalNotes: string };
    input.internalNotes = 'INTERNAL_REFINE_CANARY';
    expect(composeTechnicalScope(input).generatedText).not.toContain(
      input.internalNotes,
    );
  });
  it('15. o caminho de contratos mantém a estrutura legada e não exige a classificação nova', () => {
    const input = setup([{ key: 'hour', kind: 'HOURLY', hours: 1 }]);
    input.proposalType = 'CONTRACT';
    const preview = composeTechnicalScope(input);
    expect(preview.sections.some((row) => row.id === 'OBJECTIVE')).toBe(true);
    expect(errors(input)).toEqual([]);
  });
  it('descrição manual precisa de finalidade/execução suficiente, sem frases de preenchimento', () => {
    expect(sufficientManualService('Serviço por hora.')).toBe(false);
    expect(
      sufficientManualService(
        'Detalhamento técnico sujeito à validação. Complementar posteriormente os detalhes do atendimento.',
      ),
    ).toBe(false);
    const input = setup([{ key: 'manual', kind: 'HOURLY', hours: 2 }]);
    input.items = classifyScopeItems(input.items, [
      {
        sourceKey: 'manual',
        manualDescription:
          'Inspecionar o painel de comando e registrar as conexões e os sinais identificados durante o diagnóstico.',
      },
    ]);
    expect(errors(input)).toEqual([]);
    expect(composeTechnicalScope(input).generatedText).toContain(
      'Inspecionar o painel',
    );
  });
  it('classificação de serviço não pode ser aplicada a um material', () => {
    const item: ScopeSourceItem = {
      key: 'part',
      kind: 'MATERIAL',
      description: 'Filtro',
      quantity: 1,
    };
    expect(() =>
      classifyScopeItems(
        [item],
        [{ sourceKey: 'part', procedureCodes: ['SERV-TEST-NO-LOAD'] }],
      ),
    ).toThrow('somente um serviço');
  });
  it('procedimento explícito substitui o vínculo genérico sem contratar intervenções adicionais', () => {
    const input = setup([service('PREVENTIVE'), { key: 'oil', family: 'OIL' }]);
    input.items = classifyScopeItems(input.items, [
      { sourceKey: 'labor', procedureCodes: ['SERV-TEST-NO-LOAD'] },
    ]);
    expect(
      composeTechnicalScope(input).procedures.map((row) => row.code),
    ).toEqual(['SERV-TEST-NO-LOAD']);
  });
});
