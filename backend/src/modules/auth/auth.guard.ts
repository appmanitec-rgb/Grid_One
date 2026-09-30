import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { allAccessPolicy, effectiveAccessPolicy } from '../users/access-policy';

type AuthPayload = {
  sub: string;
  mfaSetupRequired?: boolean;
};

const MFA_AUTH_ENABLED = process.env.MFA_AUTH_ENABLED === 'true';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(
        'Acesso negado: voce precisa estar logado.',
      );
    }

    let payload: AuthPayload;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(
        'Token invalido ou expirado. Faca login novamente.',
      );
    }

    const path = (request.path || request.url || '').toLowerCase();
    const requiresMfaSetup =
      MFA_AUTH_ENABLED && payload.mfaSetupRequired === true;
    const allowedWhenPendingSetup = path.startsWith('/auth/mfa');

    if (requiresMfaSetup && !allowedWhenPendingSetup) {
      throw new UnauthorizedException(
        'Configuracao de MFA obrigatoria para continuar.',
      );
    }

    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
        isSystemMaster: true,
        accessPolicy: true,
        linkedClientId: true,
      },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException(
        'Usuario indisponivel para autenticacao.',
      );
    }

    request['user'] = {
      ...payload,
      role: user.role,
      isSystemMaster: user.isSystemMaster,
      linkedClientId: user.linkedClientId,
      accessPolicy: user.isSystemMaster
        ? allAccessPolicy
        : effectiveAccessPolicy(user.role, user.accessPolicy),
    };
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
