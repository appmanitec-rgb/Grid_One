import { assertScreen, assertPortfolio } from './rules/access-rules';
import { screenForApi } from './rules/screen-route';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCESS_POLICY_METADATA_KEY,
  AccessPolicyKey,
} from './access-policy.decorator';

const STATUS_REQUIREMENTS: Record<string, Record<string, AccessPolicyKey>> = {
  orders: { COMPLETED: 'orders.finish', CANCELED: 'orders.cancel' },
  downtimes: {
    CLOSED: 'orders.finish',
    RESOLVED: 'orders.finish',
    CANCELED: 'orders.cancel',
  },
  warranties: { CLOSED: 'orders.finish', CANCELED: 'orders.cancel' },
  proposals: {
    WON: 'proposals.approve',
    APPROVED: 'proposals.approve',
    LOST: 'proposals.cancel',
    REJECTED: 'proposals.cancel',
  },
  contracts: { ACTIVE: 'contracts.activate', CANCELED: 'contracts.cancel' },
  renewals: { ACTIVE: 'contracts.activate', CANCELED: 'contracts.cancel' },
  tickets: {
    RESOLVED: 'tickets.resolve',
    CLOSED: 'tickets.close',
    CANCELED: 'tickets.cancel',
  },
  purchases: {
    APPROVED: 'purchaseOrders.approve',
    RECEIVED: 'purchaseOrders.receive',
    CANCELED: 'purchaseOrders.cancel',
  },
  receivables: {
    PAID: 'finance.pay',
    PARTIAL: 'finance.pay',
    CANCELED: 'finance.cancel',
  },
  payables: {
    PAID: 'finance.pay',
    PARTIAL: 'finance.pay',
    CANCELED: 'finance.cancel',
  },
};

type AuthenticatedUser = {
  sub: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: Record<string, unknown>;
  accessRules?: unknown;
};

@Injectable()
export class AccessPolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredKeys =
      this.reflector.getAllAndOverride<AccessPolicyKey[]>(
        ACCESS_POLICY_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredKeys.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      path?: string;
      url?: string;
      method?: string;
      body?: Record<string, unknown>;
    }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Autenticacao obrigatoria.');
    }

    if (user.isSystemMaster || user.role === 'ADMIN') {
      return true;
    }

    const screen = screenForApi(request.path || request.url || '');
    if (screen) {
      assertScreen(user, screen);
      if (screen === 'contracts' || screen === 'renewals')
        assertPortfolio(user, 'contracts');
      if (request.method && !['GET', 'HEAD'].includes(request.method)) {
        const status = request.body?.status;
        const statusPermission =
          typeof status === 'string'
            ? STATUS_REQUIREMENTS[screen]?.[status]
            : undefined;
        if (statusPermission) {
          assertScreen(user, screen, statusPermission.split('.')[1]);
          if (!this.hasPermission(user.accessPolicy, statusPermission))
            throw new ForbiddenException(
              'Seu perfil não possui permissão para esta mudança de estado.',
            );
        }
        const hasActionRequirement = requiredKeys.some(
          (key) =>
            !key.startsWith('pages.') &&
            !['view', 'viewOwn', 'access'].includes(key.split('.')[1]),
        );
        if (!hasActionRequirement && ['team', 'deliveries'].includes(screen)) {
          const action =
            request.method === 'DELETE'
              ? 'delete'
              : ['PATCH', 'PUT'].includes(request.method)
                ? 'update'
                : 'create';
          assertScreen(user, screen, action);
        }
        for (const key of requiredKeys) {
          if (key.startsWith('pages.')) continue;
          const action = key.split('.')[1];
          if (!['view', 'viewOwn', 'access'].includes(action))
            assertScreen(user, screen, action);
        }
      }
    }

    const hasAllPermissions = requiredKeys.every((key) =>
      this.hasPermission(user.accessPolicy, key),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para esta acao.',
      );
    }

    return true;
  }

  private hasPermission(
    accessPolicy: Record<string, unknown> | undefined,
    key: AccessPolicyKey,
  ): boolean {
    if (!accessPolicy) return false;

    const [scope, action] = key.split('.');
    const section = accessPolicy[scope] as Record<string, unknown> | undefined;
    return section?.[action] === true;
  }
}
