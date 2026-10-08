import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { lerPreferencia, resolverTema, proximaPreferencia, SCRIPT_TEMA, CHAVE_TEMA, CHAVE_SIDEBAR } from "./tema.ts";

test("preferência inválida ou ausente vira sistema", () => {
  for (const v of [null, undefined, "", "dark", "CLARO", "{}"]) assert.equal(lerPreferencia(v), "sistema");
  assert.equal(lerPreferencia("escuro"), "escuro");
  assert.equal(lerPreferencia("claro"), "claro");
  assert.equal(lerPreferencia("sistema"), "sistema");
});
test("resolver respeita sistema só quando a preferência é sistema", () => {
  assert.equal(resolverTema("sistema", true), "dark");
  assert.equal(resolverTema("sistema", false), "light");
  assert.equal(resolverTema("claro", true), "light");
  assert.equal(resolverTema("escuro", false), "dark");
});
test("ciclo claro → escuro → sistema → claro", () => {
  assert.equal(proximaPreferencia("claro"), "escuro");
  assert.equal(proximaPreferencia("escuro"), "sistema");
  assert.equal(proximaPreferencia("sistema"), "claro");
});
test("script do head protege localStorage e usa a chave certa", () => {
  assert.match(SCRIPT_TEMA, /try\s*\{/);
  assert.ok(SCRIPT_TEMA.includes(CHAVE_TEMA));
  assert.match(SCRIPT_TEMA, /prefers-color-scheme: dark/);
});

function rodarScript(storage: "bloqueado" | Record<string, string>, sistemaEscuro: boolean) {
  const dataset: Record<string, string> = {};
  const localStorage =
    storage === "bloqueado"
      ? { getItem() { throw new Error("SecurityError"); } }
      : { getItem: (k: string) => storage[k] ?? null };
  const ctx = {
    document: { documentElement: { dataset } },
    window: { matchMedia: () => ({ matches: sistemaEscuro }) },
    localStorage,
  };
  vm.runInNewContext(SCRIPT_TEMA, ctx);
  return dataset;
}

test("script: localStorage bloqueado não lança e cai em sistema", () => {
  assert.deepEqual({ ...rodarScript("bloqueado", true) }, { theme: "dark", temaPref: "sistema", sidebar: "expanded" });
  assert.equal(rodarScript("bloqueado", false).theme, "light");
});
test("script: valor inválido salvo cai em sistema", () => {
  const d = rodarScript({ [CHAVE_TEMA]: "roxo" }, true);
  assert.equal(d.temaPref, "sistema");
  assert.equal(d.theme, "dark");
});
test("script: preferência válida vence o sistema; sidebar recolhida é lida", () => {
  const d = rodarScript({ [CHAVE_TEMA]: "claro", [CHAVE_SIDEBAR]: "collapsed" }, true);
  assert.equal(d.theme, "light");
  assert.equal(d.temaPref, "claro");
  assert.equal(d.sidebar, "collapsed");
});
