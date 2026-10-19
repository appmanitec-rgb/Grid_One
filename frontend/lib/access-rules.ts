import { ACCESS_SCREENS } from "./access-screens";
import type { AccessPolicy } from "./access";
import { decodeJwtPayload, getStoredAccessToken } from "./auth-session";
export type DetailedAccessRules = {
  version: 1;
  screens: Record<string, { view: boolean; actions: Record<string, boolean> }>;
  commercial: {
    generators: boolean;
    partsServices: boolean;
    contracts: boolean;
  };
  orderTypes: Record<string, boolean>;
  onCallShifts: Array<{ startsAt: string; endsAt: string }>;
};
export function emptyRules(): DetailedAccessRules {
  return {
    version: 1,
    screens: {},
    commercial: { generators: false, partsServices: false, contracts: false },
    orderTypes: {},
    onCallShifts: [],
  };
}
export function getDetailedAccess() {
  const token = getStoredAccessToken();
  const payload = token ? decodeJwtPayload(token) : null;
  return {
    unrestricted: Boolean(payload?.isSystemMaster || payload?.role === "ADMIN"),
    rules: (payload?.accessRules as DetailedAccessRules) || emptyRules(),
    discountLimit: Number(payload?.approvalDiscountLimit || 0),
    role: payload?.role,
  };
}
export function canUsePortfolio(
  portfolio: keyof DetailedAccessRules["commercial"],
) {
  const access = getDetailedAccess();
  return access.unrestricted || access.rules.commercial?.[portfolio] === true;
}
export function canCreateOrderType(type: string) {
  const access = getDetailedAccess();
  if (access.unrestricted) return true;
  if (!access.rules.orderTypes?.[type]) return false;
  if (access.role !== "TECHNICIAN") return true;
  return (
    type === "EMERGENCY" &&
    access.rules.onCallShifts.some(
      (s) =>
        Date.parse(s.startsAt) <= Date.now() &&
        Date.now() < Date.parse(s.endsAt),
    )
  );
}
export function detailedPages(
  policy: AccessPolicy,
  raw?: unknown,
  unrestricted = false,
  client = false,
) {
  const rules = (raw as DetailedAccessRules) || emptyRules();
  const pages: Record<string, boolean> & AccessPolicy["pages"] = {
    ...policy.pages,
  };
  for (const screen of ACCESS_SCREENS)
    pages[screen.key] =
      unrestricted ||
      (rules.screens?.[screen.key]?.view ??
        (Object.keys(rules.screens || {}).length
          ? false
          : Boolean(policy.pages[screen.parent])));
  if (!unrestricted && !client && !rules.commercial?.contracts) {
    pages.contracts = false;
    pages.renewals = false;
  }
  return pages;
}
export function canScreenAction(screen: string, action: string) {
  const access = getDetailedAccess();
  if (access.unrestricted) return true;
  const rule = access.rules.screens?.[screen];
  return !rule || (rule.view && rule.actions[action] === true);
}
