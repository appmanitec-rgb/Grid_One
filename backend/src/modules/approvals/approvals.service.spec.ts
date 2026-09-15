/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import {
  ApprovalStatus,
  ApprovalType,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService proposal decisions', () => {
  let service: ApprovalsService;
  let db: any;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          role: UserRole.ADMIN,
        }),
      },
      approvalRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'approval-1',
          type: ApprovalType.GENERATOR_PROPOSAL,
          entityType: 'PROPOSAL',
          entityId: 'proposal-1',
          requesterUserId: 'seller-1',
          approverUserId: 'admin-1',
          status: ApprovalStatus.PENDING,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'approval-1',
          status: ApprovalStatus.REJECTED,
        }),
      },
      proposal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'proposal-1',
          status: ProposalStatus.BOARD_REVIEW,
        }),
        update: jest.fn(),
      },
      proposalMovement: { create: jest.fn() },
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(db)),
    };
    audit = { record: jest.fn() };
    service = new ApprovalsService(db, audit as any);
  });

  it('treats a board rejection as definitive', async () => {
    await service.reject(
      'approval-1',
      'admin-1',
      'Cliente sem liberacao comercial.',
    );

    expect(db.proposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: ProposalStatus.REJECTED },
    });
    expect(db.proposalMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'GENERATOR_PROPOSAL_REJECTED',
          toStatus: ProposalStatus.REJECTED,
        }),
      }),
    );
  });

  it('keeps an adjustment request distinct from rejection', async () => {
    await service.requestAdjustments(
      'approval-1',
      'admin-1',
      'Incluir o item faltante no escopo.',
    );

    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApprovalStatus.ADJUSTMENTS_REQUESTED,
        }),
      }),
    );
    expect(db.proposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: ProposalStatus.REVISION_REQUIRED },
    });
    expect(db.proposalMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'GENERATOR_PROPOSAL_ADJUSTMENTS_REQUESTED',
          toStatus: ProposalStatus.REVISION_REQUIRED,
        }),
      }),
    );
  });

  it('rejects a decision without a meaningful reason', async () => {
    await expect(
      service.reject('approval-1', 'admin-1', 'nao'),
    ).rejects.toThrow('justificativa com pelo menos 5 caracteres');
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it('applies catalog pricing only when Finance approves it', async () => {
    db.approvalRequest.findUnique.mockResolvedValue({
      id: 'approval-price-1',
      type: ApprovalType.CATALOG_PRICING,
      entityType: 'CATALOG_ITEM',
      entityId: 'catalog-1',
      requesterUserId: 'buyer-1',
      approverUserId: 'admin-1',
      status: ApprovalStatus.PENDING,
      requestPayload: {
        supplierId: 'supplier-1',
        supplierName: 'Fornecedor Teste',
        purchaseInvoiceValue: 100,
        purchaseTaxMode: 'AMOUNT',
        purchaseTaxPercent: 0,
        purchaseTaxAmount: 10,
        freightAmount: 5,
        insuranceAmount: 0,
        discountAmount: 0,
        recoverableCreditAmount: 0,
        otherPurchaseCosts: 0,
        calculatedPurchaseCost: 115,
        icmsPercent: 18,
        pisPercent: 1.65,
        cofinsPercent: 7.6,
        ipiPercent: 0,
        issPercent: 0,
        irpjPercent: 0,
        csllPercent: 0,
        cppPercent: 0,
        salesTaxPercent: 27.25,
        commissionPercent: 2,
        profitMarginPercent: 20,
        operationalCostPercent: 3,
        suggestedSalePrice: 175.09,
        finalSalePrice: 175.09,
        setAsPrimary: true,
      },
    });
    db.approvalRequest.update.mockResolvedValue({
      id: 'approval-price-1',
      status: ApprovalStatus.APPROVED,
    });
    db.catalogItem = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'catalog-1',
        costPrice: 90,
        basePrice: 140,
        taxProfile: {},
      }),
      update: jest.fn(),
    };
    db.supplierCatalogItem = {
      updateMany: jest.fn(),
      upsert: jest.fn(),
    };
    db.catalogPriceRevision = { create: jest.fn() };

    await service.approve('approval-price-1', 'admin-1', 'Valores conferidos.');

    expect(db.catalogItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'catalog-1' },
        data: expect.objectContaining({
          costPrice: 115,
          basePrice: 175.09,
          taxPercentage: 27.25,
        }),
      }),
    );
    expect(db.catalogPriceRevision.create).toHaveBeenCalled();
  });

  it('applies only product parameters after Finance approval without requiring a supplier quote', async () => {
    db.approvalRequest.findUnique.mockResolvedValue({
      id: 'approval-parameters-1',
      type: ApprovalType.CATALOG_PRICING,
      entityType: 'CATALOG_ITEM',
      entityId: 'catalog-1',
      requesterUserId: 'buyer-1',
      approverUserId: 'admin-1',
      status: ApprovalStatus.PENDING,
      requestPayload: {
        changeKind: 'PARAMETERS',
        icmsPercent: 18,
        pisPercent: 1.65,
        cofinsPercent: 7.6,
        ipiPercent: 0,
        issPercent: 0,
        irpjPercent: 0,
        csllPercent: 0,
        cppPercent: 0,
        commissionPercent: 2,
        profitMarginPercent: 50,
        operationalCostPercent: 0,
      },
    });
    db.approvalRequest.update.mockResolvedValue({
      id: 'approval-parameters-1',
      status: ApprovalStatus.APPROVED,
    });
    db.catalogItem = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'catalog-1',
        costPrice: 100,
        basePrice: 120,
        taxProfile: {},
      }),
      update: jest.fn(),
    };

    await service.approve(
      'approval-parameters-1',
      'admin-1',
      'Parametros conferidos.',
    );

    expect(db.catalogItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'catalog-1' },
        data: expect.objectContaining({
          icmsPercent: 18,
          pisPercent: 1.65,
          cofinsPercent: 7.6,
          commissionPercent: 2,
          profitMargin: 50,
          taxPercentage: 27.25,
          basePrice: 179.25,
        }),
      }),
    );
    expect(db.supplierCatalogItem).toBeUndefined();
  });
});
