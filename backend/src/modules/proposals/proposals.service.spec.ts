import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountsReceivableStatus,
  ProposalStatus,
  ProposalType,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProposalsService } from './proposals.service';

describe('ProposalsService', () => {
  let service: ProposalsService;
  let auditLogsService: { record: jest.Mock };
  let db: {
    proposal: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    proposalMovement: { create: jest.Mock };
    serviceContract: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    contractInvoice: { createMany: jest.Mock };
    contractPreventiveSchedule: { createMany: jest.Mock };
    accountsReceivable: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    commissionEntry: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    costCenterEntry: { create: jest.Mock };
    generator: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      proposal: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      proposalMovement: {
        create: jest.fn(),
      },
      serviceContract: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      contractInvoice: {
        createMany: jest.fn(),
      },
      contractPreventiveSchedule: {
        createMany: jest.fn(),
      },
      accountsReceivable: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      commissionEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
      },
      generator: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)),
    };
    auditLogsService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: DatabaseService, useValue: db },
        {
          provide: ApprovalsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
      ],
    }).compile();

    service = module.get<ProposalsService>(ProposalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('blocks invalid status transition for common user', async () => {
    db.proposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.DRAFT,
    });
    db.user.findUnique.mockResolvedValue({ role: UserRole.NORMAL });

    await expect(
      service.update('p1', { status: ProposalStatus.WON }, 'u1'),
    ).rejects.toThrow('Transicao invalida no fluxo');
  });

  it('allows free status transition for admin user', async () => {
    db.proposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.DRAFT,
    });
    db.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
    db.proposal.update.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.WON,
    });

    const result = await service.update(
      'p1',
      { status: ProposalStatus.WON },
      'admin-1',
    );

    expect(result).toEqual({ id: 'p1', status: ProposalStatus.WON });
    expect(db.proposalMovement.create).toHaveBeenCalled();
  });

  it('records manual status movement when status changes', async () => {
    db.proposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.DRAFT,
    });
    db.user.findUnique.mockResolvedValue({ role: UserRole.NORMAL });
    db.proposal.update.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.BOARD_REVIEW,
    });

    await service.update(
      'p1',
      { status: ProposalStatus.BOARD_REVIEW },
      'user-1',
    );

    expect(db.proposalMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'MANUAL_STATUS_UPDATE',
          fromStatus: ProposalStatus.DRAFT,
          toStatus: ProposalStatus.BOARD_REVIEW,
        }),
      }),
    );
  });

  it('records audit log when won proposal is converted to contract', async () => {
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.proposal.findUnique.mockResolvedValue({
      id: 'proposal-1',
      code: 'PROP-00001',
      status: ProposalStatus.WON,
      type: ProposalType.CONTRACT,
      clientId: 'client-1',
      userId: 'seller-1',
      generatorId: 'generator-1',
      totalValue: 1200,
      generatedContract: null,
    });
    db.serviceContract.findMany.mockResolvedValue([]);
    db.serviceContract.create.mockResolvedValue({
      id: 'contract-1',
      code: 'CTR-00001',
      clientId: 'client-1',
      costCenterId: null,
      startDate,
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      dueDay: 10,
      recurringAmount: 1200,
    });
    db.serviceContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      code: 'CTR-00001',
      clientId: 'client-1',
      costCenterId: null,
      startDate,
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      dueDay: 10,
      recurringAmount: 1200,
      createdByUserId: 'seller-1',
      sourceProposal: { userId: 'seller-1' },
      equipments: [{ generatorId: 'generator-1' }],
    });
    db.accountsReceivable.findFirst.mockResolvedValue(null);
    db.accountsReceivable.create.mockResolvedValue({
      id: 'ar-1',
      status: AccountsReceivableStatus.OPEN,
    });
    db.commissionEntry.findFirst.mockResolvedValue(null);
    db.commissionEntry.create.mockResolvedValue({
      id: 'commission-1',
      amount: 24,
    });

    const result = await service.convertWonProposalToContract(
      'proposal-1',
      'admin-1',
    );

    expect(result.contract).toEqual(
      expect.objectContaining({ id: 'contract-1', code: 'CTR-00001' }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONVERT_TO_CONTRACT',
        entityType: 'PROPOSAL',
        entityId: 'proposal-1',
      }),
      db,
    );
    expect(db.accountsReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          contractId: 'contract-1',
          grossAmount: 1200,
          netAmount: 1200,
          status: AccountsReceivableStatus.OPEN,
        }),
      }),
    );
    expect(db.commissionEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'seller-1',
          receivableId: 'ar-1',
          contractId: 'contract-1',
          baseAmount: 1200,
          percent: 2,
          amount: 24,
        }),
      }),
    );
  });

  it('does not duplicate receivable when proposal contract automation finds one', async () => {
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.proposal.findUnique.mockResolvedValue({
      id: 'proposal-1',
      code: 'PROP-00001',
      status: ProposalStatus.WON,
      type: ProposalType.CONTRACT,
      clientId: 'client-1',
      userId: 'seller-1',
      generatorId: 'generator-1',
      totalValue: 1200,
      generatedContract: null,
    });
    db.serviceContract.findMany.mockResolvedValue([]);
    db.serviceContract.create.mockResolvedValue({
      id: 'contract-1',
      code: 'CTR-00001',
      clientId: 'client-1',
      costCenterId: null,
      startDate,
      endDate: new Date('2026-01-01T00:00:00.000Z'),
      dueDay: 10,
      recurringAmount: 1200,
    });
    db.serviceContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      code: 'CTR-00001',
      clientId: 'client-1',
      costCenterId: null,
      startDate,
      endDate: new Date('2026-01-01T00:00:00.000Z'),
      dueDay: 10,
      recurringAmount: 1200,
      createdByUserId: 'seller-1',
      sourceProposal: { userId: 'seller-1' },
      equipments: [{ generatorId: 'generator-1' }],
    });
    db.accountsReceivable.findFirst.mockResolvedValue({
      id: 'ar-existing',
      status: AccountsReceivableStatus.OPEN,
    });
    db.commissionEntry.findFirst.mockResolvedValue(null);
    db.commissionEntry.create.mockResolvedValue({
      id: 'commission-existing',
      amount: 24,
    });

    await service.convertWonProposalToContract('proposal-1', 'admin-1');

    expect(db.accountsReceivable.create).not.toHaveBeenCalled();
    expect(db.accountsReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ar-existing' },
        data: expect.objectContaining({
          contractId: 'contract-1',
          netAmount: 1200,
        }),
      }),
    );
  });
});
