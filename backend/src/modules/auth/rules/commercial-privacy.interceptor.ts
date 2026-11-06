import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs';
import { RuleActor } from './access-rules';
import { Portfolio } from './access-rules';
import { managementAllowed } from './commercial-management';

const privateFields = new Set([
  'costPrice',
  'averageCost',
  'lastCost',
  'unitCost',
  'purchasePrice',
  'profitMargin',
  'profitMarginPercent',
  'marginPercent',
  'markup',
  'operationalCostPercent',
  'commissionPercent',
  'costSnapshot',
  'commercialEstimate',
  'effectiveUnitCost',
  'supplierPrice',
  'landedUnitCost',
  'costSnapshotJson',
]);
const marginFields = new Set([
  'profitMargin',
  'profitMarginPercent',
  'marginPercent',
  'markup',
]);
export function commercialVisibility(
  actor: RuleActor & { accessPolicy?: { catalog?: { viewCosts?: boolean } } },
  portfolio: Portfolio = 'partsServices',
) {
  const designated =
    (
      actor.accessRules as
        | { commercialManagement?: Record<string, { responsible?: boolean }> }
        | undefined
    )?.commercialManagement?.[portfolio]?.responsible === true;
  if (designated || actor.role === 'ADMIN' || actor.isSystemMaster)
    return {
      costs: managementAllowed(actor, portfolio, 'costs'),
      margins: managementAllowed(actor, portfolio, 'margins'),
    };
  const allowed =
    !['SALES', 'MANAGER', 'ENGINEER_APPLICATION', 'CLIENT'].includes(
      actor.role || '',
    ) && actor.accessPolicy?.catalog?.viewCosts === true;
  return { costs: allowed, margins: allowed };
}
export function stripCommercialCosts(
  value: unknown,
  visibility = { costs: false, margins: false },
): unknown {
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  )
    return value;
  if (Array.isArray(value))
    return value.map((item) => stripCommercialCosts(item, visibility));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !privateFields.has(key) ||
          (marginFields.has(key) ? visibility.margins : visibility.costs),
      )
      .map(([key, item]) => [key, stripCommercialCosts(item, visibility)]),
  );
}
@Injectable()
export class CommercialDataPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: RuleActor; params?: { resource?: string } }>();
    const portfolio = /commercialGenerator/.test(request.params?.resource || '')
      ? 'generators'
      : 'partsServices';
    const visibility = request.user
      ? commercialVisibility(request.user, portfolio)
      : { costs: false, margins: false };
    return next
      .handle()
      .pipe(map((value) => stripCommercialCosts(value, visibility)));
  }
}
// Raw commercial responses never carry costing; the scoped insights endpoint is
// the only source of proposal margins, including for administrators.
@Injectable()
export class CommercialPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const actor = context
      .switchToHttp()
      .getRequest<{ user?: RuleActor }>().user;
    return next
      .handle()
      .pipe(map((value) => (actor ? stripCommercialCosts(value) : value)));
  }
}
