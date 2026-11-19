import test from "node:test";
import assert from "node:assert/strict";
import { iniciaNavegacaoInterna } from "./navegacao.ts";

const atual = "https://empresa.exemplo/inicio";
const clique = (href: string, extra: Partial<Parameters<typeof iniciaNavegacaoInterna>[0]> = {}) =>
  iniciaNavegacaoInterna({ href, atual, ...extra });

test("link pra outra página do sistema liga o fio de progresso", () => {
  assert.equal(clique("https://empresa.exemplo/tarefas"), true);
  assert.equal(clique("https://empresa.exemplo/inicio?sistema=1"), true);
});

test("mesma página (igual ou só com âncora) não liga: a chegada nunca viria", () => {
  assert.equal(clique("https://empresa.exemplo/inicio"), false);
  assert.equal(clique("https://empresa.exemplo/inicio#topo"), false);
});

test("link pra fora, download ou outra aba não liga", () => {
  assert.equal(clique("https://outro.exemplo/tarefas"), false);
  assert.equal(clique("https://empresa.exemplo/arquivo.pdf", { download: true }), false);
  assert.equal(clique("https://empresa.exemplo/tarefas", { target: "_blank" }), false);
  assert.equal(clique("https://empresa.exemplo/tarefas", { target: "_self" }), true);
});

test("clique com tecla, com outro botão ou já tratado não liga", () => {
  assert.equal(clique("https://empresa.exemplo/tarefas", { comTecla: true }), false);
  assert.equal(clique("https://empresa.exemplo/tarefas", { botao: 1 }), false);
  assert.equal(clique("https://empresa.exemplo/tarefas", { jaTratado: true }), false);
});

test("endereço que não é URL não liga (nem estoura)", () => {
  assert.equal(clique("javascript:void(0)"), false);
  assert.equal(clique(""), false);
});
