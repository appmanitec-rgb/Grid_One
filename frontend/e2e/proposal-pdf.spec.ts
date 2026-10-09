import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test("proposta gera PDF operacional e PDF institucional válidos", async () => {
  test.setTimeout(120_000);
  const admin = await apiLogin(accounts.admin);
  const proposals = await apiRequest<Array<{ id: string; code: string }>>(admin.access_token, "/proposals");
  const proposal = proposals.find((item) => item.code === "90001/00") ?? proposals[0];
  expect(proposal?.id).toBeTruthy();

  for (const path of ["download-pdf", "download-document-pdf"]) {
    const response = await apiRequestRaw(admin.access_token, `/documents/proposals/${proposal!.id}/${path}`, { timeoutMs: 90_000 });
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.status, `${path}: ${body.toString("utf8").slice(0, 500)}`).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  }
});
