import { classifyScopeItems } from './technical-service-classification';
import { composeTechnicalScope } from './technical-scope.engine';
import {
  resolveTechnicalScopeSource,
  type TechnicalScopeDatabase,
} from './technical-scope-resolution';
import type {
  ScopeServiceClassification,
  ScopeSourceItem,
} from './technical-scope.types';

const manual =
  'Inspecionar o painel de comando e registrar as conexões e os sinais encontrados durante o diagnóstico.';
function classification(item: ScopeSourceItem): ScopeServiceClassification {
  return {
    sourceKey: item.key,
    procedureCodes: item.technical?.procedureCodes,
    manualDescription: item.technical?.manualDescription,
    sourceFacts: item.technical?.sourceFacts,
  };
}
const base: ScopeSourceItem = {
  key: 'SERVICE:catalog:1',
  catalogItemId: 'catalog',
  kind: 'SERVICE',
  description: 'Serviço',
  quantity: 1,
};

describe('vínculo entre serviço, finalidade e quantidades', () => {
  it('classificação explícita não herda ensaios de um pacote anterior', () => {
    const items = classifyScopeItems(
      [base],
      [{ sourceKey: base.key, procedureCodes: ['SELECTED'] }],
    );
    const procedure = (code: string) => ({
      code,
      name: code,
      definitionJson: {
        section: { id: 'TESTS', title: 'Testes contratados' },
        activities: [
          {
            id: code,
            text: 'Verificar o funcionamento conforme o procedimento contratado.',
          },
        ],
      },
    });
    const preview = composeTechnicalScope({
      proposalType: 'PARTS_AND_SERVICES',
      items,
      families: [],
      procedures: [
        procedure('SELECTED'),
        {
          ...procedure('NOT_SELECTED'),
          definitionJson: {
            ...procedure('NOT_SELECTED').definitionJson,
            loadMode: 'LOAD_BANK',
          },
        },
      ],
      profiles: [
        {
          catalogItemId: 'catalog',
          familyCodes: [],
          includedProcedureCodes: ['NOT_SELECTED'],
        },
      ],
    });
    expect(preview.procedures.map((row) => row.code)).toEqual(['SELECTED']);
    expect(preview.operationalConditions).toEqual([]);
  });
  it('alteração de quantidade preserva descrição e exige confirmação antes de compor', () => {
    const original = classifyScopeItems(
      [base],
      [{ sourceKey: base.key, manualDescription: manual }],
    );
    const changed = classifyScopeItems(
      [{ ...base, quantity: 2 }],
      original.map(classification),
    );
    expect(changed[0].technical?.manualDescription).toBe(manual);
    expect(changed[0].technical?.stale).toBe(true);
    const preview = composeTechnicalScope({
      proposalType: 'PARTS_AND_SERVICES',
      items: changed,
      families: [],
      procedures: [],
      profiles: [],
    });
    expect(
      preview.alerts.some(
        (row) =>
          row.code === 'SERVICE_CLASSIFICATION_STALE' &&
          row.severity === 'error',
      ),
    ).toBe(true);
    expect(preview.generatedText).not.toContain(manual);
    const confirmed = classifyScopeItems(
      [{ ...base, quantity: 2 }],
      [{ sourceKey: base.key, manualDescription: manual }],
    );
    expect(confirmed[0].technical?.stale).toBe(false);
  });
  it('remover uma linha repetida não remapeia a finalidade silenciosamente', () => {
    const repeated = { ...base, key: 'SERVICE:catalog:2' };
    const original = classifyScopeItems(
      [base, repeated],
      [
        { sourceKey: base.key, manualDescription: manual },
        {
          sourceKey: repeated.key,
          manualDescription:
            'Verificar as conexões do controlador e registrar as medições obtidas nos circuitos de comando.',
        },
      ],
    );
    const reduced = classifyScopeItems([base], original.map(classification));
    expect(reduced[0].technical?.stale).toBe(true);
  });
  it('itens avulsos de serviço não contornam o mínimo técnico por usar kind OTHER', async () => {
    const db = {
      catalogItem: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as TechnicalScopeDatabase;
    const source = await resolveTechnicalScopeSource(db, {
      type: 'PARTS_AND_SERVICES',
      items: [{ kind: 'OTHER', quantity: 1, description: 'Serviço avulso' }],
    });
    expect(source.items[0].kind).toBe('SERVICE');
    const preview = composeTechnicalScope({
      ...source,
      families: [],
      procedures: [],
      profiles: [],
    });
    expect(
      preview.alerts.some(
        (row) =>
          row.code === 'SERVICE_PURPOSE_REQUIRED' && row.severity === 'error',
      ),
    ).toBe(true);
  });
});
