import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { PortalPermission } from './portal-permissions';

function requiredPermission(path: string): PortalPermission | null {
  const route = path.replace(/^\/customer-portal\/?/, '');
  if (route === 'me' || route === 'dashboard') return null;
  if (route.startsWith('equipment/') && route.includes('/reports')) return 'REPORTS';
  if (route.startsWith('equipment') || route.startsWith('orders')) return 'EQUIPMENT';
  if (route.startsWith('contracts')) return 'CONTRACTS';
  if (route.startsWith('proposals')) return 'PROPOSALS';
  if (route.startsWith('tickets')) return 'TICKETS';
  if (route.startsWith('quote-requests')) return 'REQUESTS';
  if (route.startsWith('service-reports')) return 'REPORTS';
  if (route.startsWith('documents')) return 'DOCUMENTS';
  if (route.startsWith('financial')) return 'FINANCIAL';
  if (route.startsWith('feedback')) return 'FEEDBACK';
  throw new ForbiddenException('Area da central sem permissao configurada.');
}

@Injectable()
export class PortalPermissionGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = (req as any).user?.sub as string | undefined;
    const user = userId ? await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, portalPermissions: true, linkedClient: { select: { portalEnabled: true } } },
    }) : null;
    if (user?.role !== UserRole.CLIENT || !user.linkedClient?.portalEnabled) {
      throw new ForbiddenException('Central do cliente indisponivel.');
    }
    const permission = requiredPermission(req.path);
    if (permission && !user.portalPermissions.includes(permission)) {
      throw new ForbiddenException('Seu usuario nao possui acesso a esta area da central.');
    }
    return true;
  }
}
