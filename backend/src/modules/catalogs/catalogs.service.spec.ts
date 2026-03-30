import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { CatalogsService } from './catalogs.service';

describe('CatalogsService', () => {
  let service: CatalogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogsService, { provide: DatabaseService, useValue: {} }],
    }).compile();

    service = module.get<CatalogsService>(CatalogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
