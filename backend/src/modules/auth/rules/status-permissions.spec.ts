import { AccessPolicyGuard } from '../access-policy.guard';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
function check(
  path: string,
  method: string,
  status: string,
  required: string[],
  accessPolicy: unknown,
  accessRules?: unknown,
  role = 'LOGISTICS',
) {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const guard = new AccessPolicyGuard(reflector);
  const request = {
    path,
    method,
    body: { status },
    user: { sub: 'employee', role, accessPolicy, accessRules },
  };
  const context = {
    getHandler: () => check,
    getClass: () => AccessPolicyGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return () => guard.canActivate(context);
}
describe('status mutations cannot bypass action permissions', () => {
  it('cannot create a completed order with only create permission', () => {
    expect(
      check('/maintenance-orders', 'POST', 'COMPLETED', ['orders.create'], {
        orders: { create: true, finish: false },
      }),
    ).toThrow();
  });
  it('cannot finish through an update when the individual screen blocks finish', () => {
    expect(
      check(
        '/maintenance-orders/id',
        'PATCH',
        'COMPLETED',
        ['orders.update'],
        { orders: { update: true, finish: true } },
        {
          screens: {
            orders: { view: true, actions: { update: true, finish: false } },
          },
        },
      ),
    ).toThrow();
  });
  it('keeps opening an ordinary order independent of permission to finish it', () => {
    expect(
      check('/maintenance-orders', 'POST', 'OPEN', ['orders.create'], {
        orders: { create: true, finish: false },
      })(),
    ).toBe(true);
  });
  it('requires payment permission even if a payment status is submitted on creation', () => {
    expect(
      check('/finance/receivables', 'POST', 'PAID', ['finance.create'], {
        finance: { create: true, pay: false },
      }),
    ).toThrow();
  });
  it('keeps administrators unrestricted', () => {
    expect(
      check(
        '/maintenance-orders',
        'POST',
        'COMPLETED',
        ['orders.create'],
        {},
        undefined,
        'ADMIN',
      )(),
    ).toBe(true);
  });
  it('supports a read only chat even when the old policy only requires the dashboard', () => {
    expect(
      check(
        '/team/channels/id/messages',
        'POST',
        '',
        ['pages.dashboard'],
        { pages: { dashboard: true } },
        { screens: { team: { view: true, actions: { create: false } } } },
      ),
    ).toThrow();
  });
  it('requires an explicit send action for the delivery screen', () => {
    expect(
      check(
        '/deliveries',
        'POST',
        '',
        ['pages.dashboard'],
        { pages: { dashboard: true } },
        { screens: { deliveries: { view: true, actions: { create: true } } } },
      )(),
    ).toBe(true);
  });
});
