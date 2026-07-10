import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  OpportunityTemperature,
  ProposalStatus,
  SalesOpportunityStage,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomerPortalService } from './customer-portal.service';

describe('CustomerPortalService', () => {
  let service: CustomerPortalService;
  let db: CustomerPortalDbMock;
  let auditLogsService: { record: jest.Mock };

  const clientUser = {
    id: 'user-a',
    name: 'Cliente A',
    email: 'cliente-a@example.com',
    role: UserRole.CLIENT,
    isActive: true,
    linkedClientId: 'client-a',
    linkedClient: {
      id: 'client-a',
      companyName: 'Cliente A Ltda',
      tradeName: 'Cliente A',
      email: 'contato@clientea.com',
      phone: '11999990000',
      contactName: 'Ana Cliente',
      city: 'Sao Paulo',
      state: 'SP',
      isDelinquent: false,
    },
  };

  beforeEach(async () => {
    auditLogsService = { record: jest.fn() };
    db = createDbMock();
    db.$transaction.mockImplementation(
      (cb: (tx: CustomerPortalDbMock) => unknown) => cb(db),
    );
    db.user.findUnique.mockResolvedValue(clientUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerPortalService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get(CustomerPortalService);
  });

  it('blocks client A from reading client B equipment', async () => {
    db.generator.findFirst.mockResolvedValue(null);

    await expect(service.getEquipment('user-a', 'equipment-b')).rejects.toThrow(
      NotFoundException,
    );

    expect(db.generator.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'equipment-b', clientId: 'client-a' },
      }),
    );
  });

  it('blocks client A from reading client B proposal', async () => {
    db.proposal.findFirst.mockResolvedValue(null);

    await expect(service.getProposal('user-a', 'proposal-b')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('blocks client A from approving client B proposal', async () => {
    db.proposal.findFirst.mockResolvedValue(null);

    await expect(
      service.approveProposal(
        'user-a',
        'proposal-b',
        {},
        { ip: '127.0.0.1', userAgent: 'jest' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(db.proposal.update).not.toHaveBeenCalled();
  });

  it('allows client to approve own proposal and records audit log', async () => {
    db.proposal.findFirst.mockResolvedValue({
      id: 'proposal-a',
      code: '00001/26',
      clientId: 'client-a',
      status: ProposalStatus.CLIENT_REVIEW,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
      salesOpportunityId: 'opp-a',
      customerDecisionAt: null,
    });
    db.proposal.update.mockResolvedValue({
      id: 'proposal-a',
      status: ProposalStatus.WON,
    });
    db.salesOpportunity.update.mockResolvedValue({});
    db.proposalMovement.create.mockResolvedValue({});

    const result = await service.approveProposal(
      'user-a',
      'proposal-a',
      { note: 'Aprovado' },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.proposal).toEqual({
      id: 'proposal-a',
      status: ProposalStatus.WON,
    });
    expect(db.proposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proposal-a' },
        data: expect.objectContaining({
          status: ProposalStatus.WON,
          customerDecisionByUserId: 'user-a',
          customerDecisionSource: 'CUSTOMER_PORTAL',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CUSTOMER_PORTAL_APPROVE',
        entityType: 'PROPOSAL',
        entityId: 'proposal-a',
      }),
      db,
    );
  });

  it('does not approve proposal already decided', async () => {
    db.proposal.findFirst.mockResolvedValue({
      id: 'proposal-a',
      clientId: 'client-a',
      status: ProposalStatus.WON,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
    });

    await expect(
      service.approveProposal('user-a', 'proposal-a', {}, {}),
    ).rejects.toThrow(BadRequestException);

    expect(db.proposal.update).not.toHaveBeenCalled();
  });

  it('allows client to reject own proposal and records audit log', async () => {
    db.proposal.findFirst.mockResolvedValue({
      id: 'proposal-a',
      code: '00001/26',
      clientId: 'client-a',
      status: ProposalStatus.CLIENT_REVIEW,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
      salesOpportunityId: null,
      customerDecisionAt: null,
    });
    db.proposal.update.mockResolvedValue({
      id: 'proposal-a',
      status: ProposalStatus.LOST,
    });
    db.proposalMovement.create.mockResolvedValue({});

    await service.rejectProposal(
      'user-a',
      'proposal-a',
      { note: 'Sem orcamento agora' },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(db.proposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProposalStatus.LOST,
          customerDecisionSource: 'CUSTOMER_PORTAL',
          customerDecisionNote: 'Sem orcamento agora',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CUSTOMER_PORTAL_REJECT' }),
      db,
    );
  });

  it('creates quote request as internal opportunity bound to own client', async () => {
    db.generator.findFirst.mockResolvedValue({
      id: 'equipment-a',
      name: 'Gerador A',
      serialNumber: 'SN-A',
      currentSiteId: 'site-a',
    });
    db.salesOpportunity.create.mockResolvedValue({
      id: 'opp-a',
      clientId: 'client-a',
      source: 'CUSTOMER_PORTAL',
    });

    await service.createQuoteRequest(
      'user-a',
      {
        equipmentId: 'equipment-a',
        serviceType: 'Corretiva',
        description: 'Gerador apresentou falha intermitente na partida.',
        urgency: 'HIGH',
        contactName: 'Ana Cliente',
        contactPhone: '11999990000',
      },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(db.salesOpportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-a',
          siteId: 'site-a',
          source: 'CUSTOMER_PORTAL',
          stage: SalesOpportunityStage.PROSPECTION,
          temperature: OpportunityTemperature.HOT,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CUSTOMER_PORTAL_QUOTE_REQUEST',
        entityType: 'SALES_OPPORTUNITY',
      }),
      db,
    );
  });

  it('blocks client user without linked client', async () => {
    db.user.findUnique.mockResolvedValue({
      ...clientUser,
      linkedClientId: null,
      linkedClient: null,
    });

    await expect(service.me('user-a')).rejects.toThrow(ForbiddenException);
  });

  it('blocks internal user from customer portal', async () => {
    db.user.findUnique.mockResolvedValue({
      ...clientUser,
      role: UserRole.ADMIN,
      linkedClientId: null,
      linkedClient: null,
    });

    await expect(service.me('admin-1')).rejects.toThrow(ForbiddenException);
  });
});

function createDbMock(): CustomerPortalDbMock {
  return {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    generator: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    proposal: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    proposalMovement: { create: jest.fn() },
    salesOpportunity: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    serviceContract: { count: jest.fn() },
    maintenanceOrder: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    documentDelivery: { findMany: jest.fn() },
    contractPreventiveSchedule: { findMany: jest.fn() },
    accountsReceivable: { findMany: jest.fn() },
    site: { findFirst: jest.fn() },
  };
}

type CustomerPortalDbMock = {
  $transaction: jest.Mock;
  user: { findUnique: jest.Mock };
  generator: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  proposal: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  proposalMovement: { create: jest.Mock };
  salesOpportunity: {
    count: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  serviceContract: { count: jest.Mock };
  maintenanceOrder: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  documentDelivery: { findMany: jest.Mock };
  contractPreventiveSchedule: { findMany: jest.Mock };
  accountsReceivable: { findMany: jest.Mock };
  site: { findFirst: jest.Mock };
};
