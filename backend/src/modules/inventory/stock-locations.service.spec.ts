import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service';
import {
  StockLocationsService,
  type StockLocationActor,
} from './stock-locations.service';
import { StockLocationsController } from './stock-locations.controller';
import { ACCESS_POLICY_METADATA_KEY } from '../auth/access-policy.decorator';
import { screenForApi } from '../auth/rules/screen-route';
describe('Warehouse position permissions and lookup privacy', () => {
  const db = {
    client: { findMany: jest.fn() },
    warehouseLocation: { findMany: jest.fn() },
  };
  const service = new StockLocationsService(db as unknown as DatabaseService);
  const viewer: StockLocationActor = {
    sub: 'operator',
    role: 'SUPPLIES',
    accessPolicy: {
      pages: { inventory: true },
      inventory: {
        view: true,
        adjust: false,
        reserve: false,
        create: false,
        update: false,
      },
    },
    accessRules: { screens: { stockLocations: { view: true, actions: {} } } },
  };
  it('separates consulting the position from changing counts or reservations', () => {
    expect(service.capabilities(viewer)).toMatchObject({
      view: true,
      adjust: false,
      reserve: false,
      update: false,
    });
    expect(() =>
      service.capabilities({ ...viewer, role: 'CLIENT', isSystemMaster: true }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.capabilities({
        ...viewer,
        accessRules: { screens: { inventory: { view: true, actions: {} } } },
      }),
    ).toThrow(ForbiddenException);
  });
  it('does not let a screen action override a denied base permission', () => {
    expect(
      service.capabilities({
        ...viewer,
        accessRules: {
          screens: {
            stockLocations: { view: true, actions: { adjust: true } },
          },
        },
      }).adjust,
    ).toBe(false);
  });
  it('maps all position API endpoints to their own screen', () => {
    expect(screenForApi('/inventory/locations/abc/count')).toBe(
      'stockLocations',
    );
    expect(screenForApi('/inventory/summary')).toBe('inventory');
  });
  it('limits client choices to ten and selects no contact, document or financial details', async () => {
    db.client.findMany.mockResolvedValue([
      { id: 'client', companyName: 'Cliente de teste', tradeName: null },
    ]);
    expect(
      await service.options(
        { kind: 'CLIENTS', q: 'teste' },
        {
          ...viewer,
          accessPolicy: {
            ...viewer.accessPolicy,
            inventory: { view: true, reserve: true },
          },
          accessRules: {
            screens: {
              stockLocations: { view: true, actions: { reserve: true } },
            },
          },
        },
      ),
    ).toEqual([{ id: 'client', label: 'Cliente de teste' }]);
    expect(db.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        select: { id: true, companyName: true, tradeName: true },
      }),
    );
  });
  it.each([
    ['create', 'inventory.create'],
    ['update', 'inventory.update'],
    ['place', 'inventory.update'],
    ['move', 'inventory.update'],
    ['unplace', 'inventory.update'],
    ['count', 'inventory.adjust'],
    ['reserve', 'inventory.reserve'],
    ['release', 'inventory.reserve'],
    ['transfer', 'inventory.reserve'],
    ['qrAccess', 'inventory.update'],
  ])('enforces the specific policy on %s', (method, policy) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      StockLocationsController.prototype,
      method,
    );
    expect(
      Reflect.getMetadata(
        ACCESS_POLICY_METADATA_KEY,
        descriptor!.value as object,
      ),
    ).toEqual([policy]);
  });
});
