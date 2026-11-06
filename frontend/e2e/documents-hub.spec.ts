import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

const documentStatuses = new Set(["CLIENT_REVIEW", "WON", "LOST", "SENT", "APPROVED"]);

test("central documental mostra somente propostas liberadas pela diretoria", async () => {
  const admin = await apiLogin(accounts.admin);
  const proposals = await apiRequest<Array<{ id: string; status: string }>>(
    admin.access_token,
    "/proposals",
  );
  const hub = await apiRequest<{
    sections: { proposals: Array<{ id: string; status: string }> };
  }>(admin.access_token, "/documents/hub");

  const eligible = proposals.filter((item) => documentStatuses.has(item.status));
  expect(hub.sections.proposals.map((item) => item.id).sort())
    .toEqual(eligible.map((item) => item.id).sort());
  expect(hub.sections.proposals.every((item) => documentStatuses.has(item.status))).toBe(true);

  const draft = proposals.find((item) => item.status === "DRAFT");
  if (draft) {
    const response = await apiRequestRaw(
      admin.access_token,
      "/documents/proposals/" + draft.id,
    );
    expect(response.status).toBe(403);
  }
});