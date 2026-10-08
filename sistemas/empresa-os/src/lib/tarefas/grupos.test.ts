import test from "node:test";
import assert from "node:assert/strict";
import {
  grupoDaBusca,
  grupoDaTrilha,
  hrefListaTarefas,
  hrefTarefa,
  TEXTOS_DO_GRUPO,
  trilhasDoGrupo,
} from "./grupos.ts";

/* O CHECK ck_tarefas_trilha da migration 0006 define as 3 trilhas do banco. */
const TRILHAS_DO_BANCO = ["curso", "plano90", "trabalho"];

test("sem ?trilha= a lista é o dia a dia (trabalho), nunca todas", () => {
  assert.equal(grupoDaBusca(undefined), "trabalho");
  assert.equal(grupoDaBusca(""), "trabalho");
  assert.equal(grupoDaBusca("trabalho"), "trabalho");
});

test("?trilha=curso junta curso e plano de 90 dias numa lista só", () => {
  assert.equal(grupoDaBusca("curso"), "curso");
  assert.equal(grupoDaBusca("plano90"), "curso");
  assert.deepEqual([...trilhasDoGrupo("curso")], ["curso", "plano90"]);
});

test("?trilha= inválido ou repetido nunca vira erro: valor estranho cai no dia a dia, array vale o primeiro", () => {
  assert.equal(grupoDaBusca("toString"), "trabalho");
  assert.equal(grupoDaBusca("todas"), "trabalho");
  assert.equal(grupoDaBusca("CURSO"), "trabalho");
  assert.equal(grupoDaBusca(["curso", "trabalho"]), "curso");
  assert.equal(grupoDaBusca([]), "trabalho");
});

test("os dois grupos cobrem as 3 trilhas do banco sem sobrepor nenhuma", () => {
  const juntas = [...trilhasDoGrupo("trabalho"), ...trilhasDoGrupo("curso")];
  assert.deepEqual([...juntas].sort(), [...TRILHAS_DO_BANCO].sort());
  assert.equal(new Set(juntas).size, juntas.length);
});

test("grupoDaTrilha: cada trilha do banco cai no grupo da lista em que aparece", () => {
  assert.equal(grupoDaTrilha("curso"), "curso");
  assert.equal(grupoDaTrilha("plano90"), "curso");
  assert.equal(grupoDaTrilha("trabalho"), "trabalho");
  assert.equal(grupoDaTrilha(null), "trabalho");
  assert.equal(grupoDaTrilha(undefined), "trabalho");
  for (const trilha of TRILHAS_DO_BANCO) {
    assert.ok(trilhasDoGrupo(grupoDaTrilha(trilha)).includes(trilha), trilha);
  }
});

test("hrefListaTarefas: dia a dia é a URL limpa; curso leva ?trilha=curso; filtros acompanham", () => {
  assert.equal(hrefListaTarefas("trabalho"), "/tarefas");
  assert.equal(hrefListaTarefas("curso"), "/tarefas?trilha=curso");
  assert.equal(
    hrefListaTarefas("curso", { visao: "lista", status: "BACKLOG" }),
    "/tarefas?trilha=curso&visao=lista&status=BACKLOG",
  );
  assert.equal(hrefListaTarefas("trabalho", { visao: "lista", dono: undefined, origem: "" }), "/tarefas?visao=lista");
});

test("hrefTarefa: tarefa do curso e dos 90 dias leva a trilha (acende o item certo do menu); a do dia a dia, não", () => {
  assert.equal(hrefTarefa("abc", "curso"), "/tarefas/abc?trilha=curso");
  assert.equal(hrefTarefa("abc", "plano90"), "/tarefas/abc?trilha=curso");
  assert.equal(hrefTarefa("abc", "trabalho"), "/tarefas/abc");
  assert.equal(hrefTarefa("abc", null), "/tarefas/abc");
});

test("os textos de cada lista dizem qual lista é, em português simples e sem travessão", () => {
  assert.equal(TEXTOS_DO_GRUPO.trabalho.titulo, "Tarefas do dia a dia");
  assert.equal(TEXTOS_DO_GRUPO.curso.titulo, "Tarefas do curso e da trilha de 90 dias");
  for (const grupo of ["trabalho", "curso"] as const) {
    for (const texto of Object.values(TEXTOS_DO_GRUPO[grupo])) {
      assert.ok(texto.length > 0);
      assert.doesNotMatch(texto, /—/);
      assert.doesNotMatch(texto, /setup|slug|trilha Trabalho/i);
    }
  }
});
