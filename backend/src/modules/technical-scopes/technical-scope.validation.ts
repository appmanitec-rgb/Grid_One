import { BadRequestException } from '@nestjs/common';
import type {
  ScopeFamilyDefinition,
  ScopeProcedureDefinition,
  ScopeEquipmentCompatibility,
} from './technical-scope.types';

const CODE = /^[A-Z0-9][A-Z0-9_-]{0,79}$/;
function invalid(label: string): never {
  throw new BadRequestException('Definicao tecnica invalida: ' + label + '.');
}
export function technicalCode(value: string) {
  if (!CODE.test(value)) invalid('codigo');
  return value;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(label);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 4000): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && ![9, 10, 13].includes(code);
    })
  )
    invalid(label);
  return value.trim();
}
function optionalText(value: unknown, label: string, max = 4000) {
  return value === undefined ? undefined : text(value, label, max);
}
export function technicalCodes(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || !CODE.test(item))
  )
    invalid(label);
  return [...new Set(value as string[])].sort();
}
function bool(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') invalid(label);
  return value;
}
function list(value: unknown, label: string, max = 200): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) invalid(label);
  return value;
}
function limited(value: unknown) {
  if (JSON.stringify(value).length > 128 * 1024)
    invalid('tamanho maximo de 128 KB');
}
function section(value: unknown) {
  const row = object(value, 'secao');
  const order = row.order;
  if (
    order !== undefined &&
    (typeof order !== 'number' ||
      !Number.isInteger(order) ||
      Math.abs(order) > 10000)
  )
    invalid('ordem da secao');
  return {
    id: text(row.id, 'codigo da secao', 100),
    title: text(row.title, 'titulo da secao', 160),
    ...(order !== undefined ? { order: order } : {}),
  };
}
export function technicalCompatibility(
  value: unknown,
): ScopeEquipmentCompatibility | undefined {
  if (value === undefined || value === null) return undefined;
  const row = object(value, 'compatibilidade');
  if (Object.keys(row).length > 30) invalid('compatibilidade');
  const result: ScopeEquipmentCompatibility = {};
  for (const [key, values] of Object.entries(row)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key))
      invalid('campo de compatibilidade');
    result[key] = list(values, 'valores de compatibilidade', 100).map((item) =>
      text(item, 'valor de compatibilidade', 160),
    );
  }
  return result;
}
export function familyDefinition(
  value: unknown,
  kind: 'MATERIAL' | 'SERVICE',
): ScopeFamilyDefinition {
  const row = value === undefined ? {} : object(value, 'familia');
  limited(row);
  return {
    kind,
    ...(row.description !== undefined
      ? { description: optionalText(row.description, 'descricao') }
      : {}),
    procedureCodes: technicalCodes(
      row.procedureCodes,
      'procedimentos da familia',
    ),
  };
}
export function procedureDefinition(value: unknown): ScopeProcedureDefinition {
  const row = object(value, 'procedimento');
  limited(row);
  const activities = list(row.activities, 'atividades').map((value) => {
    const activity = object(value, 'atividade');
    return {
      id: text(activity.id, 'codigo da atividade', 100),
      text: text(activity.text, 'texto da atividade'),
      ...(activity.auxiliary !== undefined
        ? { auxiliary: bool(activity.auxiliary, 'atividade auxiliar') }
        : {}),
      ...(activity.section !== undefined
        ? { section: section(activity.section) }
        : {}),
    };
  });
  if (!activities.length) invalid('ao menos uma atividade');
  if (new Set(activities.map((item) => item.id)).size !== activities.length)
    invalid('atividades repetidas');
  const requirements = list(row.requirements, 'requisitos', 100).map(
    (value) => {
      const requirement = object(value, 'requisito');
      const severity = requirement.severity;
      const condition = requirement.condition;
      if (
        severity !== undefined &&
        (typeof severity !== 'string' ||
          !['warning', 'error', 'info'].includes(severity))
      )
        invalid('severidade');
      if (
        condition !== undefined &&
        (typeof condition !== 'string' ||
          ![
            'CLIENT_PENDING',
            'COMMERCIAL_DEPENDENCY',
            'SAFETY',
            'EQUIPMENT',
          ].includes(condition))
      )
        invalid('condicao');
      return {
        code: technicalCode(text(requirement.code, 'codigo do requisito', 80)),
        message: text(requirement.message, 'mensagem do requisito'),
        ...(severity !== undefined
          ? { severity: severity as 'warning' | 'error' | 'info' }
          : {}),
        ...(condition !== undefined
          ? {
              condition: condition as
                | 'CLIENT_PENDING'
                | 'COMMERCIAL_DEPENDENCY'
                | 'SAFETY'
                | 'EQUIPMENT',
            }
          : {}),
      };
    },
  );
  const operationalConditions = list(
    row.operationalConditions,
    'condicoes operacionais',
    100,
  ).map((value) => {
    const condition = object(value, 'condicao operacional');
    if (
      condition.status !== undefined &&
      (typeof condition.status !== 'string' ||
        !['PENDING', 'INCLUDED', 'EXCLUDED'].includes(condition.status))
    )
      invalid('estado da condicao');
    return {
      code: technicalCode(text(condition.code, 'codigo da condicao', 80)),
      text: text(condition.text, 'texto da condicao'),
      status: 'PENDING' as const,
    };
  });
  if (
    row.trigger !== undefined &&
    (typeof row.trigger !== 'string' ||
      !['MATERIAL', 'SERVICE'].includes(row.trigger))
  )
    invalid('gatilho');
  if (
    row.loadMode !== undefined &&
    (typeof row.loadMode !== 'string' ||
      !['INSTALLATION', 'LOAD_BANK'].includes(row.loadMode))
  )
    invalid('modo do teste');
  return {
    section: section(row.section),
    activities,
    dependsOnCodes: technicalCodes(row.dependsOnCodes, 'dependencias'),
    requiredServiceFamilyCodes: technicalCodes(
      row.requiredServiceFamilyCodes,
      'familias de servico',
    ),
    requiredMaterialFamilyCodes: technicalCodes(
      row.requiredMaterialFamilyCodes,
      'familias de material',
    ),
    requirements,
    operationalConditions,
    ...(row.description !== undefined
      ? { description: optionalText(row.description, 'descricao') }
      : {}),
    ...(row.category !== undefined
      ? { category: optionalText(row.category, 'categoria', 160) }
      : {}),
    ...(row.trigger !== undefined
      ? { trigger: row.trigger as 'MATERIAL' | 'SERVICE' }
      : {}),
    ...(row.loadMode !== undefined
      ? { loadMode: row.loadMode as 'INSTALLATION' | 'LOAD_BANK' }
      : {}),
    ...(row.requiresOperationalAuthorization !== undefined
      ? {
          requiresOperationalAuthorization: bool(
            row.requiresOperationalAuthorization,
            'autorizacao operacional',
          ),
        }
      : {}),
    ...(row.compatibleEquipment !== undefined
      ? { compatibleEquipment: technicalCompatibility(row.compatibleEquipment) }
      : {}),
  };
}
