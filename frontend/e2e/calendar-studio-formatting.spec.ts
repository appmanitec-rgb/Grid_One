import { expect, test } from "@playwright/test";
import { formatCalendarDate } from "../lib/formatters";
import {
  formatStudioValue,
  studioCsvValue,
} from "../app/dashboard/developer/data/resources";

test("calendar dates keep the stored day in every supported time zone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["America/Sao_Paulo", "UTC", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      expect(formatCalendarDate("2026-11-18T00:00:00.000Z")).toBe("18/11/2026");
      expect(formatCalendarDate("2026-11-04")).toBe("04/11/2026");
      expect(formatCalendarDate("2027-11-04T00:00:00Z")).toBe("04/11/2027");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("invalid calendar days are not silently shifted into another month", () => {
  expect(formatCalendarDate("2026-02-29")).toBe("-");
  expect(formatCalendarDate("2024-02-29")).toBe("29/02/2024");
  expect(formatCalendarDate("2026-13-01")).toBe("-");
  expect(formatCalendarDate("invalid")).toBe("-");
  expect(formatCalendarDate(null)).toBe("-");
});

test("Studio CSV preserves source codes, leading zeros and numeric precision", () => {
  const kind = {
    key: "hourType",
    label: "Tipo",
    options: [{ value: "CONTRACT", label: "Contrato" }],
  };
  expect(studioCsvValue("CONTRACT", kind)).toBe("CONTRACT");
  expect(formatStudioValue("CONTRACT", kind)).toBe("Contrato");
  const money = {
    key: "unitPrice",
    label: "Valor",
    format: "currency" as const,
  };
  expect(studioCsvValue("1234.567891", money)).toBe("1234.567891");
  expect(studioCsvValue("00157", { key: "agency", label: "Agência" })).toBe(
    "00157",
  );
  expect(studioCsvValue(null, money, true)).toBe("");
  expect(
    studioCsvValue(false, { key: "active", label: "Ativo", type: "boolean" }),
  ).toBe("Nao");
});

test("Studio shows business labels and pt-BR values without changing their source", () => {
  expect(
    formatStudioValue("CONTRACT", {
      key: "hourType",
      label: "Tipo",
      options: [{ value: "CONTRACT", label: "Contrato" }],
    }),
  ).toBe("Contrato");
  expect(
    formatStudioValue("JUNIOR_TECHNICIAN", {
      key: "technicianType",
      label: "Profissional",
      options: [{ value: "JUNIOR_TECHNICIAN", label: "Técnico júnior" }],
    }),
  ).toBe("Técnico júnior");
  expect(
    formatStudioValue("2.5", {
      key: "unitPrice",
      label: "Valor",
      type: "number",
      format: "currency",
    }),
  ).toMatch(/R\$\s*2,50/);
  expect(
    formatStudioValue(0, {
      key: "quantity",
      label: "Quantidade",
      type: "number",
    }),
  ).toBe("0");
  expect(
    formatStudioValue(2.5, {
      key: "quantity",
      label: "Quantidade",
      type: "number",
    }),
  ).toBe("2,5");
  expect(
    formatStudioValue(null, {
      key: "unitPrice",
      label: "Valor",
      format: "currency",
    }),
  ).toBe("-");
});
