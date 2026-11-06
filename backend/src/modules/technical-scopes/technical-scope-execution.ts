import { BadRequestException } from '@nestjs/common';

type JsonRecord = Record<string, any>;
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

/** Conditions belong to the frozen sale; editing the text cannot grant authorization. */
export function renderScopeWithConditions(
  scope: string | null | undefined,
  snapshot: unknown,
): string {
  const text = scope || '';
  const conditions = record(snapshot).operationalConditions as
    | Array<{ text: string }>
    | undefined;
  const missing = (Array.isArray(conditions) ? conditions : [])
    .filter(
      (condition) =>
        typeof condition.text === 'string' && !text.includes(condition.text),
    )
    .map((condition) => '- ' + condition.text);
  return missing.length
    ? [text, 'Condições operacionais\n' + missing.join('\n')]
        .filter(Boolean)
        .join('\n\n')
    : text;
}

export function buildOrderTechnicalScopeChecklist(input: {
  proposalId: string;
  scope?: string | null;
  snapshot: unknown;
}): JsonRecord | undefined {
  const snapshot = record(input.snapshot);
  if (!snapshot.sourceHash) return undefined;
  const definitions = record(snapshot.definitionSnapshot);
  const procedures: Array<{
    code: string;
    definitionJson?: Record<string, unknown>;
  }> = Array.isArray(definitions.procedures) ? definitions.procedures : [];
  const conditions = (
    Array.isArray(snapshot.operationalConditions)
      ? snapshot.operationalConditions
      : []
  ).map(
    (condition: { code: string; text: string; procedureCodes?: string[] }) => ({
      ...condition,
      status: 'PENDING',
      allowedLoadModes: [
        ...new Set(
          procedures
            .filter((procedure) =>
              (condition.procedureCodes || []).includes(procedure.code),
            )
            .map((procedure) => record(procedure.definitionJson).loadMode)
            .filter(Boolean),
        ),
      ],
    }),
  );
  return {
    technicalScope: {
      sourceProposalId: input.proposalId,
      version: snapshot.version,
      sourceHash: snapshot.sourceHash,
      scopeText: renderScopeWithConditions(input.scope, snapshot),
      operationalConditions: conditions,
    },
    technicalScopeAuthorizations: Object.fromEntries(
      conditions.map((condition: JsonRecord) => [
        condition.code,
        { status: 'PENDING' },
      ]),
    ),
  };
}

/** Generic checklist writes cannot forge or remove the approved scope and execution records. */
export function preserveOrderTechnicalScope(
  current: unknown,
  requested: unknown,
): JsonRecord {
  const result = { ...record(requested) };
  for (const key of ['technicalScope', 'technicalScopeAuthorizations']) {
    delete result[key];
    if (Object.hasOwn(record(current), key)) result[key] = record(current)[key];
  }
  return result;
}

export type TechnicalAuthorizationInput = {
  conditionCode: string;
  status: 'PENDING' | 'AUTHORIZED' | 'NOT_AUTHORIZED';
  responsibleName?: string;
  note?: string;
  loadMode?: 'INSTALLATION' | 'LOAD_BANK';
  recordedByUserId: string;
  recordedAt: string;
};
export function recordTechnicalScopeAuthorization(
  checklist: unknown,
  input: TechnicalAuthorizationInput,
): JsonRecord {
  const current = record(checklist);
  const conditions = record(current.technicalScope).operationalConditions;
  const condition = Array.isArray(conditions)
    ? conditions.find((row: JsonRecord) => row.code === input.conditionCode)
    : undefined;
  if (!condition)
    throw new BadRequestException('Condição não prevista no escopo aprovado.');
  if (!['PENDING', 'AUTHORIZED', 'NOT_AUTHORIZED'].includes(input.status))
    throw new BadRequestException('Situação operacional inválida.');
  if (input.status === 'AUTHORIZED' && !input.responsibleName?.trim())
    throw new BadRequestException(
      'Informe o responsável que autorizou a execução.',
    );
  if (input.status === 'NOT_AUTHORIZED' && !input.note?.trim())
    throw new BadRequestException('Registre o motivo da não autorização.');
  const modes: string[] = condition.allowedLoadModes || [];
  if (input.loadMode && !modes.includes(input.loadMode))
    throw new BadRequestException(
      'Modalidade de carga não contratada para este procedimento.',
    );
  if (input.status === 'AUTHORIZED' && modes.length && !input.loadMode)
    throw new BadRequestException('Confirme a modalidade de carga contratada.');
  return {
    ...current,
    technicalScopeAuthorizations: {
      ...record(current.technicalScopeAuthorizations),
      [input.conditionCode]: {
        status: input.status,
        responsibleName: input.responsibleName?.trim() || null,
        note: input.note?.trim() || null,
        loadMode: input.loadMode || null,
        recordedByUserId: input.recordedByUserId,
        recordedAt: input.recordedAt,
      },
    },
  };
}
