import assert from "node:assert/strict";
import test from "node:test";
import { buildProposalAccessoryWarnings } from "./proposal-assistance.ts";

const rule = {
  id: "hose-clamp",
  code: "MANGUEIRA",
  name: "Abraçadeira",
  description: "Confira a abraçadeira.",
  sortOrder: 1,
};

test("lembra abraçadeiras ausentes para mangueiras da proposta", () => {
  const warnings = buildProposalAccessoryWarnings(
    [rule],
    [{ name: "Mangueira de combustível", quantity: 2 }],
    [],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].missingQuantity, 2);
});

test("aceita acentos diferentes e considera a quantidade já adicionada", () => {
  const warnings = buildProposalAccessoryWarnings(
    [rule],
    [{ name: "MANGUEIRA", quantity: 2 }],
    [{ name: "ABRACADEIRAS de aço", quantity: 1 }],
  );
  assert.equal(warnings[0].missingQuantity, 1);
  assert.deepEqual(
    buildProposalAccessoryWarnings(
      [rule],
      [{ name: "MANGUEIRA", quantity: 2 }],
      [{ name: "Abraçadeira de aço", quantity: 2 }],
    ),
    [],
  );
});

test("não alerta quando a peça que dispara o lembrete foi removida", () => {
  assert.deepEqual(buildProposalAccessoryWarnings([rule], [], []), []);
});

test("muda a revisão quando o tipo de mangueira muda, mesmo com a mesma quantidade", () => {
  const first = buildProposalAccessoryWarnings([rule], [{ name: "Mangueira de combustível", quantity: 1 }], [])[0];
  const second = buildProposalAccessoryWarnings([rule], [{ name: "Mangueira de água", quantity: 1 }], [])[0];
  assert.notEqual(first.signature, second.signature);
});

test("respeita a quantidade de acessórios configurada por unidade", () => {
  const warnings = buildProposalAccessoryWarnings(
    [{ ...rule, sortOrder: 2 }],
    [{ name: "Mangueira hidráulica", quantity: 2 }],
    [{ name: "Abraçadeira", quantity: 3 }],
  );
  assert.equal(warnings[0].missingQuantity, 1);
});
