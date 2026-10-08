import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  agruparPorDia,
  eEventoDeSistema,
  filtrarEventosDeSistema,
  nomeDoEvento,
  rotuloDoDia,
  TIPOS_DE_SISTEMA,
  TIPOS_DE_SISTEMA_PARA_FILTRO,
  tipoDoNo,
} from "./atividade-helpers.ts";

/* Âncora fixa: 26/08/2026 meio-dia em São Paulo. */
const AGORA = new Date("2026-08-26T12:00:00-03:00");

const NOMES = {
  usuarios: new Map([["u1", "Marcos"]]),
  agentes: new Map([["a1", "Guardião"]]),
};

test("nomeDoEvento: humano resolvido pelo mapa", () => {
  assert.equal(nomeDoEvento({ usuario_id: "u1", agente_id: null }, NOMES), "Marcos");
});

test("nomeDoEvento: agente resolvido pelo mapa", () => {
  assert.equal(nomeDoEvento({ usuario_id: null, agente_id: "a1" }, NOMES), "Guardião");
});

test("nomeDoEvento: humano fora do mapa ganha fallback digno, não id cru", () => {
  assert.equal(
    nomeDoEvento({ usuario_id: "u-sumiu", agente_id: null }, NOMES),
    "Pessoa da equipe",
  );
});

test("nomeDoEvento: agente fora do mapa ganha fallback digno", () => {
  assert.equal(
    nomeDoEvento({ usuario_id: null, agente_id: "a-sumiu" }, NOMES),
    "Agente de IA",
  );
});

test("nomeDoEvento: sem autor é Sistema", () => {
  assert.equal(nomeDoEvento({ usuario_id: null, agente_id: null }, NOMES), "Sistema");
});

test("tipoDoNo: humano=destaque, IA=info, sistema=neutro", () => {
  assert.equal(tipoDoNo({ usuario_id: "u1", agente_id: null }), "destaque");
  assert.equal(tipoDoNo({ usuario_id: null, agente_id: "a1" }), "info");
  assert.equal(tipoDoNo({ usuario_id: null, agente_id: null }), "neutro");
});

test("rotuloDoDia: mesmo dia em SP é Hoje", () => {
  assert.equal(rotuloDoDia("2026-08-26T09:00:00-03:00", AGORA), "Hoje");
});

test("rotuloDoDia: véspera é Ontem", () => {
  assert.equal(rotuloDoDia("2026-08-25T23:59:00-03:00", AGORA), "Ontem");
});

test("rotuloDoDia: mais velho vira data em dia/mês/ano", () => {
  assert.equal(rotuloDoDia("2026-08-20T10:00:00-03:00", AGORA), "20/08/2026");
});

test("rotuloDoDia: compara o dia no fuso de SP, não no UTC", () => {
  // 01h UTC de 26/08 ainda é 22h de 25/08 em São Paulo → Ontem, não Hoje.
  assert.equal(rotuloDoDia("2026-08-26T01:00:00Z", AGORA), "Ontem");
});

test("agruparPorDia: agrupa contíguos preservando a ordem", () => {
  const linhas = [
    { id: 3, quando: "2026-08-26T10:00:00-03:00" },
    { id: 2, quando: "2026-08-26T08:00:00-03:00" },
    { id: 1, quando: "2026-08-25T20:00:00-03:00" },
  ];
  const grupos = agruparPorDia(linhas, AGORA);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].rotulo, "Hoje");
  assert.deepEqual(grupos[0].linhas.map((l) => l.id), [3, 2]);
  assert.equal(grupos[1].rotulo, "Ontem");
  assert.deepEqual(grupos[1].linhas.map((l) => l.id), [1]);
});

test("agruparPorDia: lista vazia devolve zero grupos", () => {
  assert.deepEqual(agruparPorDia([], AGORA), []);
});

// --- Eventos de sistema: escondidos por padrão, decididos pelo campo `tipo` ---
const ev = (tipo: string, descricao = "x") => ({ tipo, descricao, usuario_id: null, agente_id: null, quando: "2026-08-26T10:00:00-03:00" });

test("eEventoDeSistema: os tipos que só o banco e os scripts gravam", () => {
  assert.equal(eEventoDeSistema({ tipo: "sistema" }), true);
  assert.equal(eEventoDeSistema({ tipo: "conexao_registrada" }), true);
  assert.equal(eEventoDeSistema({ tipo: "segredo_guardado" }), true);
});

test("eEventoDeSistema: ação de pessoa ou de IA nunca é de sistema", () => {
  for (const tipo of ["tarefa_criada", "tarefa_movida", "tarefa_editada", "modulo_ligado", "dado_pessoal_lido", "agente_rodou"]) {
    assert.equal(eEventoDeSistema({ tipo }), false, tipo);
  }
});

test("eEventoDeSistema decide pelo tipo, não pelo texto: 'Proteção de dados ligada' em evento de pessoa continua visível", () => {
  const deSistema = ev("sistema", "Proteção de dados ligada automaticamente na área nova do banco (organograma.org_cargo)");
  const dePessoa = ev("tarefa_criada", "Proteção de dados ligada: tarefa sobre organograma.org_cargo");
  assert.equal(eEventoDeSistema(deSistema), true);
  assert.equal(eEventoDeSistema(dePessoa), false);
});

test("filtrarEventosDeSistema: escondido por padrão, volta inteiro quando o dono pede", () => {
  const linhas = [ev("sistema", "Empresa criada"), ev("tarefa_criada", "Marcos criou uma tarefa"), ev("segredo_guardado", "Segredo guardado no Vault: X")];
  assert.deepEqual(filtrarEventosDeSistema(linhas, false).map((l) => l.tipo), ["tarefa_criada"]);
  assert.deepEqual(filtrarEventosDeSistema(linhas, true).map((l) => l.tipo), ["sistema", "tarefa_criada", "segredo_guardado"]);
});

test("filtro da consulta (PostgREST in) lista exatamente os mesmos tipos de sistema", () => {
  assert.equal(TIPOS_DE_SISTEMA_PARA_FILTRO, "(sistema,conexao_registrada,segredo_guardado)");
  assert.deepEqual(TIPOS_DE_SISTEMA_PARA_FILTRO.slice(1, -1).split(","), [...TIPOS_DE_SISTEMA]);
});

test("os tipos de sistema existem de verdade nas migrations (renomear lá sem aqui reprova)", () => {
  const migration = (nome: string) => readFileSync(new URL(`../../../supabase/migrations/${nome}`, import.meta.url), "utf8");
  assert.match(migration("0007_atividade.sql"), /tipo = 'sistema'/);
  assert.match(migration("0008_seed_funcao.sql"), /VALUES \('sistema', 'Empresa criada'\)/);
  assert.match(migration("0017_conexoes.sql"), /VALUES \('conexao_registrada'/);
  assert.match(migration("0017_conexoes.sql"), /VALUES \('segredo_guardado'/);
});
