import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

type AuthPayload = {
  sub: string;
  mfaSetupRequired?: boolean;
};

const MFA_AUTH_ENABLED = process.env.MFA_AUTH_ENABLED === 'true';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

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

    request['user'] = payload;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
