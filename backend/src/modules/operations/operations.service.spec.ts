import { BadRequestException } from '@nestjs/common';
import { DowntimeStatus, WarrantyOwner, WarrantyStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { MaintenanceOrdersService } from '../maintenance-orders/maintenance-orders.service';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  const actorId = 'user-1';
  const actor = {
    id: actorId,
    name: 'Operador',
    role: 'ADMIN',
    isActive: true,
  };
  let service: OperationsService;
  let db: {
    user: { findUnique: jest.Mock };
    machineDowntime: { findUnique: jest.Mock; count: jest.Mock };
    warrantyCase: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(actor) },
      machineDowntime: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      warrantyCase: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new OperationsService(
      db as unknown as DatabaseService,
      {} as MaintenanceOrdersService,
    );
  });

  it('requires a resolution before restoring a machine', async () => {
    db.machineDowntime.findUnique.mockResolvedValue({
      id: 'stop-1',
      generatorId: 'generator-1',
      status: DowntimeStatus.IN_REPAIR,
      resolution: null,
      rootCause: null,
    });

    await expect(
      service.updateDowntime(
        'stop-1',
        { status: DowntimeStatus.RESTORED, note: 'Reparo concluido' },
        actorId,
      ),
    ).rejects.toThrow('Registre a solucao');
  });

  it('prevents reopening a case if another stop is active for the machine', async () => {
    db.machineDowntime.findUnique.mockResolvedValue({
      id: 'stop-1',
      generatorId: 'generator-1',
      status: DowntimeStatus.CLOSED,
      resolution: 'Resolvido',
      rootCause: 'Falha',
    });
    db.machineDowntime.count.mockResolvedValue(1);

    await expect(
      service.updateDowntime(
        'stop-1',
        { status: DowntimeStatus.TRIAGE, note: 'Falha voltou' },
        actorId,
      ),
    ).rejects.toThrow('Ja existe uma parada ativa');
  });

  it('requires our warranty and a supplier before waiting for one', async () => {
    db.warrantyCase.findUnique.mockResolvedValue({
      id: 'warranty-1',
      status: WarrantyStatus.TRIAGE,
      owner: WarrantyOwner.MANUFACTURER,
      supplierId: null,
      manufacturerId: null,
      coverageDecision: null,
      resolution: null,
    });

    await expect(
      service.updateWarranty(
        'warranty-1',
        {
          status: WarrantyStatus.WAITING_SUPPLIER,
          note: 'Enviado ao parceiro',
        },
        actorId,
      ),
    ).rejects.toThrow('exige um fornecedor vinculado');
    expect(db.warrantyCase.update).not.toHaveBeenCalled();
  });

  it('rejects invalid warranty stage jumps', async () => {
    db.warrantyCase.findUnique.mockResolvedValue({
      id: 'warranty-1',
      status: WarrantyStatus.OPEN,
      owner: WarrantyOwner.OUR,
    });

    await expect(
      service.updateWarranty(
        'warranty-1',
        { status: WarrantyStatus.RESOLVED, note: 'Tentativa de pular etapas' },
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
