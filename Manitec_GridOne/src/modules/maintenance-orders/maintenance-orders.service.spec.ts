import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceOrdersService } from './maintenance-orders.service';

describe('MaintenanceOrdersService', () => {
  let service: MaintenanceOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MaintenanceOrdersService],
    }).compile();

    service = module.get<MaintenanceOrdersService>(MaintenanceOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
