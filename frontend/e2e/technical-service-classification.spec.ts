import { expect, test } from "@playwright/test";
import {
  technicalScopeRequestFingerprint,
  technicalScopeSnapshotMatchesRequest,
  storedTechnicalClassifications,
  type TechnicalScopeRequest,
} from "../lib/technical-scopes";

const base: TechnicalScopeRequest = {
  type: "PARTS_AND_SERVICES",
  clientId: "client",
  items: [{ key: "hourly-0", kind: "HOURLY_SERVICE", quantity: 1, hours: 2 }],
};
const snapshot = {
  inputSnapshot: {
    proposalType: "PARTS_AND_SERVICES",
    equipment: { clientId: "client" },
    items: [
      {
        key: "HOURLY:Servico por hora:1",
        kind: "HOURLY",
        quantity: 2,
        hours: 2,
        technical: {
          procedureCodes: ["SERV-TEST-NO-LOAD"],
          manualDescription: "",
        },
      },
    ],
  },
};

test("classification changes invalidate the preview fingerprint", () => {
  expect(
    technicalScopeRequestFingerprint({
      ...base,
      technicalScopeClassifications: [
        { sourceKey: "hours", procedureCodes: ["SERV-TEST-NO-LOAD"] },
      ],
    }),
  ).not.toBe(technicalScopeRequestFingerprint(base));
});
test("saved classification is available when reopening a commercial draft", () => {
  expect(storedTechnicalClassifications(snapshot)).toEqual([
    {
      sourceKey: "HOURLY:Servico por hora:1",
      procedureCodes: ["SERV-TEST-NO-LOAD"],
      manualDescription: "",
    },
  ]);
});
test("changing a reviewed service purpose marks its snapshot stale", () => {
  expect(
    technicalScopeSnapshotMatchesRequest(snapshot, {
      ...base,
      technicalScopeClassifications: [
        {
          sourceKey: "HOURLY:Servico por hora:1",
          procedureCodes: ["OTHER-PROCEDURE"],
        },
      ],
    }),
  ).toBe(false);
});
test("equivalent classification treats optional empty fields consistently", () => {
  expect(
    technicalScopeSnapshotMatchesRequest(snapshot, {
      ...base,
      technicalScopeClassifications: [
        {
          sourceKey: "HOURLY:Servico por hora:1",
          procedureCodes: ["SERV-TEST-NO-LOAD"],
        },
      ],
    }),
  ).toBe(true);
});
