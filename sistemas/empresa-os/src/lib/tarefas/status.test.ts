import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSICOES,
  ROTULO_STATUS,
  podeMover,
  transicoesValidas,
} from "./status.ts";
import type { TarefaStatus } from "@/types/database";

/* O CHECK da migration 0006 define exatamente este conjunto. Se um lado mudar
   sem o outro, este teste quebra ANTES da tela quebrar em produção. */
const STATUS_DO_BANCO: TarefaStatus[] = [
  "BACKLOG",
  "EM_ANDAMENTO",
  "REVISAO",
  "CONCLUIDA",
  "CANCELADA",
];

test("simetria com o CHECK do banco: TRANSICOES e ROTULO_STATUS cobrem exatamente os 5 status", () => {
  assert.deepEqual(Object.keys(TRANSICOES).sort(), [...STATUS_DO_BANCO].sort());
  assert.deepEqual(Object.keys(ROTULO_STATUS).sort(), [...STATUS_DO_BANCO].sort());
});

test("todo destino de transição é um status que o CHECK do banco aceita", () => {
  for (const [de, destinos] of Object.entries(TRANSICOES)) {
    for (const para of destinos) {
      assert.ok(
        STATUS_DO_BANCO.includes(para),
        `TRANSICOES[${de}] aponta pra "${para}", que o banco rejeitaria`,
      );
    }
  }
});

test("transições válidas do fluxo normal", () => {
  assert.equal(podeMover("BACKLOG", "EM_ANDAMENTO"), true);
  assert.equal(podeMover("BACKLOG", "CANCELADA"), true);
  assert.equal(podeMover("EM_ANDAMENTO", "REVISAO"), true);
  assert.equal(podeMover("EM_ANDAMENTO", "BACKLOG"), true);
  assert.equal(podeMover("EM_ANDAMENTO", "CANCELADA"), true);
  assert.equal(podeMover("REVISAO", "CONCLUIDA"), true);
  assert.equal(podeMover("REVISAO", "EM_ANDAMENTO"), true);
  assert.equal(podeMover("REVISAO", "CANCELADA"), true);
});

test("reabrir e reativar são as únicas saídas dos estados terminais", () => {
  assert.deepEqual([...transicoesValidas("CONCLUIDA")], ["EM_ANDAMENTO"]);
  assert.deepEqual([...transicoesValidas("CANCELADA")], ["BACKLOG"]);
});

test("transições inválidas são negadas", () => {
  // pular etapas
  assert.equal(podeMover("BACKLOG", "REVISAO"), false);
  assert.equal(podeMover("BACKLOG", "CONCLUIDA"), false);
  assert.equal(podeMover("EM_ANDAMENTO", "CONCLUIDA"), false);
  // sair dos terminais pra onde não pode
  assert.equal(podeMover("CONCLUIDA", "BACKLOG"), false);
  assert.equal(podeMover("CONCLUIDA", "REVISAO"), false);
  assert.equal(podeMover("CONCLUIDA", "CANCELADA"), false);
  assert.equal(podeMover("CANCELADA", "EM_ANDAMENTO"), false);
  assert.equal(podeMover("CANCELADA", "REVISAO"), false);
  assert.equal(podeMover("CANCELADA", "CONCLUIDA"), false);
});

test("nenhum status transita pra si mesmo", () => {
  for (const status of STATUS_DO_BANCO) {
    assert.equal(
      podeMover(status, status),
      false,
      `${status} → ${status} deveria ser inválido`,
    );
  }
});

test("rótulos pt-BR corretos", () => {
  assert.equal(ROTULO_STATUS.BACKLOG, "Backlog");
  assert.equal(ROTULO_STATUS.EM_ANDAMENTO, "Em andamento");
  assert.equal(ROTULO_STATUS.REVISAO, "Revisão");
  assert.equal(ROTULO_STATUS.CONCLUIDA, "Concluída");
  assert.equal(ROTULO_STATUS.CANCELADA, "Cancelada");
});
