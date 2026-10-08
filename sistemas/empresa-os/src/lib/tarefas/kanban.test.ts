import test from "node:test";
import assert from "node:assert/strict";
import { ORDEM_QUADRO, agruparPorStatus, filtrar } from "./kanban.ts";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

type TarefaFake = {
  id: string;
  status: TarefaStatus;
  origem: TarefaOrigem;
  dono_id: string | null;
};

function t(
  id: string,
  status: TarefaStatus,
  origem: TarefaOrigem = "humano",
  dono_id: string | null = null,
): TarefaFake {
  return { id, status, origem, dono_id };
}

test("quadro tem exatamente 4 colunas na ordem BACKLOG/EM_ANDAMENTO/REVISAO/CONCLUIDA", () => {
  assert.deepEqual(
    [...ORDEM_QUADRO],
    ["BACKLOG", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA"],
  );
  const colunas = agruparPorStatus<TarefaFake>([]);
  assert.deepEqual(
    colunas.map((c) => c.status),
    ["BACKLOG", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA"],
  );
});

test("agruparPorStatus distribui cada tarefa na sua coluna, preservando a ordem de entrada", () => {
  const colunas = agruparPorStatus([
    t("a", "EM_ANDAMENTO"),
    t("b", "BACKLOG"),
    t("c", "EM_ANDAMENTO"),
    t("d", "CONCLUIDA"),
    t("e", "REVISAO"),
  ]);
  assert.deepEqual(colunas[0].tarefas.map((x) => x.id), ["b"]);
  assert.deepEqual(colunas[1].tarefas.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(colunas[2].tarefas.map((x) => x.id), ["e"]);
  assert.deepEqual(colunas[3].tarefas.map((x) => x.id), ["d"]);
});

test("CANCELADA fica FORA do quadro (só aparece na lista, filtrada)", () => {
  const colunas = agruparPorStatus([
    t("viva", "BACKLOG"),
    t("morta", "CANCELADA"),
  ]);
  const idsNoQuadro = colunas.flatMap((c) => c.tarefas.map((x) => x.id));
  assert.deepEqual(idsNoQuadro, ["viva"]);
  assert.equal(colunas.some((c) => (c.status as string) === "CANCELADA"), false);
});

test("coluna sem tarefa existe vazia (coluna não some do quadro)", () => {
  const colunas = agruparPorStatus([t("a", "BACKLOG")]);
  assert.equal(colunas.length, 4);
  assert.deepEqual(colunas[2].tarefas, []);
  assert.deepEqual(colunas[3].tarefas, []);
});

test("filtrar sem filtro devolve tudo", () => {
  const todas = [t("a", "BACKLOG"), t("b", "CANCELADA", "ia", "u1")];
  assert.deepEqual(filtrar(todas, {}), todas);
});

test("filtrar por origem", () => {
  const todas = [t("a", "BACKLOG", "humano"), t("b", "BACKLOG", "ia")];
  assert.deepEqual(filtrar(todas, { origem: "ia" }).map((x) => x.id), ["b"]);
  assert.deepEqual(filtrar(todas, { origem: "humano" }).map((x) => x.id), ["a"]);
});

test("filtrar por dono não casa tarefa sem dono (dono_id null)", () => {
  const todas = [
    t("a", "BACKLOG", "humano", "u1"),
    t("b", "BACKLOG", "humano", null),
    t("c", "BACKLOG", "humano", "u2"),
  ];
  assert.deepEqual(filtrar(todas, { donoId: "u1" }).map((x) => x.id), ["a"]);
});

test("filtrar por status alcança inclusive CANCELADA", () => {
  const todas = [t("a", "BACKLOG"), t("b", "CANCELADA")];
  assert.deepEqual(filtrar(todas, { status: "CANCELADA" }).map((x) => x.id), ["b"]);
});

test("filtros combinam com E lógico", () => {
  const todas = [
    t("a", "BACKLOG", "ia", "u1"),
    t("b", "BACKLOG", "ia", "u2"),
    t("c", "REVISAO", "ia", "u1"),
    t("d", "BACKLOG", "humano", "u1"),
  ];
  assert.deepEqual(
    filtrar(todas, { origem: "ia", donoId: "u1", status: "BACKLOG" }).map((x) => x.id),
    ["a"],
  );
});
