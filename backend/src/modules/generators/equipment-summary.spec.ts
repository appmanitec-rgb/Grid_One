import { GeneratorsService } from './generators.service';
import { DatabaseService } from '../../database/database.service';
describe('Equipment order summary', () => {
  function setup(role = 'ADMIN') {
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            role,
            linkedClientId: 'client-a',
            technicianProfile: { id: 'tech-a' },
          }),
      },
      generator: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'machine-a', clientId: 'client-a' }),
      },
      maintenanceOrder: {
        count: jest.fn().mockResolvedValueOnce(14).mockResolvedValueOnce(8),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return {
      db,
      service: new GeneratorsService(db as unknown as DatabaseService),
    };
  }
  it('counts every pending and completed order while limiting the preview', async () => {
    const { db, service } = setup();
    const result = await service.orderSummary('machine-a', 'admin');
    expect(result).toEqual({
      pending: { total: 14, items: [] },
      completed: { total: 8, items: [] },
    });
    expect(db.maintenanceOrder.count.mock.calls[0][0].where.status).toEqual({
      in: ['OPEN', 'IN_PROGRESS'],
    });
    expect(db.maintenanceOrder.count.mock.calls[1][0].where.status).toBe(
      'COMPLETED',
    );
    expect(
      db.maintenanceOrder.findMany.mock.calls.every(
        ([query]) => query.take === 5,
      ),
    ).toBe(true);
  });
  it('limits technicians to their own orders', async () => {
    const { db, service } = setup('TECHNICIAN');
    await service.orderSummary('machine-a', 'technician');
    expect(
      db.maintenanceOrder.count.mock.calls.every(
        ([query]) => query.where.technicianId === 'tech-a',
      ),
    ).toBe(true);
    expect(
      db.maintenanceOrder.findMany.mock.calls.every(
        ([query]) => query.where.technicianId === 'tech-a',
      ),
    ).toBe(true);
  });
  it("does not expose another client's orders", async () => {
    const { db, service } = setup('CLIENT');
    db.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      linkedClientId: 'another-client',
      technicianProfile: null,
    });
    await expect(service.orderSummary('machine-a', 'client')).rejects.toThrow(
      'Gerador nao encontrado.',
    );
    expect(db.maintenanceOrder.count).not.toHaveBeenCalled();
  });
});
