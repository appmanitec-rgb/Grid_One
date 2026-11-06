import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { classifyScopeItems } from './technical-service-classification';
import type {
  EngineInput,
  ScopeSourceItem,
  ScopeFamily,
  ScopeProcedure,
  ScopeCatalogProfile,
} from './technical-scope.types';

export type TechnicalSourceItem = {
  key?: string;
  kind?: string;
  catalogItemId?: string | null;
  description?: string | null;
  quantity?: number;
  hours?: number | null;
};
export type TechnicalSourceInput = {
  type: string;
  clientId?: string | null;
  generatorId?: string | null;
  items: readonly TechnicalSourceItem[];
  technicalScopeClassifications?: unknown;
};
export type TechnicalScopeDatabase = Pick<
  Prisma.TransactionClient,
  | 'catalogItem'
  | 'generator'
  | 'technicalScopeFamily'
  | 'technicalScopeProcedure'
  | 'catalogTechnicalProfile'
>;

/** Resolve authoritative names without selecting prices, stock, costs or supplier details. */
export async function resolveTechnicalScopeSource(
  db: TechnicalScopeDatabase,
  input: TechnicalSourceInput,
): Promise<Pick<EngineInput, 'proposalType' | 'equipment' | 'items'>> {
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 500
  )
    throw new BadRequestException(
      'Informe de 1 a 500 itens para conferir o escopo.',
    );
  if (
    Array.isArray(input.technicalScopeClassifications) &&
    input.technicalScopeClassifications.length &&
    !['PARTS_AND_SERVICES', 'PARTS', 'SERVICES'].includes(input.type)
  )
    throw new BadRequestException(
      'Use a classificação técnica no fluxo de peças e serviços.',
    );
  const inputItems: readonly TechnicalSourceItem[] = input.items;
  const ids = [
    ...new Set(
      inputItems
        .map((item) => item.catalogItemId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const catalog = ids.length
    ? await db.catalogItem.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, name: true, type: true },
      })
    : [];
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const rows = inputItems.map((item) => {
    const product = item.catalogItemId
      ? byId.get(item.catalogItemId)
      : undefined;
    if (item.catalogItemId && !product)
      throw new BadRequestException(
        'Um item do catalogo nao existe ou esta inativo.',
      );
    if (item.kind === 'CATALOG_SERVICE' && product?.type !== 'SERVICE')
      throw new BadRequestException(
        'O item informado nao e um servico do catalogo.',
      );
    const hourly = item.kind === 'HOURLY_SERVICE';
    const hours = hourly ? Number(item.hours ?? item.quantity) : undefined;
    const quantity = hourly
      ? Math.max(1, Math.ceil(hours ?? 0))
      : Math.max(1, Math.trunc(Number(item.quantity ?? 1)));
    if (
      !Number.isFinite(Number(item.quantity ?? 1)) ||
      Number(item.quantity ?? 1) <= 0 ||
      Number(item.quantity ?? 1) > 1000000 ||
      (hourly &&
        (!Number.isFinite(hours) ||
          (hours ?? 0) <= 0 ||
          (hours ?? 0) > 1000000))
    )
      throw new BadRequestException(
        'Quantidade ou horas invalidas para o escopo.',
      );
    const description =
      product?.name ||
      (hourly ? 'Servico por hora' : item.description?.trim() || 'Item avulso');
    return {
      key: '',
      kind: product
        ? product.type === 'SERVICE'
          ? 'SERVICE'
          : 'MATERIAL'
        : hourly
          ? 'HOURLY'
          : item.kind === 'OTHER' &&
              ['PARTS_AND_SERVICES', 'PARTS', 'SERVICES'].includes(input.type)
            ? 'SERVICE'
            : item.kind || 'OTHER',
      catalogItemId: product?.id || null,
      description,
      quantity,
      ...(hours !== undefined ? { hours } : {}),
    } satisfies ScopeSourceItem;
  });
  // Proposal item IDs and request order are deliberately excluded from source identity.
  rows.sort((left, right) =>
    JSON.stringify([
      left.kind,
      left.catalogItemId,
      left.description,
      left.quantity,
      left.hours ?? null,
    ]).localeCompare(
      JSON.stringify([
        right.kind,
        right.catalogItemId,
        right.description,
        right.quantity,
        right.hours ?? null,
      ]),
      'en',
    ),
  );
  const occurrences = new Map<string, number>();
  for (const row of rows) {
    const identity =
      row.kind +
      ':' +
      (row.catalogItemId ||
        (row.kind === 'SERVICE'
          ? 'manual-' +
            createHash('sha256')
              .update(row.description)
              .digest('hex')
              .slice(0, 32)
          : row.description));
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    row.key = identity + ':' + occurrence;
  }
  let equipment: EngineInput['equipment'] = {
    clientId: input.clientId || null,
    generatorId: input.generatorId || null,
  };
  if (input.generatorId) {
    const generator = await db.generator.findUnique({
      where: { id: input.generatorId },
      select: {
        id: true,
        clientId: true,
        name: true,
        brand: true,
        modelId: true,
        voltage: true,
        power: true,
        engineBrand: true,
        engineModelName: true,
      },
    });
    if (!generator)
      throw new NotFoundException('Equipamento da proposta nao encontrado.');
    if (!input.clientId || generator.clientId !== input.clientId)
      throw new BadRequestException(
        'O equipamento nao pertence ao cliente informado.',
      );
    equipment = { ...equipment, ...generator, generatorId: generator.id };
  }
  return {
    proposalType: input.type,
    equipment,
    items: classifyScopeItems(rows, input.technicalScopeClassifications, [
      input.type,
      input.clientId || null,
      input.generatorId || null,
    ]),
  };
}

export async function loadTechnicalScopeLibrary(
  db: TechnicalScopeDatabase,
  catalogIds: readonly string[],
): Promise<Pick<EngineInput, 'families' | 'procedures' | 'profiles'>> {
  const [families, procedures, profiles] = await Promise.all([
    db.technicalScopeFamily.findMany({ orderBy: { code: 'asc' } }),
    db.technicalScopeProcedure.findMany({ orderBy: { code: 'asc' } }),
    db.catalogTechnicalProfile.findMany({
      where: { catalogItemId: { in: [...catalogIds] } },
      orderBy: { catalogItemId: 'asc' },
    }),
  ]);
  return {
    families: families.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      version: row.version,
      isActive: row.isActive,
      definitionJson: {
        ...((row.definitionJson as Record<string, unknown>) || {}),
        kind: row.kind,
      },
    })) as ScopeFamily[],
    procedures: procedures.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      version: row.version,
      isActive: row.isActive,
      definitionJson: row.definitionJson,
    })) as ScopeProcedure[],
    profiles: profiles.map((row) => ({
      id: row.id,
      catalogItemId: row.catalogItemId,
      familyCodes: row.familyCodes,
      procedureCodes: row.procedureCodes,
      includedProcedureCodes: row.includedProcedureCodes,
      compatibility: row.compatibility || undefined,
      version: row.version,
      isActive: row.isActive,
    })) as ScopeCatalogProfile[],
  };
}
export function scopeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
