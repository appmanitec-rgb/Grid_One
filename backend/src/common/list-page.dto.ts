import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsString()
  @MaxLength(256)
  q = '';

  @IsString()
  @MaxLength(32)
  sort = 'name';

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'asc';
}

export class CatalogListPageDto extends ListPageDto {
  @IsIn([
    'all',
    'internal',
    'technicalTools',
    'generatorParts',
    'services',
    'lowStock',
  ])
  group = 'all';
}

export class ClientListPageDto extends ListPageDto {
  @IsIn(['ALL', 'YES', 'NO'])
  inss = 'ALL';

  @IsIn(['ALL', 'YES', 'NO'])
  iss = 'ALL';

  @IsIn(['ALL', 'YES', 'NO'])
  delinquent = 'ALL';

  @IsIn(['ALL', 'YES', 'NO'])
  blocked = 'ALL';

  @IsIn(['ALL', 'CONTRACT', 'NO_CONTRACT'])
  contract: 'ALL' | 'CONTRACT' | 'NO_CONTRACT' = 'ALL';
}

export class EquipmentListPageDto extends ListPageDto {
  @IsIn(['ALL', 'CONTRACTED', 'NO_CONTRACT', 'ACTIVE_CONTRACT'])
  contract = 'ALL';

  @IsIn(['ALL', 'A', 'B', 'C'])
  criticality = 'ALL';

  @IsIn([
    'ALL',
    'OPERATING',
    'IN_MAINTENANCE',
    'STOPPED_BY_FAILURE',
    'DEACTIVATED',
    'AVAILABLE',
    'LEASED',
    'SCRAP',
  ])
  status = 'ALL';

  @IsIn(['ALL', 'OPEN', 'NONE'])
  tickets = 'ALL';
}

export function currentListPage(total: number, query: ListPageDto) {
  return Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
}
