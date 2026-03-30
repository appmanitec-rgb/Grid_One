import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TechniciansService } from './technicians.service';

describe('TechniciansService', () => {
  let service: TechniciansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TechniciansService,
        { provide: DatabaseService, useValue: {} },
      ],
    }).compile();

    service = module.get<TechniciansService>(TechniciansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
