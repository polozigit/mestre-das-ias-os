import test from "node:test";
import assert from "node:assert/strict";
import { contarCanceladas, criterioRepeteProva, estaAtrasada, itensVisiveis, montarCronograma, montarItens, numerarPassos, passoAtual } from "./cronograma.ts";

const it = (o: Partial<{ tarefa_id: string; status: string; trilha: string; fase: string; prazo_previsto_em: string | null }>) => ({
  tarefa_id: o.tarefa_id ?? "t", titulo: "x", status: o.status ?? "BACKLOG", trilha: o.trilha ?? "curso", fase: o.fase ?? "D1", prazo_previsto_em: o.prazo_previsto_em ?? null,
});

test("lista vazia devolve as duas trilhas vazias, sem fase atual", () => {
  const r = montarCronograma([], "2026-11-19");
  assert.deepEqual(r.map((t) => [t.trilha, t.pct, t.faseAtual]), [["curso", 0, null], ["plano90", 0, null]]);
});
test("fases seguem a ordem canônica mesmo vindo fora de ordem", () => {
  const r = montarCronograma([it({ fase: "D3", tarefa_id: "a" }), it({ fase: "D1", tarefa_id: "b" })], "2026-11-19");
  assert.deepEqual(r[0].fases.map((f) => f.fase), ["D1", "D2", "D3"]);
});
test("atrasada = prazo passado e não concluída nem cancelada; sem prazo nunca atrasa", () => {
  const r = montarCronograma([
    it({ tarefa_id: "a", prazo_previsto_em: "2026-11-18" }),
    it({ tarefa_id: "b", prazo_previsto_em: "2026-11-18", status: "CONCLUIDA" }),
    it({ tarefa_id: "c", prazo_previsto_em: "2026-11-18", status: "CANCELADA" }),
    it({ tarefa_id: "d", prazo_previsto_em: null }),
  ], "2026-11-19");
  assert.equal(r[0].fases[0].atrasadas, 1);
});
test("sem prazo sozinha nunca atrasa", () => {
  const r = montarCronograma([it({ tarefa_id: "d", prazo_previsto_em: null })], "2026-11-19");
  assert.equal(r[0].fases[0].atrasadas, 0);
});
test("cancelada com prazo vencido sozinha nunca atrasa", () => {
  const r = montarCronograma([it({ tarefa_id: "c", prazo_previsto_em: "2026-11-18", status: "CANCELADA" })], "2026-11-19");
  assert.equal(r[0].fases[0].atrasadas, 0);
});
test("cancelada sai do total e do pct", () => {
  const r = montarCronograma([it({ tarefa_id: "a", status: "CONCLUIDA" }), it({ tarefa_id: "b", status: "CANCELADA" })], "2026-11-19");
  assert.equal(r[0].fases[0].total, 1);
  assert.equal(r[0].pct, 100);
});
test("fase atual = primeira fase com item pendente", () => {
  const r = montarCronograma([it({ fase: "D1", status: "CONCLUIDA", tarefa_id: "a" }), it({ fase: "D2", tarefa_id: "b" })], "2026-11-19");
  assert.equal(r[0].faseAtual, "D2");
});
test("tarefa de trabalho é ignorada", () => {
  const r = montarCronograma([it({ trilha: "trabalho", fase: null as unknown as string })], "2026-11-19");
  assert.equal(r.flatMap((t) => t.fases).reduce((s, f) => s + f.total, 0), 0);
});

// --- Passo a passo: ordem dentro da fase, próximo passo, numeração, junção com `ordem` ---
const p = (tarefa_id: string, ordem: number | null, extra: Partial<{ status: string; fase: string; trilha: string }> = {}) => ({
  ...it({ tarefa_id, status: extra.status, fase: extra.fase, trilha: extra.trilha }), titulo: tarefa_id, ordem,
});

test("itens da fase seguem a ordem do plano, não a ordem de chegada; sem ordem vai pro fim", () => {
  const r = montarCronograma([p("c", 30), p("sem", null), p("a", 10), p("b", 20)], "2026-11-19");
  assert.deepEqual(r[0].fases[0].itens.map((i) => i.tarefa_id), ["a", "b", "c", "sem"]);
});
test("próximo passo = primeiro pendente na ordem do plano, atravessando as fases", () => {
  const r = montarCronograma([
    p("d1-a", 10, { status: "CONCLUIDA" }), p("d1-b", 20, { status: "CONCLUIDA" }),
    p("d2-a", 30, { fase: "D2" }), p("d2-b", 40, { fase: "D2" }),
  ], "2026-11-19");
  assert.equal(r[0].proximo?.tarefa_id, "d2-a");
});
test("próximo passo pula cancelada e prefere a primeira em ordem, mesmo se a de baixo está em andamento", () => {
  const r = montarCronograma([p("a", 10, { status: "CANCELADA" }), p("b", 20), p("c", 30, { status: "EM_ANDAMENTO" })], "2026-11-19");
  assert.equal(r[0].proximo?.tarefa_id, "b");
});
test("sem pendente (tudo concluído ou vazio), próximo passo é nulo", () => {
  assert.equal(montarCronograma([p("a", 10, { status: "CONCLUIDA" })], "2026-11-19")[0].proximo, null);
  assert.equal(montarCronograma([], "2026-11-19")[1].proximo, null);
});
test("passoAtual devolve o próximo passo da primeira trilha que ainda tem pendência", () => {
  const trilhas = montarCronograma([p("c1", 10, { status: "CONCLUIDA" }), p("n1", 10, { trilha: "plano90", fase: "clareza" }), p("n2", 20, { trilha: "plano90", fase: "clareza" })], "2026-11-19");
  assert.deepEqual(passoAtual(trilhas), { trilha: "plano90", rotuloTrilha: "90 dias", item: trilhas[1].proximo, numero: 1, total: 2 });
  const feito = montarCronograma([p("c1", 10, { status: "CONCLUIDA" })], "2026-11-19");
  assert.equal(passoAtual(feito), null);
});
test("passoAtual: com pendência nas duas trilhas, o curso vem primeiro", () => {
  const trilhas = montarCronograma([p("c1", 10), p("n1", 10, { trilha: "plano90", fase: "clareza" })], "2026-11-19");
  assert.equal(passoAtual(trilhas)?.trilha, "curso");
  assert.equal(passoAtual(trilhas)?.item.tarefa_id, "c1");
});
test("passoAtual conta o número do passo entre os não cancelados e o total da trilha", () => {
  const trilhas = montarCronograma([p("a", 10, { status: "CONCLUIDA" }), p("x", 20, { status: "CANCELADA" }), p("b", 30), p("c", 40)], "2026-11-19");
  const atual = passoAtual(trilhas);
  assert.equal(atual?.item.tarefa_id, "b");
  assert.deepEqual([atual?.numero, atual?.total], [2, 3]);
});
test("numerarPassos numera de 1 em diante atravessando as fases e ignora cancelada", () => {
  const [curso] = montarCronograma([
    p("a", 10), p("x", 20, { status: "CANCELADA" }), p("b", 30), p("c", 40, { fase: "D2" }),
  ], "2026-11-19");
  const n = numerarPassos(curso);
  assert.equal(n.get("a"), 1);
  assert.equal(n.get("b"), 2);
  assert.equal(n.get("c"), 3);
  assert.equal(n.has("x"), false);
});
test("criterioRepeteProva: tarefa de plano nasce com criterio_pronto = prova; só então o card de critério some", () => {
  assert.equal(criterioRepeteProva("Abre o sistema.", "Abre o sistema."), true);
  assert.equal(criterioRepeteProva("  Abre o sistema. ", "Abre o sistema.\n"), true);
  assert.equal(criterioRepeteProva("Abre o sistema.", "Outro critério."), false);
  assert.equal(criterioRepeteProva("Abre o sistema.", null), false);
  assert.equal(criterioRepeteProva(null, null), false);
  assert.equal(criterioRepeteProva("", ""), false);
});
test("montarItens junta a ordem por id, descarta linha incompleta e não inventa ordem", () => {
  const linhas = [
    { tarefa_id: "a", titulo: "A", status: "BACKLOG", trilha: "curso", fase: "D1", prazo_previsto_em: null },
    { tarefa_id: "b", titulo: null, status: "BACKLOG", trilha: "curso", fase: "D1", prazo_previsto_em: null },
    { tarefa_id: "c", titulo: "C", status: "BACKLOG", trilha: "curso", fase: "D1", prazo_previsto_em: "2026-11-19" },
  ];
  const itens = montarItens(linhas, new Map([["a", 30]]));
  assert.deepEqual(itens.map((i) => [i.tarefa_id, i.ordem]), [["a", 30], ["c", null]]);
});

// --- Canceladas escondidas por padrão, atrasada, chave e textos dos itens ---
test("estaAtrasada: prazo já passou e o passo não terminou; hoje, sem prazo, concluída e cancelada nunca atrasam", () => {
  const item = (status: string, prazo: string | null) => ({ status, prazo_previsto_em: prazo });
  assert.equal(estaAtrasada(item("BACKLOG", "2026-11-18"), "2026-11-19"), true);
  assert.equal(estaAtrasada(item("EM_ANDAMENTO", "2026-11-18"), "2026-11-19"), true);
  assert.equal(estaAtrasada(item("BACKLOG", "2026-11-19"), "2026-11-19"), false);
  assert.equal(estaAtrasada(item("BACKLOG", null), "2026-11-19"), false);
  assert.equal(estaAtrasada(item("CONCLUIDA", "2026-11-18"), "2026-11-19"), false);
  assert.equal(estaAtrasada(item("CANCELADA", "2026-11-18"), "2026-11-19"), false);
});
test("itensVisiveis: cancelada some por padrão e volta quando o dono pede, sem mexer na ordem", () => {
  const itens = [p("a", 10), p("x", 20, { status: "CANCELADA" }), p("b", 30, { status: "CONCLUIDA" }), p("y", 40, { status: "CANCELADA" })];
  assert.deepEqual(itensVisiveis(itens, false).map((i) => i.tarefa_id), ["a", "b"]);
  assert.deepEqual(itensVisiveis(itens, true).map((i) => i.tarefa_id), ["a", "x", "b", "y"]);
  assert.deepEqual(itensVisiveis([], false), []);
});
test("itensVisiveis não muda o total nem a numeração: cancelada já não entra nelas", () => {
  const [curso] = montarCronograma([p("a", 10), p("x", 20, { status: "CANCELADA" }), p("b", 30)], "2026-11-19");
  assert.equal(curso.fases[0].total, 2);
  assert.deepEqual(itensVisiveis(curso.fases[0].itens, false).map((i) => numerarPassos(curso).get(i.tarefa_id)), [1, 2]);
});
test("contarCanceladas soma as canceladas das duas trilhas (decide se o 'mostrar canceladas' aparece)", () => {
  const trilhas = montarCronograma([
    p("a", 10), p("x", 20, { status: "CANCELADA" }), p("y", 30, { status: "CANCELADA", fase: "D2" }),
    p("z", 10, { status: "CANCELADA", trilha: "plano90", fase: "clareza" }),
  ], "2026-11-19");
  assert.equal(contarCanceladas(trilhas), 3);
  assert.equal(contarCanceladas(montarCronograma([p("a", 10)], "2026-11-19")), 0);
  assert.equal(contarCanceladas(montarCronograma([], "2026-11-19")), 0);
});
test("montarItens leva a chave da tarefa (liga ao texto do plano) e os textos do banco só quando a consulta pediu", () => {
  const base = { titulo: "A", status: "BACKLOG", trilha: "curso", fase: "D1", prazo_previsto_em: null };
  const semTextos = montarItens([{ tarefa_id: "a", ...base }], new Map(), new Map([["a", "curso.d1.contas"]]));
  assert.equal(semTextos[0].chave, "curso.d1.contas");
  assert.equal("textos" in semTextos[0], false);
  const comTextos = montarItens(
    [{ tarefa_id: "a", ...base, instrucao: " Faça. ", comando: null, prova: "Pronto." }],
    new Map(),
    new Map([["a", "curso.d1.contas"]]),
  );
  assert.deepEqual(comTextos[0].textos, { instrucao: "Faça.", prova: "Pronto." });
  assert.equal(montarItens([{ tarefa_id: "b", ...base }], new Map())[0].chave, null);
});
