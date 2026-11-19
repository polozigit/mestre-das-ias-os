import test from "node:test";
import assert from "node:assert/strict";
import { numeroContado } from "./numero-contado.ts";

test("inteiro simples e porcentagem contam até o valor", () => {
  assert.deepEqual(numeroContado(34), { ate: 34, sufixo: "" });
  assert.deepEqual(numeroContado("7"), { ate: 7, sufixo: "" });
  assert.deepEqual(numeroContado("41%"), { ate: 41, sufixo: "%" });
  assert.deepEqual(numeroContado(" 9999 "), { ate: 9999, sufixo: "" });
});

test("zero, moeda, milhar, decimal e texto ficam parados", () => {
  for (const v of [0, "0", "0%", "R$ 1.234,50", "12.345", "3,5", "10000", "-4", "007", "12 de 17", "", "—"]) {
    assert.equal(numeroContado(v), null, `não deveria contar: ${JSON.stringify(v)}`);
  }
});
