import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Render DE VERDADE da pílula "Criada por", do card do quadro e da tabela da lista de Tarefas: o que o dono
 * lê em cada um, com "Você" e "IA" no lugar de "Humano" e "Origem". Os componentes (.tsx) entram pelos
 * ganchos de teste e saem como HTML.
 */
register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { CriadaPorPill } = await import("./pills.tsx");
const { TarefaCard } = await import("./TarefaCard.tsx");
const { TarefasTable } = await import("./TarefasTable.tsx");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");

const texto = (html: string) => html.replace(/<[^>]*>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "");

test('a pílula curta (coluna da tabela) diz "Você" e "IA"', () => {
  assert.equal(texto(renderToStaticMarkup(createElement(CriadaPorPill, { origem: "humano", curto: true }))), "Você");
  assert.equal(texto(renderToStaticMarkup(createElement(CriadaPorPill, { origem: "ia", curto: true }))), "IA");
});

test('a pílula inteira (card e detalhe) diz "Criada por você" e "Criada por IA", sem quebrar de linha', () => {
  const humano = renderToStaticMarkup(createElement(CriadaPorPill, { origem: "humano" }));
  const ia = renderToStaticMarkup(createElement(CriadaPorPill, { origem: "ia" }));
  assert.equal(texto(humano), "Criada por você");
  assert.equal(texto(ia), "Criada por IA");
  for (const pilula of [humano, ia]) assert.match(pilula, /whitespace-nowrap/);
});

test("nenhuma pílula chama de 'Humano' nem de 'Origem'", () => {
  for (const origem of ["humano", "ia"] as const) {
    for (const curto of [true, false]) {
      assert.doesNotMatch(renderToStaticMarkup(createElement(CriadaPorPill, { origem, curto })), /Humano|Origem/);
    }
  }
});

const CARTAO = { id: "abc", titulo: "Revisar a apresentação", status: "EM_ANDAMENTO" as const, origem: "humano" as const, responsavel: "Joana", atualizadaEm: "2026-10-07T12:00:00Z" };

test("o card do quadro mostra 'Criada por' e leva o grupo da tarefa no link", () => {
  const dia = renderToStaticMarkup(createElement(TarefaCard, { tarefa: { ...CARTAO, trilha: "trabalho" } }));
  assert.match(dia, /Criada por você/);
  assert.match(dia, /href="\/tarefas\/abc"/);
  const curso = renderToStaticMarkup(createElement(TarefaCard, { tarefa: { ...CARTAO, origem: "ia", trilha: "plano90" } }));
  assert.match(curso, /Criada por IA/);
  assert.match(curso, /href="\/tarefas\/abc\?trilha=curso"/);
});

const LINHA = { id: "abc", titulo: "Revisar a apresentação", status: "BACKLOG" as const, origem: "humano" as const, trilha: "trabalho", responsavel: null, atualizadaEm: "2026-10-07T12:00:00Z" };
const tabela = (tarefas: unknown[]) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { push: () => undefined } as never },
      createElement(TarefasTable, { tarefas: tarefas as never }),
    ),
  );

test('a tabela tem a coluna "Criada por" (não "Origem") com "Você" e "IA"', () => {
  const h = tabela([LINHA, { ...LINHA, id: "def", origem: "ia", responsavel: "Joana" }]);
  assert.match(h, /<th[^>]*>[\s\S]*?Criada por[\s\S]*?<\/th>/);
  assert.doesNotMatch(h, /Origem|Humano/);
  assert.match(h, /data-label="Criada por"[^>]*>[\s\S]*?Você/);
  assert.match(h, /data-label="Criada por"[^>]*>[\s\S]*?IA/);
});

test('tarefa sem dono diz "Sem dono" (não um travessão)', () => {
  const h = tabela([LINHA]);
  assert.match(h, /Sem dono/);
  assert.doesNotMatch(h, /—/);
});

test("lista vazia com filtro mostra a mensagem da tabela", () => {
  assert.match(tabela([]), /Nenhuma tarefa com esses filtros\./);
});

/* ---- Datas: a lista escreve a data (dia/mês/ano), o quadro mantém "ontem"; cada um leva o outro na dica ---- */

/** Roda `fn` com o relógio parado em 08/10/2026 09:00 (São Paulo), pra "ontem" e "há 3 h" não dependerem do dia do teste. */
function noDia8<T>(fn: () => T): T {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-08T12:00:00Z") });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
}

test("a lista mostra a data escrita (dia/mês/ano) na célula Atualizada e o tempo relativo na dica", () => {
  const h = noDia8(() => tabela([LINHA]));
  assert.match(h, /data-label="Atualizada"[^>]*>\s*<span[^>]*title="ontem"[^>]*>07\/10\/2026<\/span>/);
});

test("na lista a coluna Atualizada não mostra mais o tempo relativo como texto", () => {
  const h = noDia8(() => tabela([LINHA, { ...LINHA, id: "def", atualizadaEm: "2026-10-08T09:00:00Z" }]));
  const celulas = [...h.matchAll(/data-label="Atualizada"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
  assert.deepEqual(celulas, ["07/10/2026", "08/10/2026"]);
});

test("o quadro mantém o tempo relativo no card e leva a data completa (dia/mês/ano, hora) na dica", () => {
  const h = noDia8(() => renderToStaticMarkup(createElement(TarefaCard, { tarefa: { ...CARTAO, trilha: "trabalho" } })));
  assert.match(h, /<span[^>]*title="07\/10\/2026, 09:00"[^>]*>ontem<\/span>/);
});
