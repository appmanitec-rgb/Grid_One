import { expect, test } from "@playwright/test";
import { technicalScopeSnapshotMatchesRequest, type TechnicalScopeRequest } from "../lib/technical-scopes";

const request: TechnicalScopeRequest = { type: "PARTS_AND_SERVICES", clientId: "client", generatorId: "generator", items: [
  { key: "new-part", kind: "PART_MATERIAL", catalogItemId: "part", quantity: 2 },
  { key: "new-service", kind: "CATALOG_SERVICE", catalogItemId: "service", quantity: 1 },
] };
const snapshot = { inputSnapshot: { proposalType: request.type, equipment: { clientId: "client", generatorId: "generator" }, items: [
  { key: "persisted-id-1", kind: "MATERIAL", catalogItemId: "part", description: "Nome oficial", quantity: 2 },
  { key: "persisted-id-2", kind: "SERVICE", catalogItemId: "service", description: "Nome oficial", quantity: 1 },
] } };

test("escopo salvo reconhece os mesmos itens por ID e quantidade, mesmo reordenados", () => {
  expect(technicalScopeSnapshotMatchesRequest(snapshot, request)).toBe(true);
  expect(technicalScopeSnapshotMatchesRequest(snapshot, { ...request, items: [...request.items].reverse() })).toBe(true);
});
test("mudanca de quantidade, exclusao, cliente ou equipamento exige nova revisao", () => {
  expect(technicalScopeSnapshotMatchesRequest(snapshot, { ...request, items: [{ ...request.items[0], quantity: 3 }, request.items[1]] })).toBe(false);
  expect(technicalScopeSnapshotMatchesRequest(snapshot, { ...request, items: request.items.slice(1) })).toBe(false);
  expect(technicalScopeSnapshotMatchesRequest(snapshot, { ...request, clientId: "outro" })).toBe(false);
  expect(technicalScopeSnapshotMatchesRequest(snapshot, { ...request, generatorId: undefined })).toBe(false);
});
test("registros legados sem snapshot continuam editaveis", () => {
  expect(technicalScopeSnapshotMatchesRequest(null, request)).toBe(true);
  expect(technicalScopeSnapshotMatchesRequest({}, request)).toBe(true);
});
test("horas e descricoes livres sao conferidas sem depender dos IDs de linha", () => {
  const hourly: TechnicalScopeRequest = { ...request, items: [{ key: "h", kind: "HOURLY_SERVICE", hours: 1.5, quantity: 1 }, { key: "o", kind: "OTHER", description: "Texto livre", quantity: 1 }] };
  const saved = { inputSnapshot: { ...snapshot.inputSnapshot, items: [{ key: "a", kind: "HOURLY", quantity: 2, hours: 1.5 }, { key: "b", kind: "OTHER", description: "Texto livre", quantity: 1 }] } };
  expect(technicalScopeSnapshotMatchesRequest(saved, hourly)).toBe(true);
  expect(technicalScopeSnapshotMatchesRequest(saved, { ...hourly, items: [{ ...hourly.items[0], hours: 2 }, hourly.items[1]] })).toBe(false);
  expect(technicalScopeSnapshotMatchesRequest(saved, { ...hourly, items: [hourly.items[0], { ...hourly.items[1], description: "Alterado" }] })).toBe(false);
});
