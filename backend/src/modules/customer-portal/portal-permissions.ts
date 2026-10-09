import { BadRequestException } from '@nestjs/common';

export const PORTAL_PERMISSIONS = [
  'EQUIPMENT', 'CONTRACTS', 'PROPOSALS', 'TICKETS', 'REQUESTS',
  'REPORTS', 'DOCUMENTS', 'FINANCIAL', 'FEEDBACK',
] as const;

export type PortalPermission = (typeof PORTAL_PERMISSIONS)[number];

export function normalizePortalPermissions(value?: string[]): string[] {
  if (value === undefined) return [...PORTAL_PERMISSIONS];
  if (!Array.isArray(value) || value.some((item) => !PORTAL_PERMISSIONS.includes(item as PortalPermission))) {
    throw new BadRequestException('Permissoes da central invalidas.');
  }
  return [...new Set(value)];
}
