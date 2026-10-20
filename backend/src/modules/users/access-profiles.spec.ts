import { validateSync } from 'class-validator';
import { UserRole } from '@prisma/client';
import {
  listAccessProfiles,
  ACCESS_PROFILE_IDS,
  type AccessProfileId,
} from './access-profiles';
import { effectiveAccessPolicy } from './access-policy';
import { CreateUserDto } from './dto/create-user.dto';
import {
  assertScreen,
  assertOrderCreation,
  canReadBankBalances,
  readRules,
  ORDER_TYPES,
} from '../auth/rules/access-rules';

const profile = (id: AccessProfileId) =>
  listAccessProfiles().find((p) => p.id === id)!;
const actor = (id: AccessProfileId) => ({ sub: 'test', ...profile(id) });

describe('department access profiles', () => {
  it('provides seven independent, valid profiles without additional role grants', () => {
    expect(listAccessProfiles().map((p) => p.id)).toEqual(ACCESS_PROFILE_IDS);
    for (const p of listAccessProfiles()) {
      expect(effectiveAccessPolicy(p.role, p.accessPolicy)).toEqual(
        p.accessPolicy,
      );
      expect(p.accessPolicy.users.manageSecurity).toBe(false);
      expect(p.accessPolicy.settings.admin).toBe(false);
      expect(p.accessPolicy.studio.access).toBe(false);
      expect(Object.values(p.accessRules.commercial).some(Boolean)).toBe(false);
      expect(p.approvalDiscountLimit).toBe(0);
      const dto = Object.assign(new CreateUserDto(), {
        name: p.label,
        email: 'profile@example.test',
        password: 'TestPassword@2026',
        role: p.role,
        accessRules: p.accessRules,
      });
      expect(validateSync(dto)).toEqual([]);
      expect(readRules(p.accessRules).profileId).toBe(p.id);
      // Keep the authorization header below Node's standard 16 KiB limit.
      expect(
        (Buffer.byteLength(JSON.stringify({ ...p, access_token: undefined })) *
          4) /
          3,
      ).toBeLessThan(13000);
    }
    const first = profile('SUPPLIES');
    first.accessPolicy.inventory.adjust = false;
    first.accessRules.screens.inventory.actions.adjust = false;
    expect(profile('SUPPLIES').accessPolicy.inventory.adjust).toBe(true);
    expect(
      profile('SUPPLIES').accessRules.screens.inventory.actions.adjust,
    ).toBe(true);
  });
  it('separates purchasing, receiving, and approval', () => {
    expect(() =>
      assertScreen(actor('SUPPLIES'), 'purchases', 'receive'),
    ).not.toThrow();
    for (const action of ['create', 'approve', 'cancel'])
      expect(() =>
        assertScreen(actor('SUPPLIES'), 'purchases', action),
      ).toThrow();
    expect(profile('SUPPLIES').accessPolicy.purchaseOrders.approve).toBe(false);
    expect(profile('SUPPLIES').accessPolicy.purchaseOrders.create).toBe(false);
    expect(() =>
      assertScreen(actor('PURCHASING'), 'purchases', 'create'),
    ).not.toThrow();
    for (const action of ['receive', 'approve'])
      expect(() =>
        assertScreen(actor('PURCHASING'), 'purchases', action),
      ).toThrow();
    expect(profile('PURCHASING').accessPolicy.purchaseOrders.receive).toBe(
      false,
    );
    expect(profile('PURCHASING').accessPolicy.purchaseOrders.approve).toBe(
      false,
    );
  });
  it('allows administrative support without payment, banking, salaries or security', () => {
    const assistant = actor('ADMIN_ASSISTANT');
    for (const screen of [
      'payables',
      'receivables',
      'hrTime',
      'hrDocumentation',
    ])
      expect(() => assertScreen(assistant, screen, 'create')).not.toThrow();
    for (const screen of ['payables', 'receivables'])
      for (const action of ['pay', 'cancel', 'reconcile'])
        expect(() => assertScreen(assistant, screen, action)).toThrow();
    for (const screen of [
      'bankAccounts',
      'reconciliation',
      'cashFlow',
      'hrCommissions',
      'usersControl',
      'contracts',
      'renewals',
    ])
      expect(() => assertScreen(assistant, screen)).toThrow();
    expect(assistant.accessPolicy.people.viewSensitive).toBe(false);
    expect(assistant.accessPolicy.people.manageSensitive).toBe(false);
    expect(assistant.accessPolicy.finance.pay).toBe(false);
    expect(canReadBankBalances(assistant, true)).toBe(false);
    expect(canReadBankBalances(actor('FINANCE'), true)).toBe(true);
    expect(profile('HR').accessPolicy.people.manageSensitive).toBe(true);
  });
  it('restricts technicians to emergency creation within their own duty shift', () => {
    const tech = actor('TECHNICIAN');
    expect(tech.role).toBe(UserRole.TECHNICIAN);
    expect(tech.accessPolicy.tickets.view).toBe(false);
    expect(tech.accessPolicy.tickets.viewOwn).toBe(true);
    expect(() => assertOrderCreation(tech, 'EMERGENCY')).toThrow();
    tech.accessRules.onCallShifts = [
      { startsAt: '2026-10-23T21:00:00Z', endsAt: '2026-10-26T11:00:00Z' },
    ];
    for (const date of ['2026-10-23T21:00:00Z', '2026-10-25T12:00:00Z'])
      expect(() =>
        assertOrderCreation(tech, 'EMERGENCY', new Date(date)),
      ).not.toThrow();
    for (const date of ['2026-10-23T20:59:59Z', '2026-10-26T11:00:00Z'])
      expect(() =>
        assertOrderCreation(tech, 'EMERGENCY', new Date(date)),
      ).toThrow();
    for (const type of ORDER_TYPES.filter((t) => t !== 'EMERGENCY'))
      expect(() =>
        assertOrderCreation(tech, type, new Date('2026-10-24T01:00:00Z')),
      ).toThrow();
  });
  it('allows planning to create all task types without granting completion or finance', () => {
    const planning = actor('PLANNING');
    for (const type of ORDER_TYPES)
      expect(() => assertOrderCreation(planning, type)).not.toThrow();
    expect(() => assertScreen(planning, 'orders', 'dispatch')).not.toThrow();
    expect(() => assertScreen(planning, 'orders', 'finish')).toThrow();
    expect(() => assertScreen(planning, 'payables')).toThrow();
    expect(planning.accessPolicy.orders.finish).toBe(false);
    expect(planning.accessPolicy.finance.view).toBe(false);
  });
  it('accepts legacy rules, rejects unknown profile tags and leaves administrators unrestricted', () => {
    const dto = Object.assign(new CreateUserDto(), {
      name: 'Test',
      email: 'profile@example.test',
      password: 'TestPassword@2026',
      role: UserRole.NORMAL,
      accessRules: profile('ADMIN_ASSISTANT').accessRules,
    });
    delete dto.accessRules.profileId;
    expect(validateSync(dto)).toEqual([]);
    dto.accessRules.profileId = 'UNKNOWN';
    expect(validateSync(dto).some((e) => e.property === 'accessRules')).toBe(
      true,
    );
    const admin = { ...actor('ADMIN_ASSISTANT'), role: UserRole.ADMIN };
    expect(() => assertScreen(admin, 'payables', 'pay')).not.toThrow();
  });
});
