import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceOrdersController } from './maintenance-orders.controller';
import { MaintenanceOrdersService } from './maintenance-orders.service';

describe('MaintenanceOrdersController', () => {
  let controller: MaintenanceOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceOrdersController],
      providers: [MaintenanceOrdersService],
    }).compile();

    controller = module.get<MaintenanceOrdersController>(MaintenanceOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
