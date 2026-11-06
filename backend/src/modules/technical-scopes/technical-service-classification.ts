import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ScopeServiceClassification,
  ScopeSourceItem,
} from './technical-scope.types';

const generic =
  /servico comercial:|detalhamento tecnico sujeito a validacao|manutencao (?:preventiva )?nos pontos abrangidos|atendimento limitado aos fornecimentos|fornecimentos e servicos previstos nesta proposta/i;
export function isGenericTechnicalText(text: string): boolean {
  return generic.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}
export function sufficientManualService(text: string): boolean {
  const value = text.trim();
  return (
    value.length >= 40 &&
    value.split(/\s+/).length >= 6 &&
    !isGenericTechnicalText(value)
  );
}

export function classifyScopeItems(
  items: ScopeSourceItem[],
  value: unknown,
  context: unknown = null,
): ScopeSourceItem[] {
  const identity = (item: ScopeSourceItem) =>
    JSON.stringify([item.kind, item.catalogItemId || item.description]);
  const facts = (item: ScopeSourceItem) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          context,
          identity(item),
          items
            .filter((row) => identity(row) === identity(item))
            .map((row) => [row.quantity, row.hours ?? null])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ]),
      )
      .digest('hex');
  items = items.map((item) => ({ ...item, classificationFacts: facts(item) }));
  if (value === undefined || value === null) return items;
  if (!Array.isArray(value) || value.length > 500)
    throw new BadRequestException('Confira a classificação dos serviços.');
  const classifications = new Map<string, ScopeServiceClassification>();
  for (const candidate of value) {
    const row = candidate as Partial<ScopeServiceClassification>;
    if (
      !row ||
      typeof row.sourceKey !== 'string' ||
      row.sourceKey.length > 200 ||
      classifications.has(row.sourceKey)
    )
      throw new BadRequestException(
        'Vínculo técnico de serviço inválido ou repetido.',
      );
    const codes = row.procedureCodes || [];
    if (
      (row.sourceFacts !== undefined &&
        (typeof row.sourceFacts !== 'string' ||
          !/^[a-f0-9]{64}$/.test(row.sourceFacts))) ||
      !Array.isArray(codes) ||
      codes.length > 20 ||
      codes.some(
        (code) =>
          typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(code),
      ) ||
      (row.manualDescription !== undefined &&
        (typeof row.manualDescription !== 'string' ||
          row.manualDescription.length > 2000))
    )
      throw new BadRequestException(
        'Procedimento ou descrição técnica inválidos.',
      );
    classifications.set(row.sourceKey, {
      sourceKey: row.sourceKey,
      sourceFacts: row.sourceFacts,
      procedureCodes: [...new Set(codes)].sort(),
      manualDescription: row.manualDescription?.trim() || '',
    });
  }
  return items.map((item) => {
    const classification = classifications.get(item.key);
    if (!classification) return item;
    if (!['SERVICE', 'HOURLY', 'HOURS', 'LABOR'].includes(item.kind))
      throw new BadRequestException(
        'Classifique somente um serviço contratado. Materiais não contratam execução.',
      );
    return {
      ...item,
      technical: {
        procedureCodes: classification.procedureCodes || [],
        manualDescription: classification.manualDescription || '',
        sourceFacts: classification.sourceFacts || item.classificationFacts,
        stale: Boolean(
          classification.sourceFacts &&
          classification.sourceFacts !== item.classificationFacts,
        ),
      },
    };
  });
}

export function storedScopeClassifications(
  snapshot: unknown,
): ScopeServiceClassification[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const input = (snapshot as { inputSnapshot?: { items?: ScopeSourceItem[] } })
    .inputSnapshot;
  return (input?.items || [])
    .filter((item) => item.technical)
    .map((item) => ({
      sourceKey: item.key,
      procedureCodes: item.technical?.procedureCodes || [],
      manualDescription: item.technical?.manualDescription || '',
      ...(item.technical?.sourceFacts
        ? { sourceFacts: item.technical.sourceFacts }
        : {}),
    }));
}
