import test from "node:test";
import assert from "node:assert/strict";
import { lerFonte } from "../fonte-para-teste.ts";
import {
  nomeAgenteValido,
  normalizarSkills,
  resumirExecucoes,
  rotuloTokens,
  tomVeredito,
} from "./detalhe.ts";

const ex = (veredito: string, terminado_em: string) => ({ veredito, terminado_em });

test("skills: null, undefined e tipo estranho viram lista vazia", () => {
  assert.deepEqual(normalizarSkills(null), []);
  assert.deepEqual(normalizarSkills(undefined), []);
  assert.deepEqual(normalizarSkills(42), []);
  assert.deepEqual(normalizarSkills({ a: 1 }), []);
});

test("skills: array limpa branco, vazio, não-string e repetido; mantém a ordem", () => {
  assert.deepEqual(normalizarSkills([" vendas ", "", "  ", 3, null, "copy", "vendas"]), ["vendas", "copy"]);
});

test("skills: json em texto vira lista; json quebrado ou não-lista vira vazio", () => {
  assert.deepEqual(normalizarSkills('["a","b"]'), ["a", "b"]);
  assert.deepEqual(normalizarSkills("[quebrado"), []);
  assert.deepEqual(normalizarSkills('{"a":1}'), []);
  assert.deepEqual(normalizarSkills("texto solto"), []);
});

test("execuções: lista vazia dá total 0, sem última e sem veredito", () => {
  assert.deepEqual(resumirExecucoes([]), { total: 0, porVeredito: [], ultima: null });
});

test("execuções: conta por veredito na ordem fixa e omite os zerados", () => {
  const r = resumirExecucoes([
    ex("ERRO", "2026-10-01T10:00:00Z"),
    ex("APROVADO", "2026-10-02T10:00:00Z"),
    ex("APROVADO", "2026-10-03T10:00:00Z"),
    ex("BLOQUEADO", "2026-10-04T10:00:00Z"),
    ex("CONCLUIDO", "2026-10-05T10:00:00Z"),
  ]);
  assert.equal(r.total, 5);
  assert.deepEqual(r.porVeredito, [
    { veredito: "APROVADO", qtd: 2 },
    { veredito: "CONCLUIDO", qtd: 1 },
    { veredito: "BLOQUEADO", qtd: 1 },
    { veredito: "ERRO", qtd: 1 },
  ]);
});

test("execuções: a última é a de maior terminado_em, qualquer que seja a ordem", () => {
  const r = resumirExecucoes([
    ex("CONCLUIDO", "2026-10-05T10:00:00Z"),
    ex("ERRO", "2026-10-07T10:00:00Z"),
    ex("APROVADO", "2026-10-06T10:00:00Z"),
  ]);
  assert.equal(r.ultima?.veredito, "ERRO");
});

test("execuções: veredito desconhecido não some da contagem", () => {
  const r = resumirExecucoes([ex("TALVEZ", "2026-10-01T10:00:00Z"), ex("APROVADO", "2026-10-02T10:00:00Z")]);
  assert.deepEqual(r.porVeredito.map((v) => v.veredito), ["APROVADO", "TALVEZ"]);
});

test("tokens: nulo é 'não medido', zero é zero, milhar com ponto", () => {
  assert.equal(rotuloTokens(null), "não medido");
  assert.equal(rotuloTokens(0), "0 tokens");
  assert.equal(rotuloTokens(1), "1 token");
  assert.equal(rotuloTokens(12345), "12.345 tokens");
});

test("tom do veredito: aprovado verde, erro e bloqueado vermelho, resto neutro", () => {
  assert.equal(tomVeredito("APROVADO"), "success");
  assert.equal(tomVeredito("CONCLUIDO"), "info");
  assert.equal(tomVeredito("BLOQUEADO"), "danger");
  assert.equal(tomVeredito("ERRO"), "danger");
  assert.equal(tomVeredito("OUTRO"), "neutral");
});

test("nome do agente: só [a-z0-9-], senão nem vai ao banco", () => {
  assert.equal(nomeAgenteValido("gerente-vendas"), true);
  assert.equal(nomeAgenteValido("Gerente"), false);
  assert.equal(nomeAgenteValido("a b"), false);
  assert.equal(nomeAgenteValido("a%2Fb"), false);
  assert.equal(nomeAgenteValido(""), false);
});

const pagina = lerFonte(new URL("../../app/(app)/agentes/[name]/page.tsx", import.meta.url));
const card = lerFonte(new URL("../../components/painel/CardAgente.tsx", import.meta.url));

test("página: agente inexistente ou nome inválido dá 404", () => {
  assert.match(pagina, /if \(!nomeAgenteValido\(name\)\) notFound\(\);/);
  assert.match(pagina, /if \(!agente\) notFound\(\);/);
});

test("página: erro de banco estoura em todas as leituras (agente, execuções, cargo)", () => {
  assert.match(pagina, /if \(erroAgente\) throw erroAgente;/);
  assert.match(pagina, /if \(erroExecs\) throw erroExecs;/);
  assert.match(pagina, /if \(erroCargos\) throw erroCargos;/);
});

test("página: execuções só com execucoes.read e cargo só com permissão do organograma", () => {
  assert.match(pagina, /sessao\.eDono \|\| sessao\.permissoes\.includes\("execucoes\.read"\)/);
  assert.match(pagina, /pode\(sessao, "organograma"\)/);
  assert.match(pagina, /if \(veExecucoes\) \{/);
  assert.match(pagina, /if \(veCargos\) \{/);
});

test("página: execuções pelo name do agente, cargo pelo id, 20 mais recentes", () => {
  assert.match(pagina, /\.eq\("agente", agente\.name\)/);
  assert.match(pagina, /\.eq\("agente_id", agente\.id\)/);
  assert.match(pagina, /\.limit\(20\)/);
});

test("página: usa os helpers (skills normalizadas, resumo, tokens e tom do veredito)", () => {
  assert.match(pagina, /normalizarSkills\(agente\.skills\)/);
  assert.match(pagina, /resumirExecucoes\(execucoes\)/);
  assert.match(pagina, /rotuloTokens\(e\.custo_estimado_tokens\)/);
  assert.match(pagina, /tomVeredito\(e\.veredito\)/);
});

test("página: cargo leva ao /organograma", () => {
  assert.match(pagina, /key=\{cargo\.slug\}\s+href="\/organograma"/);
});

test("página: campo vazio some (sem skill ligada, sem regra de acionamento), nada de 'não declarado'", () => {
  assert.match(pagina, /\{skills\.length > 0 && \(/);
  assert.match(pagina, /\{agente\.quando\?\.trim\(\) && \(/);
  assert.doesNotMatch(pagina, /Nenhuma skill ligada/);
  assert.doesNotMatch(pagina, /não declarado/);
  assert.doesNotMatch(pagina, /Sem regra de acionamento/);
});

test("página: o texto técnico (arquivo do agente) fica recolhido em 'Ver instruções completas'", () => {
  assert.match(pagina, /<InstrucoesCompletas>[\s\S]*<CardConteudo[\s\S]*<CardArquivos[\s\S]*<\/InstrucoesCompletas>/);
  const detalhe = lerFonte(new URL("../../components/catalogo/DetalheArtefato.tsx", import.meta.url));
  assert.match(detalhe, /<details className="group[^"]*"/);
  assert.doesNotMatch(detalhe, /<details open/);
  assert.match(detalhe, /Ver instruções completas\s*<\/summary>/);
});

test("página: nome amigável na frente (h1) e o técnico em texto secundário; legenda dos modelos", () => {
  assert.match(pagina, /\{nomeAmigavel\(agente\.name, agente\.time\)\}/);
  assert.match(pagina, /font-mono[^>]*>\{agente\.name\}</);
  assert.match(pagina, /\{agente\.tier && <p className="text-xs text-fg-3">\{LEGENDA_DOS_MODELOS\}<\/p>\}/);
  assert.match(pagina, /rotuloModelo\(agente\.tier\)/);
});

test("card da lista leva à página do agente", () => {
  assert.match(card, /href=\{`\/agentes\/\$\{encodeURIComponent\(agente\.name\)\}`\}/);
});
