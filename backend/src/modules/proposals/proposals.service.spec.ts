import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountsReceivableStatus,
  ProposalHourType,
  ProposalItemKind,
  ProposalStatus,
  ProposalTechnicianType,
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
    proposal: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    proposalScopeTemplate: { findMany: jest.Mock };
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
    client: { findUnique: jest.Mock };
    site: { findUnique: jest.Mock };
    catalogItem: { findMany: jest.Mock };
    salesOpportunity: { findUnique: jest.Mock; update: jest.Mock };
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
    commissionRule: {
      findFirst: jest.Mock;
    };
    costCenterEntry: { create: jest.Mock };
    generator: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      proposal: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      proposalScopeTemplate: {
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      client: {
        findUnique: jest.fn(),
      },
      site: {
        findUnique: jest.fn(),
      },
      catalogItem: {
        findMany: jest.fn(),
      },
      salesOpportunity: {
        findUnique: jest.fn(),
        update: jest.fn(),
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
      commissionRule: {
        findFirst: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
      },
      generator: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
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

  it('blocks proposal creation when seller is not active sales user', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.salesOpportunity.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          clientId: 'client-1',
          userId: 'admin-1',
          type: ProposalType.SERVICES,
          items: [
            {
              kind: ProposalItemKind.HOURLY_SERVICE,
              description: 'Servico por hora',
              hourType: ProposalHourType.ONE_OFF,
              technicianType: ProposalTechnicianType.MID_LEVEL_TECHNICIAN,
              hours: 2,
              unitPrice: 300,
            },
          ],
        },
        'admin-1',
      ),
    ).rejects.toThrow(
      'Vendedor da proposta deve ser um usuario comercial ativo.',
    );

    expect(db.proposal.create).not.toHaveBeenCalled();
  });

  it('calculates hourly contract service with default 20 percent discount', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.salesOpportunity.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'seller-1' });
    db.catalogItem.findMany.mockResolvedValue([]);
    db.proposal.findMany.mockResolvedValue([]);
    db.proposal.create.mockResolvedValue({ id: 'proposal-1' });
    db.proposal.findUnique.mockResolvedValue({ id: 'proposal-1' });

    await service.create(
      {
        clientId: 'client-1',
        userId: 'seller-1',
        type: ProposalType.SERVICES,
        items: [
          {
            kind: ProposalItemKind.HOURLY_SERVICE,
            description: 'Hora contrato tecnico senior',
            hourType: ProposalHourType.CONTRACT,
            technicianType: ProposalTechnicianType.SENIOR_TECHNICIAN,
            hours: 5,
            unitPrice: 200,
          },
        ],
      },
      'admin-1',
    );

    expect(db.proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'seller-1',
          totalValue: 800,
          items: {
            create: [
              expect.objectContaining({
                kind: ProposalItemKind.HOURLY_SERVICE,
                hours: 5,
                unitPrice: 200,
                discountPercent: 20,
                totalPrice: 800,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('keeps old catalog item proposal compatible without new fields', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.salesOpportunity.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'seller-1' });
    db.catalogItem.findMany.mockResolvedValue([
      { id: 'catalog-1', type: 'PART', name: 'Filtro' },
    ]);
    db.proposal.findMany.mockResolvedValue([]);
    db.proposal.create.mockResolvedValue({ id: 'proposal-1' });
    db.proposal.findUnique.mockResolvedValue({ id: 'proposal-1' });

    await service.create(
      {
        clientId: 'client-1',
        userId: 'seller-1',
        type: ProposalType.PARTS,
        items: [{ catalogItemId: 'catalog-1', quantity: 2, unitPrice: 150 }],
      },
      'admin-1',
    );

    expect(db.proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalValue: 300,
          items: {
            create: [
              expect.objectContaining({
                kind: ProposalItemKind.PART_MATERIAL,
                catalogItemId: 'catalog-1',
                quantity: 2,
                totalPrice: 300,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('returns only active scope templates ordered by service', async () => {
    db.proposalScopeTemplate.findMany.mockResolvedValue([
      { id: 'scope-1', name: 'TOF' },
    ]);

    const result = await service.getScopeTemplates('FIELD_SERVICE');

    expect(result).toEqual([{ id: 'scope-1', name: 'TOF' }]);
    expect(db.proposalScopeTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('creates quick generator linked to selected client', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.client.findUnique.mockResolvedValue({ id: 'client-1' });
    db.generator.findUnique.mockResolvedValue(null);
    db.generator.create.mockResolvedValue({ id: 'generator-1' });

    await service.createQuickGenerator(
      {
        clientId: 'client-1',
        name: 'GMG proposta',
        brand: 'Stemac',
        modelName: 'G100',
        serialNumber: 'SN-20GB',
        power: 100,
      },
      'admin-1',
    );

    expect(db.generator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          name: 'GMG proposta',
          brand: 'Stemac',
          engineModelName: 'G100',
          power: 100,
        }),
      }),
    );
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
    db.commissionRule.findFirst.mockResolvedValue(null);

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
    db.commissionRule.findFirst.mockResolvedValue(null);

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
