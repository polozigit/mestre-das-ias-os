import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Render DE VERDADE dos cards e das listas com busca de Agentes, skills e workflows: nome amigável na frente,
 * nome técnico embaixo, modelo e esforço em português, busca por palavra (sem acento) e o estado "nada
 * encontrado". Os componentes (.tsx) entram pelos ganchos de teste e saem como HTML. A digitação em si
 * (evento do navegador) não roda aqui; a lista abre já com a busca preenchida (`buscaInicial`).
 */
register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { CardAgente } = await import("../painel/CardAgente.tsx");
const { CardArtefato } = await import("./CardArtefato.tsx");
const { ListaDeAgentes, ListaDeArtefatos } = await import("./ListaFiltravel.tsx");

const agente = (name: string, time: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${name}`, name, time, descricao_curta: `Descrição de ${name}`, estado: "instalado" as const, tier: "terra", esforco: "medium", ...extra,
});
const AGENTES = [
  agente("marketing-diretor", "marketing", { tier: "sol", esforco: "high", descricao_curta: "Coordena campanhas e a voz da marca" }),
  agente("marketing-auditor", "marketing", { tier: "luna", esforco: "low", estado: "disponivel" }),
  agente("tecnologia-revisor-seguranca", "tecnologia", { descricao_curta: "Procura brechas antes de ir pro ar" }),
];
const GRUPOS = [
  { time: "marketing", agentes: [AGENTES[0], AGENTES[1]] },
  { time: "tecnologia", agentes: [AGENTES[2]] },
];
const lista = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(ListaDeAgentes, { grupos: GRUPOS, execucoes: null, cargos: {}, ...props }));

test("o card do agente mostra o nome amigável na frente e o técnico em texto secundário", () => {
  const h = renderToStaticMarkup(createElement(CardAgente, { agente: AGENTES[0] }));
  assert.match(h, /<h3[^>]*>\s*Diretor\s*<\/h3>/);
  assert.match(h, /<p [^>]*font-mono[^>]*>marketing-diretor<\/p>/);
  assert.match(h, /href="\/agentes\/marketing-diretor"/);
});

test('modelo com inicial maiúscula e esforço em português ("Esforço alto", não "high")', () => {
  const h = renderToStaticMarkup(createElement(CardAgente, { agente: AGENTES[0] }));
  assert.match(h, />Sol</);
  assert.match(h, /Esforço alto/);
  assert.doesNotMatch(h, /high|>sol</);
});

test("o card de skill e de workflow também leva nome amigável e técnico", () => {
  const h = renderToStaticMarkup(
    createElement(CardArtefato, {
      artefato: { id: "1", tipo: "skill", nome: "polozi-registrar-dossie", time: "sistema", resumo: "Guarda o dossiê", estado: "instalado" },
    }),
  );
  assert.match(h, /<h3[^>]*>\s*Registrar dossiê\s*<\/h3>/);
  assert.match(h, />polozi-registrar-dossie<\/p>/);
  assert.match(h, /href="\/agentes\/skills\/polozi-registrar-dossie"/);
});

test("a lista traz o campo de busca e todos os agentes, agrupados por time", () => {
  const h = lista();
  assert.match(h, /<input [^>]*type="search"[^>]*placeholder="Buscar por nome ou descrição"/);
  for (const nome of ["Diretor", "Auditor", "Revisor segurança"]) assert.match(h, new RegExp(nome));
  assert.deepEqual([...h.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]), ["marketing", "tecnologia"]);
});

test("busca sem acento acha o agente com acento e mostra a contagem", () => {
  const h = lista({ buscaInicial: "seguranca" });
  assert.match(h, /Revisor segurança/);
  assert.doesNotMatch(h, /Diretor|Auditor/);
  assert.match(h, />1 resultado</);
  assert.deepEqual([...h.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]), ["tecnologia"]);
});

test("a busca olha o nome técnico e a descrição também, e junta as palavras (todas precisam casar)", () => {
  assert.match(lista({ buscaInicial: "marketing-diretor" }), /Diretor/);
  assert.match(lista({ buscaInicial: "brechas" }), /Revisor segurança/);
  const duas = lista({ buscaInicial: "marketing campanhas" });
  assert.match(duas, /Diretor/);
  assert.doesNotMatch(duas, /Auditor/);
  assert.match(duas, />1 resultado</);
});

test("busca sem resultado mostra 'Nada encontrado' e o botão pra limpar, sem nenhum card", () => {
  const h = lista({ buscaInicial: "zzzz" });
  assert.match(h, /Nada encontrado/);
  assert.match(h, /Limpar busca/);
  assert.ok(!h.includes("<h3"), "nenhum card");
});

test("sem permissão para ver execuções o card não mostra o bloco de execução; com permissão mostra o que há", () => {
  assert.doesNotMatch(lista(), /Ainda não trabalhou/);
  const com = lista({ execucoes: { "id-marketing-diretor": { veredito: "APROVADO", resumo: "Campanha aprovada", terminado_em: "2026-10-07T12:00:00Z" } } });
  assert.match(com, /Campanha aprovada/);
  assert.match(com, /Ainda não trabalhou/);
});

test("o cargo do organograma aparece só no agente que ocupa um", () => {
  const h = lista({ cargos: { "id-marketing-diretor": "Diretor de Marketing" } });
  assert.match(h, /Diretor de Marketing/);
  assert.equal((h.match(/Diretor de Marketing/g) ?? []).length, 1);
});

test("a lista de skills tem a mesma busca", () => {
  const grupos = [
    { time: "marketing", itens: [{ id: "1", tipo: "skill", nome: "polozi-criar-ebook", time: "marketing", resumo: "Escreve um ebook", estado: "instalado" }] },
    { time: "sistema", itens: [{ id: "2", tipo: "skill", nome: "polozi-registrar-dossie", time: "sistema", resumo: "Guarda o dossiê", estado: "instalado" }] },
  ];
  const h = renderToStaticMarkup(createElement(ListaDeArtefatos, { grupos: grupos as never, buscaInicial: "dossie" }));
  assert.match(h, /Registrar dossiê/);
  assert.doesNotMatch(h, /Criar ebook/);
});
