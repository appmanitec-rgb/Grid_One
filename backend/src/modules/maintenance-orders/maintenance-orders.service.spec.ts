import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MaintenanceOrdersService } from './maintenance-orders.service';

describe('MaintenanceOrdersService', () => {
  let service: MaintenanceOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceOrdersService,
        { provide: DatabaseService, useValue: {} },
        {
          provide: ApprovalsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MaintenanceOrdersService>(MaintenanceOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
