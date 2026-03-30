import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { MaintenanceOrdersController } from './maintenance-orders.controller';
import { MaintenanceOrdersService } from './maintenance-orders.service';

describe('MaintenanceOrdersController', () => {
  let controller: MaintenanceOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceOrdersController],
      providers: [{ provide: MaintenanceOrdersService, useValue: {} }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MaintenanceOrdersController>(
      MaintenanceOrdersController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
