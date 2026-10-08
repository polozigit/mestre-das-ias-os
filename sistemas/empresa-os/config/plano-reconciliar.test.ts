import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  atividadesEmOrdem,
  CHAVE_SISTEMA_NO_AR,
  metadataAoCancelar,
  chaveDaTarefa,
  orfasJaCanceladas,
  orfasParaAvisar,
  orfasParaCancelar,
  passosJaConcluidos,
  passosParaConcluir,
  planejarOrdem,
  siteNoAr,
  urlDoLogin,
  urlPublicaHttps,
} from "./plano-reconciliar.mjs";

const t = (chave: string, ordem: number, status = "BACKLOG", metadata: Record<string, unknown> = {}) => ({ id: `id-${chave}`, chave, ordem, status, metadata });

test("planejarOrdem: já na ordem do modelo não muda nada", () => {
  assert.deepEqual(planejarOrdem([t("a", 10), t("b", 20)], ["a", "b"]), []);
});
test("planejarOrdem: tarefa nova (ordem no fim) entra na posição do modelo e reaproveita a faixa de valores", () => {
  const tarefas = [t("times", 9050), t("primeiro", 9060), t("nova1", 9130), t("nova2", 9140)];
  const mud = planejarOrdem(tarefas, ["nova1", "nova2", "times", "primeiro"]);
  assert.deepEqual(mud.map((m) => [m.chave, m.para]), [["nova1", 9050], ["nova2", 9060], ["times", 9130], ["primeiro", 9140]]);
});
test("planejarOrdem: a faixa é permutação (nenhum valor repetido nem inventado: UNIQUE por trilha)", () => {
  const tarefas = [t("c", 30), t("a", 10), t("b", 20), t("o", 40)];
  const mud = planejarOrdem(tarefas, ["a", "b", "c"]);
  const final = new Map(tarefas.map((x) => [x.id, x.ordem]));
  for (const m of mud) final.set(m.id, m.para);
  assert.deepEqual([...final.values()].sort((x, y) => x - y), [10, 20, 30, 40]);
});
test("planejarOrdem: órfã (chave fora do modelo) vai pro fim, depois das do modelo", () => {
  const mud = planejarOrdem([t("velha", 10), t("a", 20), t("b", 30)], ["a", "b"]);
  assert.deepEqual(mud.map((m) => [m.chave, m.para]), [["a", 10], ["b", 20], ["velha", 30]]);
});
test("planejarOrdem: várias órfãs mantêm a ordem relativa que tinham, mesmo chegando fora de ordem", () => {
  const mud = planejarOrdem([t("o2", 20), t("o1", 10), t("a", 30)], ["a"]);
  assert.deepEqual(mud.map((m) => [m.chave, m.para]).sort(), [["a", 10], ["o1", 20], ["o2", 30]]);
});
test("planejarOrdem: chave do modelo sem tarefa no banco é ignorada", () => {
  assert.deepEqual(planejarOrdem([t("a", 10)], ["x", "a"]), []);
});

test("orfasParaCancelar: só órfã em BACKLOG; EM_ANDAMENTO, REVISAO, concluída e cancelada ficam; quem está no modelo nunca", () => {
  const velhas = [
    t("saiu-aberta", 1),
    t("saiu-andando", 2, "EM_ANDAMENTO"),
    t("saiu-revisao", 3, "REVISAO"),
    t("saiu-feita", 4, "CONCLUIDA"),
    t("saiu-cancelada", 5, "CANCELADA"),
    t("segue", 6),
  ];
  assert.deepEqual(orfasParaCancelar(velhas, ["segue"]).map((x) => x.chave), ["saiu-aberta"]);
});
test("orfasParaCancelar: órfã EM_ANDAMENTO não é cancelada (tem trabalho de gente)", () => {
  assert.deepEqual(orfasParaCancelar([t("saiu", 1, "EM_ANDAMENTO")], []), []);
});
test("orfasParaCancelar: órfã em REVISAO não é cancelada", () => {
  assert.deepEqual(orfasParaCancelar([t("saiu", 1, "REVISAO")], []), []);
});
test("metadataAoCancelar: guarda status_anterior e a versão, sem perder o que já havia no metadata", () => {
  assert.deepEqual(metadataAoCancelar(t("saiu", 1, "BACKLOG", { nota: "x" }), 3), { nota: "x", removida_do_plano_na_versao: 3, status_anterior: "BACKLOG" });
});
test("orfasParaAvisar: só órfã EM_ANDAMENTO ou REVISAO (as que o setup não cancela)", () => {
  const velhas = [t("a", 1), t("b", 2, "EM_ANDAMENTO"), t("c", 3, "REVISAO"), t("d", 4, "CONCLUIDA"), t("segue", 5, "EM_ANDAMENTO")];
  assert.deepEqual(orfasParaAvisar(velhas, ["segue"]).map((x) => x.chave), ["b", "c"]);
});
test("orfasJaCanceladas: só as canceladas por este setup nesta versão do plano", () => {
  const velhas = [
    t("esta", 1, "CANCELADA", { removida_do_plano_na_versao: 3 }),
    t("outra-versao", 2, "CANCELADA", { removida_do_plano_na_versao: 2 }),
    t("na-mao", 3, "CANCELADA"),
    t("aberta", 4),
  ];
  assert.deepEqual(orfasJaCanceladas(velhas, [], 3).map((x) => x.chave), ["esta"]);
});

test("passosParaConcluir: só os instalados, em BACKLOG e sem marca", () => {
  const tarefas = [
    t("curso.d1.contas", 1),
    t("curso.d1.banco", 2, "EM_ANDAMENTO"),
    t("curso.d1.instalador", 3, "CONCLUIDA"),
    t("curso.d1.sistema-no-ar", 4, "BACKLOG", { setup_concluiu: "2026-10-07" }),
    t("curso.d1.whatsapp", 5),
  ];
  const chaves = ["curso.d1.contas", "curso.d1.banco", "curso.d1.instalador", "curso.d1.sistema-no-ar"];
  assert.deepEqual(passosParaConcluir(tarefas, chaves, "setup_concluiu").map((x) => x.chave), ["curso.d1.contas"]);
});

test("passosJaConcluidos: só CONCLUIDA com a marca e instalada", () => {
  const tarefas = [
    t("curso.d1.contas", 1, "CONCLUIDA", { setup_concluiu: "2026-10-07" }),
    t("curso.d1.banco", 2, "CONCLUIDA"),
    t("curso.d1.instalador", 3, "BACKLOG", { setup_concluiu: "2026-10-07" }),
    t("curso.d1.whatsapp", 4, "CONCLUIDA", { setup_concluiu: "2026-10-07" }),
  ];
  const chaves = ["curso.d1.contas", "curso.d1.banco", "curso.d1.instalador"];
  assert.deepEqual(passosJaConcluidos(tarefas, chaves, "setup_concluiu").map((x) => x.chave), ["curso.d1.contas"]);
});

test("siteNoAr: https público com /login 200 é prova", () => {
  assert.equal(siteNoAr("https://empresa-os-fabrica.vercel.app", 200), true);
  assert.equal(siteNoAr("https://empresa-os-fabrica.vercel.app/", 200), true);
});
test("siteNoAr: localhost, 127.0.0.1 e http não valem, mesmo com 200", () => {
  for (const u of ["http://localhost:3000", "https://localhost:3000", "https://127.0.0.1", "https://sub.localhost", "http://empresa.vercel.app", "https://[::1]:3000", "https://0.0.0.0"])
    assert.equal(siteNoAr(u, 200), false, u);
});
test("siteNoAr: status diferente de 200 (redirect, 401, 404, 500, sem resposta) não prova", () => {
  for (const status of [301, 307, 401, 404, 500, 503, null, undefined])
    assert.equal(siteNoAr("https://empresa-os-fabrica.vercel.app", status as number), false, String(status));
});
test("siteNoAr: URL inválida ou vazia não prova", () => {
  for (const u of ["", "não-é-url", undefined as unknown as string]) assert.equal(siteNoAr(u, 200), false);
  assert.equal(urlPublicaHttps("https://minha-empresa.vercel.app"), true);
});
test("urlDoLogin: acrescenta /login sem duplicar a barra", () => {
  assert.equal(urlDoLogin("https://x.vercel.app"), "https://x.vercel.app/login");
  assert.equal(urlDoLogin("https://x.vercel.app/"), "https://x.vercel.app/login");
});

test("atividadesEmOrdem segue etapa e atividade, monta a chave da tarefa e carrega a marca de instalação", () => {
  const modelo = { etapas: [
    { ordem: 2, trilha: "curso", fase: "D2", atividades: [{ chave: "z", ordem: 1 }] },
    { ordem: 1, trilha: "curso", fase: "D1", atividades: [{ chave: "b", ordem: 2 }, { chave: "a", ordem: 1, feita_na_instalacao: true }] },
  ] };
  assert.deepEqual(atividadesEmOrdem(modelo), [
    { chave: "curso.d1.a", trilha: "curso", feitaNaInstalacao: true },
    { chave: "curso.d1.b", trilha: "curso", feitaNaInstalacao: false },
    { chave: "curso.d2.z", trilha: "curso", feitaNaInstalacao: false },
  ]);
  assert.equal(chaveDaTarefa({ trilha: "plano90", fase: "clareza" }, { chave: "painel" }), "plano90.clareza.painel");
});

test("o plano real: a ordem que o setup vai impor põe a instalação inteira antes do restante do D1", () => {
  const m = JSON.parse(readFileSync(new URL("./planos/mestre.json", import.meta.url), "utf8"));
  const chaves = atividadesEmOrdem(m).filter((a) => a.trilha === "curso").map((a) => a.chave);
  assert.equal(chaves.indexOf("curso.d1.contas"), 0);
  assert.ok(chaves.indexOf("curso.d1.times") < chaves.indexOf("curso.d1.primeiro-time"));
});

test("o plano real: sistema no ar existe e NÃO é feita_na_instalacao (só a prova do /login conclui)", () => {
  const m = JSON.parse(readFileSync(new URL("./planos/mestre.json", import.meta.url), "utf8"));
  const ativ = atividadesEmOrdem(m);
  const noAr = ativ.find((a) => a.chave === CHAVE_SISTEMA_NO_AR);
  assert.ok(noAr, "a chave do passo sistema no ar saiu do plano");
  assert.equal(noAr.feitaNaInstalacao, false);
});
