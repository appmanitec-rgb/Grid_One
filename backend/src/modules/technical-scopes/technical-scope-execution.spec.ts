import {
  buildOrderTechnicalScopeChecklist,
  preserveOrderTechnicalScope,
  recordTechnicalScopeAuthorization,
  renderScopeWithConditions,
} from './technical-scope-execution';

const snapshot = {
  sourceHash: 'frozen-hash',
  version: 3,
  operationalConditions: [
    {
      code: 'AUTH_LOAD',
      text: 'Teste mediante autorização do responsável.',
      status: 'INCLUDED',
      procedureCodes: ['LOAD'],
    },
  ],
  definitionSnapshot: {
    procedures: [
      { code: 'LOAD', definitionJson: { loadMode: 'INSTALLATION' } },
    ],
  },
};
const checklist = () =>
  buildOrderTechnicalScopeChecklist({
    proposalId: 'proposal',
    scope: 'Texto revisado',
    snapshot,
  })!;
const input = {
  conditionCode: 'AUTH_LOAD',
  status: 'AUTHORIZED' as const,
  responsibleName: 'Responsável no local',
  loadMode: 'INSTALLATION' as const,
  recordedByUserId: 'actor',
  recordedAt: '2026-10-23T12:00:00.000Z',
};

describe('escopo contratado e execução', () => {
  it('copia a versão aprovada sem transformar contratação em autorização', () => {
    const result = checklist();
    expect(result.technicalScope.version).toBe(3);
    expect(result.technicalScope.operationalConditions[0].status).toBe(
      'PENDING',
    );
    expect(result.technicalScopeAuthorizations.AUTH_LOAD.status).toBe(
      'PENDING',
    );
    expect(snapshot.operationalConditions[0].status).toBe('INCLUDED');
  });
  it('mantém condições no documento mesmo após edição manual sem duplicá-las', () => {
    const text = renderScopeWithConditions('Texto manual', snapshot);
    expect(text).toContain(snapshot.operationalConditions[0].text);
    expect(renderScopeWithConditions(text, snapshot)).toBe(text);
  });
  it('preserva autorizações e snapshot ao editar checklist e rejeita campos forjados na criação', () => {
    const current = checklist();
    const result = preserveOrderTechnicalScope(current, {
      checked: true,
      technicalScope: {},
      technicalScopeAuthorizations: { AUTH_LOAD: { status: 'AUTHORIZED' } },
    });
    expect(result.technicalScope).toEqual(current.technicalScope);
    expect(result.technicalScopeAuthorizations.AUTH_LOAD.status).toBe(
      'PENDING',
    );
    expect(preserveOrderTechnicalScope(null, result)).toEqual({
      checked: true,
    });
  });
  it('registra autorização separadamente sem modificar o escopo ou proposta', () => {
    const current = checklist();
    const result = recordTechnicalScopeAuthorization(current, input);
    expect(result.technicalScope).toEqual(current.technicalScope);
    expect(result.technicalScopeAuthorizations.AUTH_LOAD.status).toBe(
      'AUTHORIZED',
    );
    expect(current.technicalScopeAuthorizations.AUTH_LOAD.status).toBe(
      'PENDING',
    );
  });
  it('registra recusa com motivo e preserva a versão vendida', () => {
    const result = recordTechnicalScopeAuthorization(checklist(), {
      ...input,
      status: 'NOT_AUTHORIZED',
      note: 'Cliente não liberou a parada.',
    });
    expect(result.technicalScope.version).toBe(3);
    expect(result.technicalScopeAuthorizations.AUTH_LOAD.note).toContain(
      'não liberou',
    );
  });
  it('exige responsável e modalidade para autorizar e motivo para recusar', () => {
    expect(() =>
      recordTechnicalScopeAuthorization(checklist(), {
        ...input,
        responsibleName: '',
      }),
    ).toThrow();
    expect(() =>
      recordTechnicalScopeAuthorization(checklist(), {
        ...input,
        loadMode: undefined,
      }),
    ).toThrow();
    expect(() =>
      recordTechnicalScopeAuthorization(checklist(), {
        ...input,
        status: 'NOT_AUTHORIZED',
      }),
    ).toThrow();
  });
  it('não aceita banco de cargas não contratado nem condições inexistentes', () => {
    expect(() =>
      recordTechnicalScopeAuthorization(checklist(), {
        ...input,
        loadMode: 'LOAD_BANK',
      }),
    ).toThrow();
    expect(() =>
      recordTechnicalScopeAuthorization(checklist(), {
        ...input,
        conditionCode: 'UNSOLD',
      }),
    ).toThrow();
  });
  it('mantém documentos legados e ordens sem snapshot compatíveis', () => {
    expect(
      buildOrderTechnicalScopeChecklist({
        proposalId: 'old',
        scope: 'Legado',
        snapshot: null,
      }),
    ).toBeUndefined();
    expect(renderScopeWithConditions('Legado', null)).toBe('Legado');
  });
});
