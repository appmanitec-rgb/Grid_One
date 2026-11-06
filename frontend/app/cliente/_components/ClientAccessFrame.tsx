import type { ReactNode } from "react";
import { AccessFrame } from "../../_components/AccessFrame";
export function ClientAccessFrame({ children }: { children: ReactNode }) {
  return <AccessFrame audience="client">{children}</AccessFrame>;
}
