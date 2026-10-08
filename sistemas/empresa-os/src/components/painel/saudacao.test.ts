import test from "node:test";
import assert from "node:assert/strict";
import { primeiroNome, saudacao } from "./saudacao.ts";

/* Âncoras com offset explícito (-03:00 = São Paulo) — os testes nunca
   dependem do fuso da máquina que roda a suite. */

test("saudacao: manhã em SP é bom dia", () => {
  assert.equal(saudacao(new Date("2026-08-26T08:00:00-03:00")), "Bom dia");
});

test("saudacao: 5h é a primeira hora do bom dia", () => {
  assert.equal(saudacao(new Date("2026-08-26T05:00:00-03:00")), "Bom dia");
});

test("saudacao: meio-dia vira boa tarde", () => {
  assert.equal(saudacao(new Date("2026-08-26T12:00:00-03:00")), "Boa tarde");
});

test("saudacao: 18h vira boa noite", () => {
  assert.equal(saudacao(new Date("2026-08-26T18:00:00-03:00")), "Boa noite");
});

test("saudacao: madrugada ainda é boa noite", () => {
  assert.equal(saudacao(new Date("2026-08-26T03:00:00-03:00")), "Boa noite");
});

test("saudacao: usa o fuso de SP, não o UTC do servidor", () => {
  // 13h UTC = 10h em São Paulo. Ler a hora em UTC diria "Boa tarde" — errado.
  assert.equal(saudacao(new Date("2026-08-26T13:00:00Z")), "Bom dia");
});

test("primeiroNome: corta no primeiro espaço", () => {
  assert.equal(primeiroNome("Marcos Paulo da Silva"), "Marcos");
});

test("primeiroNome: nome único fica como está", () => {
  assert.equal(primeiroNome("Marcos"), "Marcos");
});

test("primeiroNome: espaços em volta não viram nome", () => {
  assert.equal(primeiroNome("  Ana Clara  "), "Ana");
});
