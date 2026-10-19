import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  CatalogListPageDto,
  currentListPage,
} from '../../common/list-page.dto';

const INTERNAL_TERMS = [
  'uso interno',
  'consumo interno',
  'administrativo',
  'escritorio',
  'papel',
  'a4',
  'folha',
  'fita',
  'pilha',
  'bateria comum',
  'caneta',
  'toner',
  'limpeza',
  'copa',
];
const TOOL_TERMS = [
  'ferramenta',
  'alicate',
  'chave',
  'multimetro',
  'torquimetro',
  'furadeira',
  'parafusadeira',
  'maleta',
  'escada',
  'epi',
  'capacete',
  'luva',
  'oculos',
  'protetor',
];

type CatalogPageIndex = {
  ids: string[];
  total: number;
  totalItems: number;
  parts: number;
  services: number;
  internal: number;
  technicalTools: number;
  generatorParts: number;
  lowStock: number;
};

export async function catalogPageIndex(
  db: DatabaseService,
  query: CatalogListPageDto,
  includeSummary = false,
) {
  const search = query.q.trim().toLowerCase();
  const searchPredicate = search
    ? Prisma.sql`(
    position(${search} in lower(concat_ws(' ', c.name, c.sku, c."legacyCode", c."legacySequence", c."radarCode", c."manufacturerPartNumber", c.category, c."itemClassification", c."acquisitionOrigin", c."storageLocation", c.description, c."commercialDescription"))) > 0
    OR EXISTS (SELECT 1 FROM catalog_item_identifiers i WHERE i."catalogItemId" = c.id AND i."isActive" AND position(${search} in lower(i.code)) > 0)
  )`
    : Prisma.sql`true`;
  const filters: Prisma.Sql[] = [Prisma.sql`c."matchesSearch"`];
  const needsGroups =
    includeSummary ||
    ['internal', 'technicalTools', 'generatorParts'].includes(query.group);
  const classification = needsGroups
    ? Prisma.sql`CASE WHEN c.type = 'SERVICE' THEN 'services'
    WHEN c.haystack ~ ${INTERNAL_TERMS.join('|')} THEN 'internal'
    WHEN c.haystack ~ ${TOOL_TERMS.join('|')} THEN 'technicalTools'
    ELSE 'generatorParts' END`
    : Prisma.sql`NULL::text`;
  if (query.group === 'services') filters.push(Prisma.sql`c.type = 'SERVICE'`);
  else if (query.group === 'lowStock') filters.push(Prisma.sql`c."isLowStock"`);
  else if (query.group !== 'all')
    filters.push(Prisma.sql`c."catalogGroup" = ${query.group}`);
  const order =
    {
      name: Prisma.sql`c.name`,
      description: Prisma.sql`COALESCE(c.description, c."commercialDescription", '')`,
      sku: Prisma.sql`c.sku`,
      type: Prisma.sql`c.type`,
      stock: Prisma.sql`COALESCE(b.available, 0)`,
      price: Prisma.sql`c."basePrice"`,
    }[query.sort] || Prisma.sql`c.name`;
  const direction =
    query.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const [index] = await db.$queryRaw<CatalogPageIndex[]>(Prisma.sql`
    WITH balances AS (
      SELECT "catalogItemId", sum("physicalQty" - "reservedQty") AS available,
        max("minQty") AS minimum, max(COALESCE("reorderPoint", 0)) AS trigger
      FROM inventory_balances GROUP BY "catalogItemId"
    ), source AS (
      SELECT c.id, c.type, ${order} AS "sortValue", ${searchPredicate} AS "matchesSearch", lower(concat_ws(' ', c.name, c.sku, c.category, c.description, c."commercialDescription", c."storageLocation")) AS haystack,
        COALESCE(b.available, 0) AS "availableQty",
        c.type <> 'SERVICE' AND COALESCE(b.trigger, GREATEST(COALESCE(c."stockMin", 0), COALESCE(b.minimum, 0))) > 0
          AND COALESCE(b.available, 0) <= COALESCE(b.trigger, GREATEST(COALESCE(c."stockMin", 0), COALESCE(b.minimum, 0))) AS "isLowStock"
      FROM catalog_items c LEFT JOIN balances b ON b."catalogItemId" = c.id
      WHERE c."isActive"
    ), classified AS (
      SELECT c.id, c.type, c."sortValue", c."matchesSearch", c."isLowStock", ${classification} AS "catalogGroup"
      FROM source c
    ), filtered AS (
      SELECT c.* FROM classified c WHERE ${filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`true`}
    )
    SELECT
      count(*)::int AS "totalItems",
      count(*) FILTER (WHERE type = 'PART')::int AS parts,
      count(*) FILTER (WHERE type = 'SERVICE')::int AS services,
      count(*) FILTER (WHERE "catalogGroup" = 'internal')::int AS internal,
      count(*) FILTER (WHERE "catalogGroup" = 'technicalTools')::int AS "technicalTools",
      count(*) FILTER (WHERE "catalogGroup" = 'generatorParts')::int AS "generatorParts",
      count(*) FILTER (WHERE "isLowStock")::int AS "lowStock",
      (SELECT count(*)::int FROM filtered) AS total,
      ARRAY(SELECT c.id FROM filtered c ORDER BY c."sortValue" ${direction} NULLS LAST, c.id ASC
        LIMIT ${query.pageSize}
        OFFSET (LEAST(${query.page}, GREATEST(1, ((SELECT count(*)::int FROM filtered) + ${query.pageSize} - 1) / ${query.pageSize})) - 1) * ${query.pageSize}
      ) AS ids
    FROM classified
  `);
  return {
    ...index,
    page: currentListPage(index.total, query),
    pageSize: query.pageSize,
    summary: {
      total: index.totalItems,
      parts: index.parts,
      services: index.services,
      lowStock: index.lowStock,
      groups: {
        all: index.totalItems,
        internal: index.internal,
        technicalTools: index.technicalTools,
        generatorParts: index.generatorParts,
        services: index.services,
        lowStock: index.lowStock,
      },
    },
  };
}

export function catalogGroup(item: {
  type: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  commercialDescription?: string | null;
  storageLocation?: string | null;
}) {
  if (item.type === 'SERVICE') return 'services';
  const text = [
    item.name,
    item.sku,
    item.category,
    item.description,
    item.commercialDescription,
    item.storageLocation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (INTERNAL_TERMS.some((term) => text.includes(term))) return 'internal';
  if (TOOL_TERMS.some((term) => text.includes(term))) return 'technicalTools';
  return 'generatorParts';
}
