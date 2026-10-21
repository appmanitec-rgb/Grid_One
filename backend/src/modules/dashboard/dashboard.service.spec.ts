import type { DatabaseService } from '../../database/database.service';
import type { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardService, dashboardAudience } from './dashboard.service';
import { listAccessProfiles } from '../users/access-profiles';
import { allAccessPolicy } from '../users/access-policy';
const preset = (id: string) => {
  const p = listAccessProfiles().find((p) => p.id === id)!;
  return {
    sub: 'actor',
    role: p.role,
    accessPolicy: p.accessPolicy,
    accessRules: p.accessRules,
  };
};
function fixture(role = 'SUPPLIES', department = 'Suprimentos') {
  const empty = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
    create: jest.fn(),
  });
  const store = {
    user: {
      ...empty(),
      findUnique: jest.fn().mockResolvedValue({ role, department }),
    },
    purchaseOrder: empty(),
    maintenanceOrder: empty(),
    maintenanceOrderMaterial: empty(),
    inventoryBalance: empty(),
    catalogItem: empty(),
    catalogItemIdentifier: empty(),
    hrAssetAssignment: empty(),
    procurementRequest: empty(),
    procurementQuote: empty(),
    accountsPayable: empty(),
    accountsReceivable: empty(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const db = {
    ...store,
    $transaction: jest.fn((fn: (tx: typeof store) => Promise<unknown>) =>
      fn(store),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return {
    db,
    audit,
    service: new DashboardService(
      db as unknown as DatabaseService,
      audit as unknown as AuditLogsService,
    ),
  };
}
describe('dashboard por usuario', () => {
  it('mantem diretores e administradores na visao gerencial e separa os demais perfis', () => {
    expect(dashboardAudience('ADMIN', 'Suprimentos')).toBe('EXECUTIVE');
    expect(dashboardAudience('MANAGER', 'Diretoria')).toBe('EXECUTIVE');
    expect(dashboardAudience('NORMAL', 'Almoxarifado')).toBe('SUPPLIES');
    expect(dashboardAudience('FINANCE', 'Financeiro')).toBe('DEPARTMENT');
    expect(dashboardAudience('SALES', 'Comercial')).toBe('COMMERCIAL');
  });
  it('nao consulta financeiro nem dados comerciais para Suprimentos e desconta reservas no minimo', async () => {
    const { db, service } = fixture();
    db.inventoryBalance.findMany.mockResolvedValue([
      {
        id: 'b',
        physicalQty: 10,
        reservedQty: 4,
        minQty: 8,
        catalogItem: { id: 'i', name: 'Filtro', unit: 'UN' },
        warehouse: { name: 'Central' },
      },
    ]);
    const result = await service.overview(preset('SUPPLIES'));
    expect(result.audience).toBe('SUPPLIES');
    expect(result.metrics.find((m) => m.id === 'low-stock')?.value).toBe(1);
    expect(
      result.sections.find((s) => s.id === 'stock')?.items[0].subtitle,
    ).toContain('6');
    expect(db.accountsPayable.count).not.toHaveBeenCalled();
    expect(db.accountsReceivable.count).not.toHaveBeenCalled();
    expect(db.procurementQuote.count).not.toHaveBeenCalled();
    expect(result.canViewCommercial).toBe(false);
  });
  it('nao expande acesso quando a tela de estoque foi explicitamente negada', async () => {
    const { db, service } = fixture(),
      actor = preset('SUPPLIES');
    actor.accessRules.screens.inventory = { view: false, actions: {} };
    const result = await service.overview(actor);
    expect(db.inventoryBalance.findMany).not.toHaveBeenCalled();
    expect(db.maintenanceOrder.findMany).not.toHaveBeenCalled();
    expect(db.hrAssetAssignment.findMany).not.toHaveBeenCalled();
    expect(result.canSeparate).toBe(false);
  });
  it('solicitantes comuns so consultam as proprias necessidades', async () => {
    const { db, service } = fixture('NORMAL', 'Administracao');
    await service.overview(preset('ADMIN_ASSISTANT'));
    expect(db.procurementRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ requesterId: 'actor' }),
    });
    expect(db.purchaseOrder.findMany).not.toHaveBeenCalled();
  });
  it('tecnicos so consultam as ordens atribuidas ao proprio usuario', async () => {
    const { db, service } = fixture('TECHNICIAN', 'Tecnico');
    await service.overview(preset('TECHNICIAN'));
    expect(db.maintenanceOrder.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ technician: { userId: 'actor' } }),
    });
  });
  it('nao expoe dados de colaboradores nem documentos no resumo de EPIs', async () => {
    const { db, service } = fixture();
    db.hrAssetAssignment.findMany.mockResolvedValue([
      {
        id: 'e',
        title: 'Capacete',
        expiresAt: new Date('2026-01-01'),
        status: 'ACTIVE',
        userId: 'segredo',
        signedTermUrl: 'termo-privado',
        user: { name: 'Pessoa privada' },
      },
    ]);
    const result = await service.overview(preset('SUPPLIES'));
    expect(JSON.stringify(result)).not.toMatch(
      /segredo|termo-privado|Pessoa privada|signedTermUrl|userId/,
    );
  });
  it('confirmar separacao e idempotente e nao realiza movimentacao nem consumo', async () => {
    const { db, audit, service } = fixture();
    const row = {
      id: 'm',
      orderId: 'o',
      catalogItemId: 'i',
      reservedAt: new Date(),
      appliedAt: null,
      separatedAt: null,
      order: { status: 'OPEN' },
      catalogItem: { type: 'PART' },
    };
    db.maintenanceOrderMaterial.findUnique.mockImplementation(() =>
      Promise.resolve(row),
    );
    db.maintenanceOrderMaterial.update.mockImplementation(
      ({ data }: { data: { separatedAt: Date } }) =>
        Promise.resolve(Object.assign(row, data)),
    );
    await service.separate('m', preset('SUPPLIES'));
    await service.separate('m', preset('SUPPLIES'));
    expect(db.maintenanceOrderMaterial.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(db.inventoryBalance.update).not.toHaveBeenCalled();
  });
  it('impede confirmar material sem reserva ou sem permissao', async () => {
    const { db, service } = fixture();
    db.maintenanceOrderMaterial.findUnique.mockResolvedValue({
      order: { status: 'OPEN' },
      catalogItem: { type: 'PART' },
      reservedAt: null,
    });
    await expect(
      service.separate('m', preset('SUPPLIES')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.separate('m', preset('ADMIN_ASSISTANT')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.maintenanceOrderMaterial.update).not.toHaveBeenCalled();
  });
  it('visao gerencial agrega os departamentos permitidos', async () => {
    const { db, service } = fixture('ADMIN', 'Administracao');
    await service.overview({
      sub: 'actor',
      role: 'ADMIN',
      accessPolicy: allAccessPolicy,
    });
    expect(db.accountsPayable.count).toHaveBeenCalled();
    expect(db.inventoryBalance.findMany).toHaveBeenCalled();
    expect(db.purchaseOrder.count).toHaveBeenCalled();
  });
});
