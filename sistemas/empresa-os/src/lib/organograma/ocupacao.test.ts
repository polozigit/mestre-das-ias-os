import assert from "node:assert/strict";
import { test } from "node:test";

import { ocupacaoPorCargo, resumoOcupacao, rotuloOcupacao } from "./ocupacao.ts";
import type { Ocupante } from "./ocupacao.ts";

const ag = (posicao_id: number, cargo_slug: string, agente_name: string | null = "Ana IA"): Ocupante => ({
  posicao_id,
  cargo_slug,
  ocupante_tipo: "agente",
  agente_name,
});
const vz = (posicao_id: number, cargo_slug: string): Ocupante => ({
  posicao_id,
  cargo_slug,
  ocupante_tipo: "vazio",
  agente_name: null,
});
const pe = (posicao_id: number, cargo_slug: string): Ocupante => ({
  posicao_id,
  cargo_slug,
  ocupante_tipo: "pessoa",
  agente_name: null,
});

test("lista vazia: resumo zerado, mapa vazio e rótulo 'Vazio'", () => {
  assert.deepEqual(resumoOcupacao([]), { pessoa: 0, agente: 0, vazio: 0 });
  assert.equal(ocupacaoPorCargo([]).size, 0);
  assert.equal(rotuloOcupacao(undefined), "Vazio");
  assert.equal(rotuloOcupacao([]), "Vazio");
});

test("rótulo de uma posição", () => {
  assert.equal(rotuloOcupacao([ag(1, "ceo")]), "Agente: Ana IA");
  assert.equal(rotuloOcupacao([ag(1, "ceo", null)]), "Agente");
  assert.equal(rotuloOcupacao([pe(1, "ceo")]), "Pessoa");
  assert.equal(rotuloOcupacao([vz(1, "ceo")]), "Vazio");
});

test("duas posições no mesmo cargo: contagem por tipo", () => {
  assert.equal(rotuloOcupacao([ag(1, "ceo"), vz(2, "ceo")]), "2 posições: 1 agente, 1 vazia");
  assert.equal(rotuloOcupacao([pe(1, "ceo"), pe(2, "ceo"), vz(3, "ceo")]), "3 posições: 2 pessoas, 1 vazia");
  assert.equal(rotuloOcupacao([vz(1, "ceo"), vz(2, "ceo"), ag(3, "ceo"), ag(4, "ceo")]), "4 posições: 2 agentes, 2 vazias");
});

test("agrupa por cargo e resume", () => {
  const linhas = [ag(1, "ceo"), vz(2, "ceo"), pe(3, "cfo"), vz(4, "cmo")];
  const m = ocupacaoPorCargo(linhas);
  assert.equal(m.get("ceo")?.length, 2);
  assert.equal(m.get("cfo")?.length, 1);
  assert.deepEqual(resumoOcupacao(linhas), { pessoa: 1, agente: 1, vazio: 2 });
});
