import { Test, TestingModule } from '@nestjs/testing';
import { GeneratorsController } from './generators.controller';
import { GeneratorsService } from './generators.service';

describe('GeneratorsController', () => {
  let controller: GeneratorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeneratorsController],
      providers: [GeneratorsService],
    }).compile();

    controller = module.get<GeneratorsController>(GeneratorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
