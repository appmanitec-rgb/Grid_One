import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';

describe('TechniciansController', () => {
  let controller: TechniciansController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TechniciansController],
      providers: [{ provide: TechniciansService, useValue: {} }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<TechniciansController>(TechniciansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
