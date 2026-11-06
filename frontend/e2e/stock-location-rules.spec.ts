import { expect, test } from "@playwright/test";
import { stockOperationKey } from "../lib/stock-operation-key";
import { stockLocationReturnPath } from "../lib/stock-location-return";
test("QR return is limited to a position route, never an external or arbitrary destination", () => {
  const path =
    "/dashboard/inventory/locations/11111111-1111-4111-8111-111111111111";
  expect(stockLocationReturnPath(path)).toBe(path);
  for (const value of [
    "https://evil.invalid" + path,
    "//evil.invalid" + path,
    "/dashboard/management/users",
    path + "?next=//evil.invalid",
    path + "/../../users",
    "javascript:alert(1)",
    "",
  ])
    expect(stockLocationReturnPath(value)).toBeNull();
});
test("warehouse confirmations work when randomUUID is missing on an HTTP LAN connection", () => {
  const random = (buffer: Uint8Array) => {
    buffer.fill(31);
    return buffer;
  };
  expect(stockOperationKey({ getRandomValues: random })).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(
    stockOperationKey({
      randomUUID: () => "native-key",
      getRandomValues: random,
    }),
  ).toBe("native-key");
});
