import { createHash } from 'node:crypto';
import {
  isGenericTechnicalText,
  sufficientManualService,
} from './technical-service-classification';
import type {
  EngineInput,
  ScopeAlert,
  ScopeAppliedProcedure,
  ScopeCatalogProfile,
  ScopeEquipment,
  ScopeEquipmentCompatibility,
  ScopeOperationalCondition,
  ScopePreview,
  ScopeProcedure,
  ScopeSection,
  ScopeSource,
} from './technical-scope.types';

export const TECHNICAL_SCOPE_ENGINE_VERSION = '1.1.0';
const EQUIPMENT_FIELDS = new Set([
  'id',
  'clientId',
  'generatorId',
  'modelId',
  'name',
  'brand',
  'manufacturer',
  'model',
  'modelName',
  'engineModelName',
  'power',
  'powerKva',
  'voltage',
  'serialNumber',
  'fuelType',
  'controller',
  'equipmentType',
  'engineBrand',
  'engineType',
]);
const SERVICE_KINDS = new Set(['SERVICE', 'HOURLY', 'HOURS', 'LABOR']);
const MATERIAL_KINDS = new Set([
  'PRODUCT',
  'MATERIAL',
  'PART',
  'COMPONENT',
  'CATALOG',
]);
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
const unique = (values: string[]) => [...new Set(values)].sort();

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical(object[key]))
      .join(',') +
    '}'
  );
}
const hash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const byCanonical = <T>(values: T[]) =>
  [...values].sort((a, b) => canonical(a).localeCompare(canonical(b), 'en'));

function safeEquipment(equipment?: ScopeEquipment): ScopeEquipment {
  return Object.fromEntries(
    Object.entries(equipment || {}).filter(
      ([key, value]) =>
        EQUIPMENT_FIELDS.has(key) &&
        (value === null ||
          ['string', 'number', 'boolean'].includes(typeof value)),
    ),
  );
}

export function technicalScopeSourceHash(
  input: Pick<EngineInput, 'proposalType' | 'equipment' | 'items'>,
): string {
  return hash({
    proposalType: input.proposalType,
    equipment: safeEquipment(input.equipment),
    items: byCanonical(
      input.items.map((item) => ({
        key: item.key,
        kind: item.kind,
        catalogItemId: item.catalogItemId || null,
        description: item.description,
        quantity: item.quantity,
        ...(item.hours === undefined ? {} : { hours: item.hours }),
        ...(item.technical ? { technical: item.technical } : {}),
      })),
    ),
  });
}

function compatibility(
  rules: ScopeEquipmentCompatibility | undefined,
  equipment: ScopeEquipment,
): 'COMPATIBLE' | 'UNKNOWN' | 'INCOMPATIBLE' {
  let unknown = false;
  for (const [field, allowed] of Object.entries(rules || {})) {
    if (!Array.isArray(allowed) || !allowed.length) continue;
    const actual = equipment[field];
    if (actual === null || actual === undefined || actual === '') {
      unknown = true;
      continue;
    }
    if (!allowed.some((value) => fold(String(value)) === fold(String(actual))))
      return 'INCOMPATIBLE';
  }
  return unknown ? 'UNKNOWN' : 'COMPATIBLE';
}

type SourceContext = {
  source: ScopeSource;
  service: boolean;
  material: boolean;
  valid: boolean;
  compatible: boolean;
  profiles: ScopeCatalogProfile[];
};
type Candidate = {
  procedure: ScopeProcedure;
  sourceKeys: Set<string>;
  packageKeys: Set<string>;
};

/** Composes only explicitly mapped technical rules; commercial items are never mutated. */
export function composeTechnicalScope(input: EngineInput): ScopePreview {
  const professional = [
    'PARTS_AND_SERVICES',
    'PARTS_SERVICES',
    'PARTS',
    'SERVICES',
  ].includes(input.proposalType);
  const equipment = safeEquipment(input.equipment);
  const alerts: ScopeAlert[] = [];
  const alertKeys = new Set<string>();
  function alert(
    code: string,
    severity: ScopeAlert['severity'],
    message: string,
    sourceKeys: string[] = [],
  ) {
    const normalized = {
      code,
      severity,
      message,
      ...(sourceKeys.length ? { sourceKeys: unique(sourceKeys) } : {}),
    };
    const key = canonical(normalized);
    if (!alertKeys.has(key)) {
      alertKeys.add(key);
      alerts.push(normalized);
    }
  }
  const families = new Map(
    input.families
      .filter((family) => family.isActive !== false)
      .map((family) => [family.code, family]),
  );
  const library = new Map(
    input.procedures
      .filter((procedure) => procedure.isActive !== false)
      .map((procedure) => [procedure.code, procedure]),
  );
  const profiles = byCanonical(
    input.profiles.filter((profile) => profile.isActive !== false),
  );
  const sourceContexts: SourceContext[] = [...input.items]
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key, 'en') ||
        canonical(a).localeCompare(canonical(b), 'en'),
    )
    .map((item) => {
      const matching = item.catalogItemId
        ? profiles.filter(
            (profile) => profile.catalogItemId === item.catalogItemId,
          )
        : [];
      const familyCodes = unique(
        matching.flatMap((profile) => profile.familyCodes || []),
      );
      const serviceKind = SERVICE_KINDS.has(fold(item.kind));
      const materialKind = MATERIAL_KINDS.has(fold(item.kind));
      const service =
        serviceKind ||
        (!materialKind &&
          familyCodes.some(
            (code) => families.get(code)?.definitionJson.kind === 'SERVICE',
          ));
      const material =
        !service &&
        (materialKind ||
          familyCodes.some(
            (code) => families.get(code)?.definitionJson.kind === 'MATERIAL',
          ));
      const source: ScopeSource = {
        key: item.key,
        kind: item.kind,
        catalogItemId: item.catalogItemId || null,
        description: item.description,
        quantity: item.quantity,
        ...(item.hours === undefined ? {} : { hours: item.hours }),
        familyCodes,
        procedureCodes: [],
        ...(item.classificationFacts
          ? { classificationFacts: item.classificationFacts }
          : {}),
        ...(item.technical ? { technical: item.technical } : {}),
      };
      const valid =
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        (item.hours === undefined ||
          (Number.isFinite(item.hours) && item.hours >= 0));
      if (!valid)
        alert(
          'INVALID_QUANTITY',
          'error',
          'Quantidade ou horas inválidas; revise o item comercial antes de definir seu escopo.',
          [item.key],
        );
      if (
        !matching.length &&
        !service &&
        !item.technical?.procedureCodes?.length &&
        !sufficientManualService(item.technical?.manualDescription || '')
      )
        alert(
          service ? 'UNMAPPED_SERVICE' : 'UNMAPPED_ITEM',
          professional && service ? 'error' : 'warning',
          'Item sem classificação técnica: ' +
            item.description +
            (service
              ? '. Defina um procedimento ou descreva a finalidade e a execução na etapa Serviços.'
              : '. Confira os dados do material; isso não contrata mão de obra.'),
          [item.key],
        );
      for (const code of familyCodes)
        if (!families.has(code))
          alert(
            'UNKNOWN_FAMILY',
            'warning',
            'Família técnica ausente ou inativa: ' + code + '.',
            [item.key],
          );
      let compatible = true;
      for (const profile of matching) {
        const result = compatibility(profile.compatibility, equipment);
        if (result === 'INCOMPATIBLE') {
          compatible = false;
          alert(
            'INCOMPATIBLE_ITEM',
            'error',
            'O item ' +
              item.description +
              ' possui incompatibilidade cadastrada com este equipamento. Valide a aplicação antes de contratar a intervenção.',
            [item.key],
          );
        }
        if (result === 'UNKNOWN')
          alert(
            'EQUIPMENT_VALIDATION_REQUIRED',
            'warning',
            'Dados do equipamento insuficientes para confirmar a compatibilidade de ' +
              item.description +
              '.',
            [item.key],
          );
      }
      return {
        source,
        service,
        material,
        valid,
        compatible,
        profiles: matching,
      };
    });
  const contextsByKey = new Map(
    sourceContexts.map((context) => [context.source.key, context]),
  );
  const candidates = new Map<string, Candidate>();
  for (const context of sourceContexts) {
    if (
      !context.valid ||
      !context.compatible ||
      context.source.technical?.stale
    )
      continue;
    if (
      sufficientManualService(context.source.technical?.manualDescription || '')
    )
      continue;
    const codes = context.source.technical
      ? []
      : unique(
          context.profiles
            .flatMap((profile) => profile.procedureCodes || [])
            .concat(
              context.source.familyCodes.flatMap(
                (code) =>
                  families.get(code)?.definitionJson.procedureCodes || [],
              ),
            ),
        );
    const included = context.service
      ? unique(
          context.source.technical
            ? context.source.technical.procedureCodes || []
            : context.profiles.flatMap(
                (profile) => profile.includedProcedureCodes || [],
              ),
        )
      : [];
    if (
      !context.service &&
      context.profiles.some((profile) => profile.includedProcedureCodes?.length)
    )
      alert(
        'PACKAGE_REQUIRES_SERVICE',
        'warning',
        'Procedimentos de pacote exigem um item de serviço contratado; a venda isolada do material não inclui mão de obra.',
        [context.source.key],
      );
    for (const code of unique([...codes, ...included])) {
      const procedure = library.get(code);
      if (!procedure) {
        alert(
          'UNKNOWN_PROCEDURE',
          'warning',
          'Procedimento técnico ausente ou inativo: ' + code + '.',
          [context.source.key],
        );
        continue;
      }
      const candidate = candidates.get(code) || {
        procedure,
        sourceKeys: new Set<string>(),
        packageKeys: new Set<string>(),
      };
      candidate.sourceKeys.add(context.source.key);
      if (included.includes(code))
        candidate.packageKeys.add(context.source.key);
      candidates.set(code, candidate);
    }
  }
  const applied: Candidate[] = [];
  const eligibleContexts = sourceContexts.filter(
    (context) => context.valid && context.compatible,
  );
  const matchedContexts = (
    codes: string[],
    service: boolean,
    procedureCode: string,
  ) =>
    eligibleContexts.filter(
      (context) =>
        (service
          ? context.service &&
            !context.source.technical?.stale &&
            (!context.source.technical ||
              Boolean(
                context.source.technical.procedureCodes?.includes(
                  procedureCode,
                ),
              ))
          : context.material) &&
        context.source.familyCodes.some((code) => codes.includes(code)),
    );
  for (const candidate of [...candidates.values()].sort((a, b) =>
    a.procedure.code.localeCompare(b.procedure.code, 'en'),
  )) {
    const { procedure } = candidate;
    const definition = procedure.definitionJson;
    if (
      !definition.section?.id ||
      !definition.section?.title ||
      !Array.isArray(definition.activities) ||
      !definition.activities.length ||
      (professional &&
        !definition.activities.some(
          (activity) => !activity.auxiliary && activity.text?.trim(),
        ))
    ) {
      alert(
        'INVALID_PROCEDURE',
        'error',
        'Procedimento sem seção ou atividades válidas: ' + procedure.code + '.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    const hasPackage = candidate.packageKeys.size > 0;
    const requiredServices = definition.requiredServiceFamilyCodes || [];
    const serviceMatches = matchedContexts(
      requiredServices,
      true,
      procedure.code,
    );
    if (
      (requiredServices.length > 0 && !serviceMatches.length && !hasPackage) ||
      (definition.trigger === 'SERVICE' &&
        !hasPackage &&
        ![...candidate.sourceKeys].some(
          (key) => contextsByKey.get(key)?.service,
        ))
    ) {
      alert(
        'LABOR_NOT_CONTRACTED',
        'info',
        'O procedimento ' +
          procedure.name +
          ' não foi incluído: a mão de obra correspondente não consta dos itens contratados.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    const requiredMaterials = definition.requiredMaterialFamilyCodes || [];
    const materialMatches = matchedContexts(
      requiredMaterials,
      false,
      procedure.code,
    );
    if (requiredMaterials.length && !materialMatches.length) {
      alert(
        'MATERIAL_NOT_CONTRACTED',
        'warning',
        'O procedimento ' +
          procedure.name +
          ' exige material correspondente ou definição expressa do fornecimento; nenhum material foi acrescentado automaticamente.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    if (
      definition.trigger === 'MATERIAL' &&
      !hasPackage &&
      !serviceMatches.length
    ) {
      alert(
        'LABOR_NOT_CONTRACTED',
        'info',
        'Fornecimento de material sem contratação de intervenção correspondente; substituição e instalação não foram incluídas.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    const application = compatibility(
      definition.compatibleEquipment,
      equipment,
    );
    if (application === 'INCOMPATIBLE') {
      alert(
        'INCOMPATIBLE_PROCEDURE',
        'error',
        'Procedimento incompatível com os dados cadastrados do equipamento: ' +
          procedure.name +
          '.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    if (application === 'UNKNOWN')
      alert(
        'EQUIPMENT_VALIDATION_REQUIRED',
        'warning',
        'Confirme os dados do equipamento antes de executar ' +
          procedure.name +
          '.',
        [...candidate.sourceKeys],
      );
    for (const context of [...serviceMatches, ...materialMatches])
      candidate.sourceKeys.add(context.source.key);
    if (
      professional &&
      definition.activities.some(
        (activity) =>
          !activity.auxiliary && isGenericTechnicalText(activity.text || ''),
      )
    ) {
      alert(
        'PROCEDURE_CONTENT_INSUFFICIENT',
        'error',
        'O procedimento ' +
          procedure.name +
          ' contém descrição genérica. Revise suas atividades na biblioteca ou classifique a execução contratada.',
        [...candidate.sourceKeys],
      );
      continue;
    }
    applied.push(candidate);
  }
  const appliedCodes = new Set(
    applied.map((candidate) => candidate.procedure.code),
  );
  const conditionMap = new Map<string, ScopeOperationalCondition>();
  function condition(
    code: string,
    text: string,
    procedureCode: string,
    sourceKeys: string[],
  ) {
    const existing = conditionMap.get(code);
    if (existing) {
      existing.procedureCodes = unique([
        ...existing.procedureCodes,
        procedureCode,
      ]);
      existing.sourceKeys = unique([...existing.sourceKeys, ...sourceKeys]);
      return;
    }
    conditionMap.set(code, {
      code,
      text,
      status: 'PENDING',
      procedureCodes: [procedureCode],
      sourceKeys: unique(sourceKeys),
    });
  }
  for (const candidate of applied) {
    const { procedure } = candidate;
    const keys = [...candidate.sourceKeys];
    for (const dependency of procedure.definitionJson.dependsOnCodes || [])
      if (!appliedCodes.has(dependency))
        alert(
          'COMMERCIAL_DEPENDENCY',
          'warning',
          'O procedimento ' +
            procedure.name +
            ' depende de ' +
            dependency +
            ', que não está contratado ou validado. Nenhum serviço ou custo foi incluído automaticamente.',
          keys,
        );
    for (const requirement of procedure.definitionJson.requirements || []) {
      alert(
        requirement.code,
        requirement.severity || 'warning',
        requirement.message,
        keys,
      );
      if (requirement.condition !== 'COMMERCIAL_DEPENDENCY')
        condition(requirement.code, requirement.message, procedure.code, keys);
    }
    for (const requirement of procedure.definitionJson.operationalConditions ||
      [])
      condition(requirement.code, requirement.text, procedure.code, keys);
    if (
      procedure.definitionJson.requiresOperationalAuthorization ||
      procedure.definitionJson.loadMode
    ) {
      const text =
        procedure.definitionJson.loadMode === 'LOAD_BANK'
          ? 'Teste com banco de cargas condicionado à autorização prévia do responsável, à disponibilidade e às condições de uso expressamente contratadas. O fornecimento do banco de cargas não é presumido.'
          : procedure.definitionJson.loadMode === 'INSTALLATION'
            ? 'Teste operacional com carga condicionado às condições técnicas e operacionais disponíveis e à autorização prévia do responsável pela instalação. A contratação não autoriza sua execução.'
            : 'Execução do procedimento contratado condicionada à validação das condições técnicas e à autorização prévia do responsável pela instalação.';
      condition(
        'CLIENT_OPERATIONAL_AUTHORIZATION:' + procedure.code,
        text,
        procedure.code,
        keys,
      );
      alert(
        'OPERATIONAL_AUTHORIZATION_PENDING',
        'warning',
        'Autorização operacional pendente para ' +
          procedure.name +
          '; o escopo comercial não concede autorização de execução.',
        keys,
      );
    }
  }
  type WorkingSection = ScopeSection & { order: number };
  const sections = new Map<string, WorkingSection>();
  const activityOwners = new Map<string, { section: string; text: string }>();
  function add(
    section: { id: string; title: string; order?: number },
    activity: ScopeSection['activities'][number],
  ) {
    const owner = activityOwners.get(activity.id);
    if (owner) {
      const previous = sections
        .get(owner.section)!
        .activities.find((entry) => entry.id === activity.id)!;
      if (owner.text !== activity.text)
        alert(
          'ACTIVITY_DEFINITION_CONFLICT',
          'error',
          'Atividade com o mesmo identificador e descrições diferentes: ' +
            activity.id +
            '. Revise a biblioteca técnica.',
          activity.sourceKeys,
        );
      previous.procedureCodes = unique([
        ...previous.procedureCodes,
        ...activity.procedureCodes,
      ]);
      previous.sourceKeys = unique([
        ...previous.sourceKeys,
        ...activity.sourceKeys,
      ]);
      return;
    }
    const target = sections.get(section.id) || {
      id: section.id,
      title: section.title,
      order: section.order ?? 50,
      activities: [],
    };
    target.activities.push(activity);
    sections.set(section.id, target);
    activityOwners.set(activity.id, {
      section: section.id,
      text: activity.text,
    });
  }
  if (!professional && input.items.length) {
    const parts = [
      equipment.name,
      equipment.brand || equipment.manufacturer,
      equipment.model || equipment.modelName,
      equipment.serialNumber
        ? 'Série ' + String(equipment.serialNumber)
        : undefined,
    ].filter((value) => value !== null && value !== undefined && value !== '');
    add(
      { id: 'OBJECTIVE', title: 'Objetivo', order: 0 },
      {
        id: 'OBJECTIVE',
        text: parts.length
          ? 'Atendimento ao equipamento ' +
            parts.join(' | ') +
            ', limitado aos fornecimentos e serviços expressamente relacionados nesta proposta.'
          : 'Fornecimentos e serviços previstos nesta proposta, conforme os itens comerciais e as condições técnicas aplicáveis.',
        procedureCodes: [],
        sourceKeys: unique(input.items.map((item) => item.key)),
      },
    );
  }
  for (const context of sourceContexts)
    if (context.material && context.valid) {
      const quantity = new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 6,
      }).format(context.source.quantity);
      add(
        { id: 'SUPPLY', title: 'Materiais e fornecimento', order: 30 },
        {
          id: 'SUPPLY-' + hash(context.source.key).slice(0, 20),
          text:
            'Fornecimento de ' +
            quantity +
            ' × ' +
            context.source.description +
            '.',
          procedureCodes: [],
          sourceKeys: [context.source.key],
        },
      );
    }
  for (const candidate of applied)
    for (const activity of candidate.procedure.definitionJson.activities) {
      if (!activity.id?.trim() || !activity.text?.trim()) {
        alert(
          'INVALID_ACTIVITY',
          'error',
          'Atividade sem identificador ou texto no procedimento ' +
            candidate.procedure.code +
            '.',
          [...candidate.sourceKeys],
        );
        continue;
      }
      add(activity.section || candidate.procedure.definitionJson.section, {
        id: activity.id,
        text: activity.text,
        procedureCodes: [candidate.procedure.code],
        sourceKeys: unique([...candidate.sourceKeys]),
        ...(activity.auxiliary ? { auxiliary: true } : {}),
      });
    }
  if (
    applied.length &&
    !Object.values(equipment).some((value) => value !== null && value !== '')
  )
    alert(
      'EQUIPMENT_NOT_IDENTIFIED',
      'warning',
      'Equipamento não identificado. Confirme a aplicação dos componentes e os dados técnicos antes da execução; nenhuma especificação foi presumida.',
    );
  const procedures: ScopeAppliedProcedure[] = applied.map((candidate) => ({
    code: candidate.procedure.code,
    name: candidate.procedure.name,
    version: candidate.procedure.version || 1,
    sourceKeys: unique([...candidate.sourceKeys]),
  }));
  for (const context of sourceContexts) {
    context.source.procedureCodes = procedures
      .filter((procedure) => procedure.sourceKeys.includes(context.source.key))
      .map((procedure) => procedure.code);
    if (context.service && context.valid && context.compatible) {
      const manual = context.source.technical?.manualDescription || '';
      if (context.source.technical?.stale) {
        alert(
          'SERVICE_CLASSIFICATION_STALE',
          'error',
          'O item, a quantidade ou as linhas repetidas mudaram. Confirme novamente a finalidade e a execução para este serviço; o texto anterior foi preservado.',
          [context.source.key],
        );
      } else if (manual && context.source.technical?.procedureCodes?.length) {
        alert(
          'SERVICE_CLASSIFICATION_CONFLICT',
          'error',
          'Escolha procedimentos ou descrição manual para o mesmo serviço.',
          [context.source.key],
        );
      } else if (sufficientManualService(manual)) {
        add(
          { id: 'SERVICES', title: 'Serviços contratados', order: 15 },
          {
            id: 'MANUAL-' + hash(context.source.key).slice(0, 20),
            text:
              (context.source.hours !== undefined
                ? context.source.hours + ' h contratadas — '
                : context.source.quantity + ' × ') + manual,
            procedureCodes: [],
            sourceKeys: [context.source.key],
          },
        );
      } else if (!context.source.procedureCodes.length && !professional) {
        add(
          {
            id: 'PENDING_CLASSIFICATION',
            title: 'Serviços a detalhar',
            order: 75,
          },
          {
            id: 'PENDING-' + hash(context.source.key).slice(0, 20),
            text:
              'Serviço comercial: ' +
              context.source.description +
              '. Detalhamento técnico sujeito à validação.',
            procedureCodes: [],
            sourceKeys: [context.source.key],
          },
        );
      } else if (!context.source.procedureCodes.length) {
        alert(
          'SERVICE_PURPOSE_REQUIRED',
          professional ? 'error' : 'warning',
          'Defina a finalidade e a execução de ' +
            context.source.description +
            ': escolha um procedimento ou informe uma descrição técnica com pelo menos 40 caracteres e 6 palavras.',
          [context.source.key],
        );
      } else if (professional) {
        const names = procedures
          .filter((procedure) =>
            context.source.procedureCodes.includes(procedure.code),
          )
          .map((procedure) => procedure.name);
        add(
          { id: 'SERVICES', title: 'Serviços contratados', order: 15 },
          {
            id: 'SERVICE-' + hash(context.source.key).slice(0, 20),
            text:
              (context.source.hours !== undefined
                ? context.source.hours + ' h contratadas — '
                : context.source.quantity + ' × ') +
              names.join('; ') +
              '.',
            procedureCodes: context.source.procedureCodes,
            sourceKeys: [context.source.key],
          },
        );
      }
    }
  }
  const operationalConditions = [...conditionMap.values()].sort((a, b) =>
    a.code.localeCompare(b.code, 'en'),
  );
  for (const item of operationalConditions)
    add(
      { id: 'CONDITIONS', title: 'Condições e observações', order: 90 },
      {
        id: 'CONDITION-' + item.code,
        text: item.text,
        procedureCodes: item.procedureCodes,
        sourceKeys: item.sourceKeys,
        auxiliary: true,
      },
    );
  const outputSections: ScopeSection[] = [...sections.values()]
    .filter((section) => section.activities.length)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'en'))
    .map(({ id, title, activities }) => ({ id, title, activities }));
  return {
    engineVersion: TECHNICAL_SCOPE_ENGINE_VERSION,
    sourceHash: technicalScopeSourceHash(input),
    libraryHash: hash({
      families: byCanonical(input.families),
      procedures: byCanonical(input.procedures),
      profiles: byCanonical(input.profiles),
    }),
    generatedText: outputSections.length
      ? (professional
          ? sourceContexts.some((context) => context.service)
            ? 'SERVIÇOS TÉCNICOS CONTRATADOS'
            : 'FORNECIMENTO DE MATERIAIS'
          : 'ESCOPO TÉCNICO DOS SERVIÇOS') +
        '\n\n' +
        outputSections
          .map(
            (section) =>
              section.title +
              '\n' +
              section.activities
                .map((activity) => '- ' + activity.text)
                .join('\n'),
          )
          .join('\n\n')
      : '',
    sections: outputSections,
    alerts: alerts.sort(
      (a, b) =>
        a.code.localeCompare(b.code, 'en') ||
        canonical(a).localeCompare(canonical(b), 'en'),
    ),
    sources: sourceContexts.map((context) => context.source),
    procedures,
    operationalConditions,
  };
}
