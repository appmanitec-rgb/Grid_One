"use client";
import { useEffect, useState } from "react";
import { commercialFetch, Portfolio } from "@/lib/commercial-workspace";
import PublishedTemplatePicker from "./PublishedTemplatePicker";
export default function ProposalMessageTemplate({
  proposalId,
  onApply,
}: {
  proposalId: string;
  onApply: (value: { subject: string; body: string }) => void;
}) {
  const [context, setContext] = useState<{ portfolio: Portfolio }>();
  useEffect(() => {
    const controller = new AbortController();
    setContext(undefined);
    commercialFetch<{ portfolio: Portfolio }>(
      `/proposals/${proposalId}/context`,
      { signal: controller.signal },
    )
      .then(setContext)
      .catch(() => {});
    return () => controller.abort();
  }, [proposalId]);
  return context ? (
    <PublishedTemplatePicker
      proposalId={proposalId}
      portfolio={context.portfolio}
      onApply={onApply}
    />
  ) : null;
}
