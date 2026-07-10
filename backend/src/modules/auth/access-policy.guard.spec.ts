import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_POLICY_METADATA_KEY } from './access-policy.decorator';
import { AccessPolicyGuard } from './access-policy.guard';

function makeContext(user?: unknown): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AccessPolicyGuard', () => {
  let reflector: Reflector;
  let guard: AccessPolicyGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AccessPolicyGuard(reflector);
  });

  it('allows request when no access metadata is present', () => {
    const getAllAndOverride = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined as any);

    expect(guard.canActivate(makeContext())).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(
      ACCESS_POLICY_METADATA_KEY,
      expect.any(Array),
    );
  });

  it('blocks unauthenticated request when permission metadata exists', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['pages.catalog'] as any);

    expect(() => guard.canActivate(makeContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('allows admin user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['pages.catalog'] as any);

    expect(
      guard.canActivate(
        makeContext({
          role: 'ADMIN',
          accessPolicy: { pages: { catalog: false } },
        }),
      ),
    ).toBe(true);
  });

  it('blocks user without required access policy', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['pages.catalog'] as any);

    expect(() =>
      guard.canActivate(
        makeContext({
          role: 'SALES',
          accessPolicy: { pages: { catalog: false } },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows user with required access policy', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['pages.catalog'] as any);

    expect(
      guard.canActivate(
        makeContext({
          role: 'SALES',
          accessPolicy: { pages: { catalog: true } },
        }),
      ),
    ).toBe(true);
  });

  it('blocks finance endpoint when finance.view is missing', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['finance.view'] as any);

    expect(() =>
      guard.canActivate(
        makeContext({
          role: 'SALES',
          accessPolicy: {
            pages: { contracts: true },
            finance: { view: false },
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows finance endpoint when finance.view is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['finance.view'] as any);

    expect(
      guard.canActivate(
        makeContext({
          role: 'FINANCE',
          accessPolicy: { finance: { view: true } },
        }),
      ),
    ).toBe(true);
  });
});
