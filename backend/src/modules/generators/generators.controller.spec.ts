import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { GeneratorsController } from './generators.controller';
import { GeneratorsService } from './generators.service';

describe('GeneratorsController', () => {
  let controller: GeneratorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeneratorsController],
      providers: [{ provide: GeneratorsService, useValue: {} }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GeneratorsController>(GeneratorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
