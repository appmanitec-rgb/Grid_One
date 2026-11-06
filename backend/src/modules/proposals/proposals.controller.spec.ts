import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { CommercialScopeGuard } from '../auth/rules/commercial-scope.guard';
import { TechnicalScopesService } from '../technical-scopes/technical-scopes.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

describe('ProposalsController', () => {
  let controller: ProposalsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProposalsController],
      providers: [
        { provide: ProposalsService, useValue: {} },
        { provide: TechnicalScopesService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(AccessPolicyGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(CommercialScopeGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ProposalsController>(ProposalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
