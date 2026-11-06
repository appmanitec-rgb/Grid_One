import {
  composeTechnicalScope,
  technicalScopeSourceHash,
} from './technical-scope.engine';
import {
  DEFAULT_SCOPE_FAMILIES,
  DEFAULT_SCOPE_PROCEDURES,
} from './technical-scope.defaults';
import type {
  EngineInput,
  ScopeProcedure,
  ScopeSourceItem,
} from './technical-scope.types';

type Entry = {
  key: string;
  family: string;
  kind?: string;
  quantity?: number;
  description?: string;
  catalogItemId?: string;
};
function scenario(entries: Entry[]): EngineInput {
  return {
    proposalType: 'PARTS_SERVICES',
    equipment: {
      id: 'generator-1',
      clientId: 'client-1',
      name: 'Grupo gerador do cliente',
      brand: 'Fabricante cadastrado',
      voltage: '220/127V',
    },
    items: entries.map(
      (entry): ScopeSourceItem => ({
        key: entry.key,
        kind:
          entry.kind ||
          ([
            'OIL',
            'OIL_FILTER',
            'FUEL_FILTER',
            'WATER_SEPARATOR',
            'AIR_FILTER',
            'BATTERY',
            'PREHEATER',
            'BELT',
            'SENSOR',
            'COOLANT',
            'HOSE',
            'COMPONENT',
          ].includes(entry.family)
            ? 'MATERIAL'
            : 'SERVICE'),
        catalogItemId: entry.catalogItemId || entry.key + '-catalog',
        description: entry.description || entry.family,
        quantity: entry.quantity ?? 1,
      }),
    ),
    families: structuredClone(DEFAULT_SCOPE_FAMILIES),
    procedures: structuredClone(DEFAULT_SCOPE_PROCEDURES),
    profiles: entries.map((entry) => ({
      catalogItemId: entry.catalogItemId || entry.key + '-catalog',
      familyCodes: [entry.family],
      procedureCodes: [],
      includedProcedureCodes: [],
      version: 1,
      isActive: true,
    })),
  };
}
function codes(input: EngineInput) {
  return composeTechnicalScope(input).procedures.map(
    (procedure) => procedure.code,
  );
}
function allActivities(input: EngineInput) {
  return composeTechnicalScope(input).sections.flatMap(
    (section) => section.activities,
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe('motor determinístico de escopo técnico', () => {
  it('cenário 1: filtro de ar e mão de obra geram apenas intervenções pertinentes', () => {
    const input = scenario([
      { key: 'air', family: 'AIR_FILTER' },
      { key: 'labor', family: 'REPLACEMENT' },
    ]);
    expect(codes(input)).toEqual([
      'MAT-AIR-FILTER-REPLACEMENT',
      'SERV-REPLACEMENT',
    ]);
    expect(composeTechnicalScope(input).generatedText).not.toContain(
      'filtro de combustível',
    );
    expect(codes(input)).not.toContain('SERV-TEST-NO-LOAD');
  });
  it('cenário 2: óleo e filtro com serviço mantêm quantidades e compartilham verificações', () => {
    const input = scenario([
      {
        key: 'oil',
        family: 'OIL',
        quantity: 18,
        description: 'Óleo lubrificante',
      },
      { key: 'filter', family: 'OIL_FILTER', quantity: 2 },
      { key: 'labor', family: 'REPLACEMENT' },
    ]);
    const output = composeTechnicalScope(input);
    expect(output.procedures.map((procedure) => procedure.code)).toEqual([
      'MAT-OIL-FILTER-REPLACEMENT',
      'MAT-OIL-REPLACEMENT',
      'SERV-REPLACEMENT',
    ]);
    expect(
      output.sources.map((source) => [source.key, source.quantity]),
    ).toEqual([
      ['filter', 2],
      ['labor', 1],
      ['oil', 18],
    ]);
    expect(output.generatedText).toContain('18 × Óleo lubrificante');
    const leaks = output.sections
      .flatMap((section) => section.activities)
      .filter((activity) => activity.id === 'VERIFY-INTERVENTION-LEAKS');
    expect(leaks).toHaveLength(1);
    expect(leaks[0].procedureCodes).toEqual([
      'MAT-OIL-FILTER-REPLACEMENT',
      'MAT-OIL-REPLACEMENT',
    ]);
    expect(leaks[0].sourceKeys).toEqual(['filter', 'labor', 'oil']);
  });
  it('cenário 3: inspeções independem de materiais e não incluem trocas ou testes', () => {
    const input = scenario([
      { key: 'visual', family: 'VISUAL_INSPECTION' },
      { key: 'electrical', family: 'ELECTRICAL_INSPECTION' },
      { key: 'mechanical', family: 'MECHANICAL_INSPECTION' },
    ]);
    const output = composeTechnicalScope(input);
    expect(output.procedures.map((procedure) => procedure.code)).toEqual([
      'SERV-INS-ELET',
      'SERV-INS-MEC',
      'SERV-INS-VISUAL',
    ]);
    expect(
      output.sections.some(
        (section) =>
          section.id === 'SUPPLY' ||
          section.id === 'TESTS' ||
          section.id === 'INTERVENTIONS',
      ),
    ).toBe(false);
    expect(output.generatedText).not.toMatch(
      /substituição|troca de|teste operacional com carga/i,
    );
  });
  it('cenário 4: inspeção elétrica e teste sem carga não ativam carga, banco ou transferência', () => {
    const input = scenario([
      { key: 'electrical', family: 'ELECTRICAL_INSPECTION' },
      { key: 'test', family: 'NO_LOAD_TEST' },
    ]);
    expect(codes(input)).toEqual(['SERV-INS-ELET', 'SERV-TEST-NO-LOAD']);
    expect(composeTechnicalScope(input).generatedText).toContain(
      'sem aplicação de carga elétrica externa',
    );
    expect(codes(input)).not.toContain('SERV-TEST-TRANSFER');
    expect(codes(input)).not.toContain('SERV-TEST-LOAD-BANK');
  });
  it('cenário 5: teste com carga contratado permanece pendente e não autoriza operação', () => {
    const input = scenario([{ key: 'load', family: 'LOAD_TEST' }]);
    input.equipment!.loadAuthorized = true;
    const output = composeTechnicalScope(input);
    expect(output.procedures.map((procedure) => procedure.code)).toEqual([
      'SERV-TEST-LOAD',
    ]);
    expect(output.operationalConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CLIENT_OPERATIONAL_AUTHORIZATION:SERV-TEST-LOAD',
          status: 'PENDING',
          sourceKeys: ['load'],
        }),
      ]),
    );
    expect(
      output.alerts.some(
        (alert) => alert.code === 'OPERATIONAL_AUTHORIZATION_PENDING',
      ),
    ).toBe(true);
    expect(output.generatedText).toContain('autorização prévia');
    expect(output.generatedText).not.toMatch(
      /\d+%|transferência|fornecimento de banco de cargas/i,
    );
    expect(
      output.procedures.some(
        (procedure) => procedure.code === 'SERV-TEST-LOAD-BANK',
      ),
    ).toBe(false);
  });
  it('cenário 6: bateria e pré-aquecedor têm procedimentos e pré-requisitos próprios', () => {
    const output = composeTechnicalScope(
      scenario([
        { key: 'battery', family: 'BATTERY' },
        { key: 'preheater', family: 'PREHEATER' },
        { key: 'labor', family: 'REPLACEMENT' },
      ]),
    );
    expect(output.procedures.map((procedure) => procedure.code)).toEqual([
      'MAT-BATTERY-REPLACEMENT',
      'MAT-PREHEATER-REPLACEMENT',
      'SERV-REPLACEMENT',
    ]);
    expect(output.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining([
        'BATTERY_COMPATIBILITY_AND_SAFETY',
        'PREHEATER_COMPATIBILITY_AND_SAFETY',
      ]),
    );
    expect(
      output.operationalConditions.every(
        (condition) => condition.status === 'PENDING',
      ),
    ).toBe(true);
    expect(output.generatedText).not.toMatch(/12V|24V|capacidade de/i);
  });
  it('cenário 7: venda isolada de produtos gera fornecimento sem prometer instalação ou troca', () => {
    const output = composeTechnicalScope(
      scenario([
        { key: 'oil', family: 'OIL', quantity: 18 },
        { key: 'battery', family: 'BATTERY' },
      ]),
    );
    expect(output.procedures).toEqual([]);
    expect(output.sections.map((section) => section.id)).toEqual(['SUPPLY']);
    expect(
      output.sections.find((section) => section.id === 'SUPPLY')!.activities,
    ).toHaveLength(2);
    expect(output.generatedText).not.toMatch(/instalação|substituição|teste/i);
    expect(output.sources).toHaveLength(2);
  });
  it('cenário 8: serviços e materiais mistos preservam todas as origens e atividades comuns únicas', () => {
    const input = scenario([
      { key: 'oil', family: 'OIL' },
      { key: 'filter', family: 'FUEL_FILTER' },
      { key: 'labor', family: 'REPLACEMENT' },
      { key: 'inspection', family: 'MECHANICAL_INSPECTION' },
      { key: 'test', family: 'NO_LOAD_TEST' },
    ]);
    const output = composeTechnicalScope(input);
    expect(output.sources.map((source) => source.key)).toEqual([
      'filter',
      'inspection',
      'labor',
      'oil',
      'test',
    ]);
    const safety = output.sections
      .flatMap((section) => section.activities)
      .filter((activity) => activity.id === 'PREP-SAFETY');
    expect(safety).toHaveLength(1);
    expect(safety[0].sourceKeys).toEqual([
      'filter',
      'inspection',
      'labor',
      'oil',
      'test',
    ]);
    expect(
      output.sections.every((section) => section.activities.length > 0),
    ).toBe(true);
  });
  it('cenário 9: alteração comercial muda hash sem sobrescrever texto e snapshot anteriores', () => {
    const input = scenario([{ key: 'oil', family: 'OIL', quantity: 18 }]);
    const saved = freeze({
      preview: composeTechnicalScope(input),
      manualText: 'Texto autorizado e personalizado pelo responsável.',
    });
    const original = JSON.stringify(saved);
    input.items[0].quantity = 20;
    expect(technicalScopeSourceHash(input)).not.toBe(saved.preview.sourceHash);
    expect(composeTechnicalScope(input).sourceHash).not.toBe(
      saved.preview.sourceHash,
    );
    expect(JSON.stringify(saved)).toBe(original);
    expect(saved.manualText).toBe(
      'Texto autorizado e personalizado pelo responsável.',
    );
  });
  it('cenário 10: desconhecidos e incompatíveis alertam sem inferir procedimentos pelo nome', () => {
    const input = scenario([
      {
        key: 'known-name',
        family: 'AIR_FILTER',
        description: 'Troca de filtro e óleo',
      },
      { key: 'battery', family: 'BATTERY' },
      { key: 'labor', family: 'REPLACEMENT' },
    ]);
    input.profiles = input.profiles.filter(
      (profile) => profile.catalogItemId !== 'known-name-catalog',
    );
    input.profiles.find(
      (profile) => profile.catalogItemId === 'battery-catalog',
    )!.compatibility = { voltage: ['24V'] };
    const output = composeTechnicalScope(input);
    expect(output.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining(['UNMAPPED_ITEM', 'INCOMPATIBLE_ITEM']),
    );
    expect(output.procedures).toEqual([]);
    expect(output.sources).toHaveLength(3);
    expect(output.generatedText).toContain('Troca de filtro e óleo');
  });
  it('cenário 11: pacote e serviço individual compartilham procedimento sem apagar linha comercial', () => {
    const input = scenario([
      { key: 'package', family: 'PREVENTIVE' },
      { key: 'individual', family: 'ELECTRICAL_INSPECTION' },
    ]);
    input.profiles.find(
      (profile) => profile.catalogItemId === 'package-catalog',
    )!.includedProcedureCodes = ['SERV-INS-ELET'];
    const output = composeTechnicalScope(input);
    expect(
      output.procedures.filter(
        (procedure) => procedure.code === 'SERV-INS-ELET',
      ),
    ).toEqual([
      expect.objectContaining({ sourceKeys: ['individual', 'package'] }),
    ]);
    expect(output.sources).toHaveLength(2);
    expect(output.sources.map((source) => source.quantity)).toEqual([1, 1]);
    expect(
      output.sections
        .flatMap((section) => section.activities)
        .filter((activity) => activity.id === 'INS-ELECTRICAL-CONNECTIONS'),
    ).toHaveLength(1);
  });
  it('cenário 12: regenerações idênticas mantêm texto, hashes e IDs estáveis sem mutar a entrada', () => {
    const input = freeze(
      scenario([
        { key: 'oil', family: 'OIL' },
        { key: 'labor', family: 'REPLACEMENT' },
        { key: 'test', family: 'NO_LOAD_TEST' },
      ]),
    );
    const first = composeTechnicalScope(input);
    expect(composeTechnicalScope(input)).toEqual(first);
    const reordered = {
      ...input,
      items: [...input.items].reverse(),
      families: [...input.families].reverse(),
      procedures: [...input.procedures].reverse(),
      profiles: [...input.profiles].reverse(),
    };
    expect(composeTechnicalScope(reordered)).toEqual(first);
    expect(first.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.libraryHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('inspeção isolada não autoriza troca de material presente na mesma proposta', () => {
    const input = scenario([
      { key: 'battery', family: 'BATTERY' },
      { key: 'inspection', family: 'VISUAL_INSPECTION' },
    ]);
    expect(codes(input)).toEqual(['SERV-INS-VISUAL']);
    expect(composeTechnicalScope(input).generatedText).not.toContain(
      'Substituição da bateria',
    );
  });
  it('linhas comerciais repetidas mantêm quantidades separadas e procedimento consolidado', () => {
    const input = scenario([
      {
        key: 'battery-a',
        catalogItemId: 'same-battery',
        family: 'BATTERY',
        quantity: 1,
      },
      {
        key: 'battery-b',
        catalogItemId: 'same-battery',
        family: 'BATTERY',
        quantity: 2,
      },
      { key: 'labor', family: 'REPLACEMENT' },
    ]);
    const output = composeTechnicalScope(input);
    expect(output.sources.map((source) => source.quantity)).toEqual([1, 2, 1]);
    expect(
      output.sections.find((section) => section.id === 'SUPPLY')!.activities,
    ).toHaveLength(2);
    expect(
      output.procedures.filter(
        (procedure) => procedure.code === 'MAT-BATTERY-REPLACEMENT',
      ),
    ).toEqual([
      expect.objectContaining({
        sourceKeys: ['battery-a', 'battery-b', 'labor'],
      }),
    ]);
  });
  it('nova categoria declarativa funciona sem mudança no código e dependência não adiciona serviços', () => {
    const input = scenario([{ key: 'custom', family: 'DIAGNOSIS' }]);
    const custom: ScopeProcedure = {
      code: 'CUSTOM-VIBRATION',
      name: 'Avaliação contratada',
      version: 3,
      definitionJson: {
        trigger: 'SERVICE',
        category: 'NOVA_CATEGORIA',
        section: { id: 'CUSTOM', title: 'Avaliação específica', order: 25 },
        activities: [
          {
            id: 'CUSTOM-ACTIVITY',
            text: 'Avaliação dos pontos expressamente contratados.',
          },
        ],
        dependsOnCodes: ['SERV-TEST-LOAD'],
        requirements: [
          {
            code: 'CUSTOM-VALIDATION',
            condition: 'COMMERCIAL_DEPENDENCY',
            message: 'Validar o recurso adicional antes da execução.',
          },
        ],
      },
    };
    input.procedures.push(custom);
    input.profiles[0].familyCodes = [];
    input.profiles[0].procedureCodes = ['CUSTOM-VIBRATION'];
    const output = composeTechnicalScope(input);
    expect(output.procedures).toEqual([
      expect.objectContaining({ code: 'CUSTOM-VIBRATION', version: 3 }),
    ]);
    expect(output.sections.some((section) => section.id === 'CUSTOM')).toBe(
      true,
    );
    expect(
      output.alerts.some((alert) => alert.code === 'COMMERCIAL_DEPENDENCY'),
    ).toBe(true);
    expect(
      output.procedures.some(
        (procedure) => procedure.code === 'SERV-TEST-LOAD',
      ),
    ).toBe(false);
  });
  it('banco de cargas entra somente com vínculo ou inclusão expressa e permanece condicionado', () => {
    const input = scenario([{ key: 'package', family: 'PREVENTIVE' }]);
    expect(codes(input)).not.toContain('SERV-TEST-LOAD-BANK');
    input.profiles[0].includedProcedureCodes = ['SERV-TEST-LOAD-BANK'];
    const output = composeTechnicalScope(input);
    expect(output.procedures.map((procedure) => procedure.code)).toEqual([
      'SERV-PREVENTIVE',
      'SERV-TEST-LOAD-BANK',
    ]);
    expect(
      output.operationalConditions.every(
        (condition) => condition.status === 'PENDING',
      ),
    ).toBe(true);
    expect(output.generatedText).toContain(
      'O fornecimento do banco de cargas não é presumido',
    );
    expect(output.generatedText).not.toMatch(/\d+%/);
  });
  it('pacote não inventa material exigido por procedimento de substituição', () => {
    const input = scenario([{ key: 'package', family: 'PREVENTIVE' }]);
    input.profiles[0].includedProcedureCodes = ['MAT-BATTERY-REPLACEMENT'];
    const output = composeTechnicalScope(input);
    expect(
      output.procedures.some(
        (procedure) => procedure.code === 'MAT-BATTERY-REPLACEMENT',
      ),
    ).toBe(false);
    expect(
      output.alerts.some((alert) => alert.code === 'MATERIAL_NOT_CONTRACTED'),
    ).toBe(true);
    expect(output.sources).toHaveLength(1);
    expect(output.sections.some((section) => section.id === 'SUPPLY')).toBe(
      false,
    );
  });
  it('IDs técnicos distintos não são fundidos apenas por semelhança textual', () => {
    const input = scenario([{ key: 'custom', family: 'DIAGNOSIS' }]);
    const base: ScopeProcedure = {
      code: 'SIMILAR',
      name: 'Procedimento',
      definitionJson: {
        section: { id: 'CUSTOM', title: 'Avaliações' },
        activities: [
          { id: 'ID-A', text: 'Verificação visual contratada.' },
          { id: 'ID-B', text: 'Verificação visual contratada.' },
        ],
      },
    };
    input.procedures.push(base);
    input.profiles[0].familyCodes = [];
    input.profiles[0].procedureCodes = ['SIMILAR'];
    const activityIds = allActivities(input).map((activity) => activity.id);
    expect(activityIds).toEqual(expect.arrayContaining(['ID-A', 'ID-B']));
  });
  it('regras incompatíveis, inativas ou ausentes geram alertas em vez de atividade presumida', () => {
    const input = scenario([
      { key: 'electrical', family: 'ELECTRICAL_INSPECTION' },
    ]);
    input.equipment!.fuelType = 'GAS';
    input.procedures.find(
      (procedure) => procedure.code === 'SERV-INS-ELET',
    )!.definitionJson.compatibleEquipment = { fuelType: ['DIESEL'] };
    input.profiles[0].procedureCodes = ['DOES-NOT-EXIST'];
    const output = composeTechnicalScope(input);
    expect(output.procedures).toEqual([]);
    expect(output.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining(['INCOMPATIBLE_PROCEDURE', 'UNKNOWN_PROCEDURE']),
    );
  });
  it('alteração de biblioteca muda libraryHash mas não sourceHash nem snapshot antigo', () => {
    const input = scenario([
      { key: 'inspection', family: 'VISUAL_INSPECTION' },
    ]);
    const previous = freeze(composeTechnicalScope(input));
    input.procedures.find(
      (procedure) => procedure.code === 'SERV-INS-VISUAL',
    )!.version = 2;
    const current = composeTechnicalScope(input);
    expect(current.libraryHash).not.toBe(previous.libraryHash);
    expect(current.sourceHash).toBe(previous.sourceHash);
    expect(previous.procedures[0].version).toBe(1);
    expect(current.procedures[0].version).toBe(2);
  });
  it('hash detecta troca de cliente ou modelo sem aceitar custos no contexto técnico', () => {
    const input = scenario([{ key: 'oil', family: 'OIL' }]);
    const original = technicalScopeSourceHash(input);
    input.equipment!.costPrice = 100000;
    expect(technicalScopeSourceHash(input)).toBe(original);
    input.equipment!.clientId = 'other-client';
    expect(technicalScopeSourceHash(input)).not.toBe(original);
    expect(JSON.stringify(composeTechnicalScope(input))).not.toContain(
      'costPrice',
    );
  });
});
