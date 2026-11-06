import { test, expect } from "@playwright/test";
import { renderCommercialText } from "../lib/commercial-workspace";
import { completeDetailedAccessRules } from "../lib/access-rules";

test("perfis antigos sem seções obrigatórias abrem sem ganhar novas permissões", () => {
  const legacy = { commercial: { partsServices: true } };
  const normalized = completeDetailedAccessRules(
    legacy as Parameters<typeof completeDetailedAccessRules>[0],
  );
  expect(normalized.orderTypes.PREVENTIVE).toBeUndefined();
  expect(normalized.screens).toEqual({});
  expect(normalized.onCallShifts).toEqual([]);
  expect(normalized.commercial).toEqual({
    partsServices: true,
    generators: false,
    contracts: false,
  });
  expect(normalized.commercialManagement).toBeUndefined();
  expect(legacy).toEqual({ commercial: { partsServices: true } });
});

test("renderiza somente variáveis públicas e usa o preenchimento atual", () => {
  const body = "Olá {{cliente.nome}}. {{proposta.itens}} — {{cliente.nome}}";
  expect(
    renderCommercialText(body, {
      "cliente.nome": "Cliente atual",
      "proposta.itens": "Filtro\nÓleo",
    }),
  ).toBe("Olá Cliente atual. Filtro\nÓleo — Cliente atual");
  expect(renderCommercialText(body, { "cliente.nome": "Outro cliente" })).toBe(
    "Olá Outro cliente. Não informado — Outro cliente",
  );
});

test("não interpreta código nem permite custos ou observações internas", () => {
  for (const token of [
    "custos.total",
    "proposta.internalNotes",
    "constructor",
    "cliente.nome.toUpperCase()",
    "cliente.nome} lixo",
  ]) {
    expect(() => renderCommercialText(`{{${token}}}`, {})).toThrow();
  }
  expect(
    renderCommercialText("{{cliente.nome}}", {
      "cliente.nome": "{{custos.total}}",
    }),
  ).toBe("{{custos.total}}");
});
