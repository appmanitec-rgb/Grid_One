import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ClientListPageDto, currentListPage } from '../../common/list-page.dto';

export async function clientListPage(
  db: DatabaseService,
  query: ClientListPageDto,
) {
  const where: Prisma.ClientWhereInput = {};
  for (const [key, value] of [
    ['withholdsInss', query.inss],
    ['withholdsIss', query.iss],
    ['isDelinquent', query.delinquent],
    ['proposalCreationBlocked', query.blocked],
  ] as const) {
    if (value !== 'ALL') where[key] = value === 'YES';
  }
  if (query.contract !== 'ALL') where.clientType = query.contract;
  const search = query.q.trim();
  if (search) {
    const contains = {
      contains: search.replace(/[\\%_]/g, (character) => '\\' + character),
      mode: 'insensitive' as const,
    };
    where.OR = [
      ...[
        'code',
        'companyName',
        'tradeName',
        'cnpj',
        'email',
        'phone',
        'address',
        'city',
        'state',
        'preferences',
      ].map((key) => ({ [key]: contains })),
      {
        contacts: {
          some: {
            OR: ['name', 'role', 'phone', 'mobile', 'email'].map((key) => ({
              [key]: contains,
            })),
          },
        },
      },
      {
        addresses: {
          some: {
            OR: [
              'street',
              'number',
              'complement',
              'district',
              'city',
              'state',
              'zipCode',
            ].map((key) => ({ [key]: contains })),
          },
        },
      },
    ];
  }
  const sorts: Record<string, Prisma.ClientOrderByWithRelationInput> = {
    name: { companyName: query.direction },
    code: { code: query.direction },
    document: { cnpj: query.direction },
    contact: { email: query.direction },
    address: { address: query.direction },
  };
  const total = await db.client.count({ where });
  const page = currentListPage(total, query);
  const items = await db.client.findMany({
    where,
    orderBy: [sorts[query.sort] || sorts.name, { id: 'asc' }],
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
    select: {
      id: true,
      code: true,
      companyName: true,
      tradeName: true,
      cnpj: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      isProvisional: true,
      proposalCreationBlocked: true,
      proposalBlockReason: true,
    },
  });
  return { items, total, page, pageSize: query.pageSize };
}
