import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { montarCronograma, passoAtual, type ItemCronograma } from "../../lib/cronograma.ts";

/*
 * Render DE VERDADE das duas telas do Cronograma (passo a passo do curso e linha do tempo dos 90 dias),
 * com dados de teste: o que o aluno vê com e sem "mostrar canceladas", onde o "Como fazer" aparece e qual
 * passo nasce aberto. Os componentes (.tsx) entram pelos ganchos de teste e saem como HTML.
 */
register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { PassoAPasso } = await import("./PassoAPasso.tsx");
const { LinhaDoTempo } = await import("./LinhaDoTempo.tsx");

const TEXTOS = { instrucao: "Faça isto.", por_que: "Porque sim.", passos: ["um", "dois"], comando: "cole isto", prova: "Está pronto." };
const item = (
  tarefa_id: string,
  titulo: string,
  status: string,
  extra: Partial<ItemCronograma> = {},
): ItemCronograma => ({
  tarefa_id, titulo, status, trilha: "curso", fase: "D1", prazo_previsto_em: null, ordem: Number(tarefa_id.replace(/\D/g, "")) || 0, textos: TEXTOS, ...extra,
});
const ITENS = [
  item("t1", "Criar as contas", "CONCLUIDA"),
  item("t2", "Ligar os conectores", "EM_ANDAMENTO"),
  item("t3", "Rodar o instalador", "BACKLOG"),
  item("t4", "Passo descartado", "CANCELADA"),
  item("p1", "Rodar o painel", "BACKLOG", { trilha: "plano90", fase: "clareza" }),
  item("p2", "Medida velha", "CANCELADA", { trilha: "plano90", fase: "clareza" }),
];
const trilhas = montarCronograma(ITENS, "2026-10-07");
const [curso, noventa] = trilhas;
const abertoId = passoAtual(trilhas)?.item.tarefa_id;
const doCurso = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(PassoAPasso, { trilha: curso, abertoId, ...props }));
const dos90 = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(LinhaDoTempo, { trilha: noventa, abertoId, ...props }));

test("o passo a passo esconde o passo cancelado por padrão e mostra (riscado) quando o dono pede", () => {
  assert.ok(!doCurso().includes("Passo descartado"));
  const com = doCurso({ mostrarCanceladas: true });
  assert.match(com, /Passo descartado/);
  assert.match(com, /line-through/);
});

test("a linha do tempo dos 90 dias também esconde a cancelada por padrão", () => {
  assert.ok(!dos90().includes("Medida velha"));
  assert.match(dos90({ mostrarCanceladas: true }), /Medida velha/);
});

test("o passo a passo numera só os passos válidos: a cancelada não ocupa número", () => {
  const h = doCurso({ mostrarCanceladas: true });
  assert.match(h, />1<\/span>|aria-label="Concluído"/);
  assert.match(h, />3<\/span>/);
  assert.ok(!h.includes(">4</span>"), "a cancelada não pode ganhar o número 4");
});

test("o 'Como fazer' aparece só nos passos pendentes, e abre só no próximo passo do aluno", () => {
  const h = doCurso();
  assert.equal(abertoId, "t2");
  const recolhiveis = h.match(/<details [^>]*>/g) ?? [];
  assert.equal(recolhiveis.length, 2, "em andamento e backlog têm; o concluído não");
  assert.equal(recolhiveis.filter((d) => /\bopen\b/.test(d)).length, 1, "só um nasce aberto");
  assert.match(h, /<details [^>]*\bopen\b[^>]*>[\s\S]*?Como fazer/);
});

test("a ordem do plano no passo a passo e o botão Copiar dentro do passo aberto", () => {
  const h = doCurso();
  const ordem = ["Criar as contas", "Ligar os conectores", "Rodar o instalador"].map((t) => h.indexOf(t, h.indexOf("Dia 1")));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.match(h, /<button [^>]*type="button"[^>]*>[\s\S]*Copiar<\/button>/);
  assert.match(h, /<ol [^>]*list-decimal/);
});

test("passo sem nenhum texto não ganha o recolhível", () => {
  const sem = montarCronograma([item("t9", "Sem texto", "BACKLOG", { textos: {} })], "2026-10-07")[0];
  const h = renderToStaticMarkup(createElement(PassoAPasso, { trilha: sem }));
  assert.match(h, /Sem texto/);
  assert.ok(!h.includes("<details"));
});

test("o link de cada passo do curso leva a trilha, pro menu lateral acender 'Tarefas do curso'", () => {
  assert.match(doCurso(), /href="\/tarefas\/t2\?trilha=curso"/);
  assert.match(dos90(), /href="\/tarefas\/p1\?trilha=curso"/);
});

test("a linha do tempo só abre o 'Como fazer' do próximo passo do aluno; aqui é o do curso, então nenhum dos 90 dias", () => {
  const h = dos90();
  const recolhiveis = h.match(/<details [^>]*>/g) ?? [];
  assert.equal(recolhiveis.length, 1, "o pendente dos 90 dias tem o recolhível");
  assert.ok(!/\bopen\b/.test(recolhiveis[0]), "mas nasce fechado");
});
