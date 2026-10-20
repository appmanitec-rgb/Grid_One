import type { AccessPolicy } from "./access";
import type { DetailedAccessRules } from "./access-rules";

export type UserAccessProfile = {
  id: string;
  label: string;
  description: string;
  role: "SUPPLIES" | "HR" | "FINANCE" | "TECHNICIAN" | "LOGISTICS" | "NORMAL";
  department: string;
  approvalDiscountLimit: number;
  accessPolicy: AccessPolicy;
  accessRules: DetailedAccessRules;
};

export function accessProfileChanges(
  profile: UserAccessProfile | null,
  current: { role: string; accessRules?: DetailedAccessRules | null },
) {
  if (!profile) {
    const accessRules = current.accessRules
      ? structuredClone(current.accessRules)
      : undefined;
    if (accessRules) delete accessRules.profileId;
    return { accessRules };
  }
  const accessRules = structuredClone(profile.accessRules);
  if (profile.role === "TECHNICIAN" && current.role === "TECHNICIAN")
    accessRules.onCallShifts = structuredClone(
      current.accessRules?.onCallShifts ?? [],
    );
  return {
    role: profile.role,
    department: profile.department,
    approvalDiscountLimit: profile.approvalDiscountLimit,
    accessPolicy: structuredClone(profile.accessPolicy),
    accessRules,
  };
}
