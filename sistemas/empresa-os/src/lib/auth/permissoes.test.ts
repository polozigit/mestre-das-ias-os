import test from "node:test";
import assert from "node:assert/strict";
import { pode, podeEscrever, moduloDaRota, sessaoDoRpc, PERMISSAO_MODULO, MODULO_ROTA } from "./permissoes.ts";

const base = { eDono: false, permissoes: [] as string[] };

test("sem sessão ninguém pode nada, nem início", () => {
  assert.equal(pode(null, "inicio"), false);
});
test("logado sem slug só vê o início", () => {
  assert.equal(pode(base, "inicio"), true);
  for (const m of Object.keys(PERMISSAO_MODULO) as (keyof typeof PERMISSAO_MODULO)[]) {
    if (m !== "inicio") assert.equal(pode(base, m), false, m);
  }
});
test("dono pode tudo", () => {
  for (const m of Object.keys(PERMISSAO_MODULO) as (keyof typeof PERMISSAO_MODULO)[]) assert.equal(pode({ eDono: true, permissoes: [] }, m), true, m);
});
test("slug certo abre só o módulo dele", () => {
  const s = { eDono: false, permissoes: ["organograma.read"] };
  assert.equal(pode(s, "organograma"), true);
  assert.equal(pode(s, "tarefas"), false);
});
test("cronograma e tarefas usam tarefas.read", () => {
  const s = { eDono: false, permissoes: ["tarefas.read"] };
  assert.equal(pode(s, "cronograma"), true);
  assert.equal(pode(s, "tarefas"), true);
});
test("moduloDaRota casa prefixo e subrota, não casa vizinho", () => {
  assert.equal(moduloDaRota("/organograma"), "organograma");
  assert.equal(moduloDaRota("/tarefas/abc"), "tarefas");
  assert.equal(moduloDaRota("/tarefasx"), null);
  assert.equal(moduloDaRota("/login"), null);
});
test("toda rota de módulo é única", () => {
  const rotas = Object.values(MODULO_ROTA);
  assert.equal(new Set(rotas).size, rotas.length);
});
test("sessaoDoRpc trata vazio e permissoes null", () => {
  assert.equal(sessaoDoRpc(null), null);
  const s = sessaoDoRpc({ usuario_id: "u", nome: "N", email: "e@x", e_dono: false, senha_trocada_em: null, permissoes: null });
  assert.deepEqual(s?.permissoes, []);
});

test("podeEscrever: sem sessão não escreve", () => {
  assert.equal(podeEscrever(null, "tarefas.write"), false);
});
test("podeEscrever: só leitura não escreve", () => {
  assert.equal(podeEscrever({ eDono: false, permissoes: ["tarefas.read"] }, "tarefas.write"), false);
});
test("podeEscrever: slug write escreve, mas só o slug dele", () => {
  const s = { eDono: false, permissoes: ["tarefas.write"] };
  assert.equal(podeEscrever(s, "tarefas.write"), true);
  assert.equal(podeEscrever(s, "organograma.write"), false);
});
test("podeEscrever: dono escreve sem slug", () => {
  assert.equal(podeEscrever({ eDono: true, permissoes: [] }, "tarefas.write"), true);
});
