import { Test, TestingModule } from '@nestjs/testing';
import { ProposalStatus, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProposalsService } from './proposals.service';

describe('ProposalsService', () => {
  let service: ProposalsService;
  let db: {
    proposal: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    proposalMovement: { create: jest.Mock };
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
      $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)),
    };

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
          useValue: {
            record: jest.fn(),
          },
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
});
