import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TextosAtividade } from "@/lib/plano-textos";

/*
 * Render DE VERDADE do "Como fazer" do Cronograma: o componente (.tsx) é carregado pelos ganchos de teste
 * (JSX e atalhos "@/") e desenhado com react-dom/server. Aqui se prova o que o dono VÊ: cada campo
 * opcional vira o bloco certo quando existe e some quando não existe.
 */
register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { ComoFazer, ComoFazerRecolhivel } = await import("./ComoFazer.tsx");

const COMPLETO = {
  instrucao: "Crie as contas.",
  por_que: "Sem conta você não instala nada.",
  passos: ["Abra o ChatGPT", "Abra o GitHub", "Abra o Supabase"],
  comando: "Me ajude a criar as contas.\nUma de cada vez.",
  prova: "Você entra nas três contas.",
};
const html = (textos: TextosAtividade) => renderToStaticMarkup(createElement(ComoFazer, { textos }));

test("atividade completa: os cinco blocos aparecem, na ordem", () => {
  const h = html(COMPLETO);
  const ordem = ["Crie as contas.", "Por que importa", "Passo a passo", "Cole isto na sua IA", "Como saber que ficou pronto"].map((t) => h.indexOf(t));
  assert.ok(ordem.every((i) => i >= 0), `faltou bloco: ${ordem}`);
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "blocos fora de ordem");
});

test("passo a passo é uma lista numerada (<ol>) com um <li> por passo", () => {
  const h = html(COMPLETO);
  assert.match(h, /<ol [^>]*list-decimal[^>]*>/);
  assert.equal((h.match(/<li /g) ?? []).length, 3);
  assert.match(h, /<li [^>]*>Abra o ChatGPT<\/li>/);
});

test("o texto pronto vai num bloco de código com o botão Copiar, e as quebras de linha ficam", () => {
  const h = html(COMPLETO);
  assert.match(h, /<pre [^>]*><code>Me ajude a criar as contas\.\nUma de cada vez\.<\/code><\/pre>/);
  assert.match(h, /<button [^>]*type="button"[^>]*>[\s\S]*Copiar<\/button>/);
  assert.match(h, /role="status"/);
});

test("campo ausente não desenha o bloco: atividade antiga mostra só instrução e prova", () => {
  const h = html({ instrucao: "Atividade antiga.", prova: "Está pronto." });
  assert.match(h, /Atividade antiga\./);
  assert.match(h, /Como saber que ficou pronto/);
  for (const sumiu of ["Por que importa", "Passo a passo", "Cole isto na sua IA", "Copiar", "<pre", "<ol"]) {
    assert.ok(!h.includes(sumiu), `não devia aparecer: ${sumiu}`);
  }
});

test("sem nenhum texto, não desenha nada (nem o recolhível)", () => {
  assert.equal(html({}), "");
  assert.equal(renderToStaticMarkup(createElement(ComoFazerRecolhivel, { textos: {} })), "");
});

test("texto com HTML é escapado (um comando com <script> nunca roda)", () => {
  const h = html({ comando: '<script>alert("x")</script>', por_que: "<b>negrito</b>" });
  assert.ok(!h.includes("<script>"));
  assert.ok(!h.includes("<b>negrito"));
  assert.match(h, /&lt;script&gt;/);
});

test("recolhível: fechado por padrão e aberto só quando pedem", () => {
  const fechado = renderToStaticMarkup(createElement(ComoFazerRecolhivel, { textos: COMPLETO }));
  const aberto = renderToStaticMarkup(createElement(ComoFazerRecolhivel, { textos: COMPLETO, aberto: true }));
  assert.match(fechado, /<details /);
  assert.ok(!/<details [^>]*\bopen\b/.test(fechado), "devia nascer fechado");
  assert.match(aberto, /<details [^>]*\bopen\b/);
  assert.match(fechado, /Como fazer/);
});
