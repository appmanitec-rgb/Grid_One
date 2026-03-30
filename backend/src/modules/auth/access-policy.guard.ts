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

type AuthenticatedUser = {
  sub: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: Record<string, unknown>;
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

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Autenticacao obrigatoria.');
    }

    if (user.isSystemMaster || user.role === 'ADMIN') {
      return true;
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
