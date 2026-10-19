import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  EquipmentListPageDto,
  currentListPage,
} from '../../common/list-page.dto';

type EquipmentPageIndex = {
  ids: string[];
  total: number;
  totalItems: number;
  critical: number;
  contracted: number;
  openTickets: number;
};

export async function equipmentPageIndex(
  db: DatabaseService,
  query: EquipmentListPageDto,
) {
  const filters: Prisma.Sql[] = [];
  const search = query.q.trim().toLowerCase();
  if (search) filters.push(Prisma.sql`position(${search} in c.haystack) > 0`);
  if (query.criticality !== 'ALL')
    filters.push(Prisma.sql`c.criticality::text = ${query.criticality}`);
  if (query.status !== 'ALL')
    filters.push(Prisma.sql`c."operationalStatus"::text = ${query.status}`);
  if (query.contract === 'CONTRACTED')
    filters.push(Prisma.sql`c."contractStatus" IS NOT NULL`);
  if (query.contract === 'NO_CONTRACT')
    filters.push(Prisma.sql`c."contractStatus" IS NULL`);
  if (query.contract === 'ACTIVE_CONTRACT')
    filters.push(Prisma.sql`c."contractStatus" IN ('ACTIVE', 'RENEWAL')`);
  if (query.tickets === 'OPEN') filters.push(Prisma.sql`c."ticketCount" > 0`);
  if (query.tickets === 'NONE') filters.push(Prisma.sql`c."ticketCount" = 0`);
  const [index] = await db.$queryRaw<EquipmentPageIndex[]>(Prisma.sql`
    WITH primary_contract AS (
      SELECT DISTINCT ON (e."generatorId") e."generatorId", c.status::text AS status
      FROM contract_equipments e JOIN service_contracts c ON c.id = e."contractId"
      ORDER BY e."generatorId", e."createdAt" DESC, e.id ASC
    ), tickets AS (
      SELECT "generatorId", count(*)::int AS total FROM service_tickets
      WHERE status IN ('OPEN', 'TRIAGE', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'SCHEDULED', 'IN_PROGRESS', 'CONVERTING_TO_ORDER')
      GROUP BY "generatorId"
    ), source AS (
      SELECT g.id, g.name, g.criticality, g."operationalStatus", pc.status AS "contractStatus", COALESCE(t.total, 0) AS "ticketCount",
        lower(concat_ws(' ', NULLIF(g.code,''), NULLIF(g.name,''), NULLIF(g."assetTag",''), NULLIF(g."serialNumber",''), NULLIF(c."companyName",''), NULLIF(s.name,''), NULLIF(m.name,''), NULLIF(g.brand,''))) AS haystack
      FROM generators g LEFT JOIN clients c ON c.id = g."clientId"
      LEFT JOIN sites s ON s.id = g."currentSiteId" LEFT JOIN modelos m ON m.id = g."modelId"
      LEFT JOIN primary_contract pc ON pc."generatorId" = g.id LEFT JOIN tickets t ON t."generatorId" = g.id
    ), filtered AS (
      SELECT c.* FROM source c WHERE ${filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`true`}
    )
    SELECT count(*)::int AS "totalItems",
      count(*) FILTER (WHERE criticality = 'A')::int AS critical,
      count(*) FILTER (WHERE "contractStatus" IS NOT NULL)::int AS contracted,
      COALESCE(sum(LEAST("ticketCount", 3)),0)::int AS "openTickets",
      (SELECT count(*)::int FROM filtered) AS total,
      ARRAY(SELECT c.id FROM filtered c ORDER BY c.criticality ASC, c.name ASC, c.id ASC
        LIMIT ${query.pageSize}
        OFFSET (LEAST(${query.page}, GREATEST(1, ((SELECT count(*)::int FROM filtered) + ${query.pageSize} - 1) / ${query.pageSize})) - 1) * ${query.pageSize}
      ) AS ids
    FROM source
  `);
  return {
    ...index,
    page: currentListPage(index.total, query),
    pageSize: query.pageSize,
    summary: {
      total: index.totalItems,
      critical: index.critical,
      contracted: index.contracted,
      openTickets: index.openTickets,
    },
  };
}
