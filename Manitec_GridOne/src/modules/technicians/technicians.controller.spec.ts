import { Test, TestingModule } from '@nestjs/testing';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';

describe('TechniciansController', () => {
  let controller: TechniciansController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TechniciansController],
      providers: [TechniciansService],
    }).compile();

    controller = module.get<TechniciansController>(TechniciansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
