import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  anexarTextosDoPlano,
  blocosDaAtividade,
  chaveDaTarefa,
  limparTextos,
  mesclarTextos,
  textosDoPlano,
  type ModeloPlano,
} from "./plano-textos.ts";
import { chaveDaTarefa as chaveDoSetup } from "../../config/plano-reconciliar.mjs";

// --- Plano de teste: uma atividade completa, uma só com o que já existia e uma com campo sujo ---
const PLANO: ModeloPlano = {
  etapas: [
    {
      trilha: "curso",
      fase: "D1",
      atividades: [
        {
          chave: "contas",
          instrucao: "Crie as contas.",
          por_que: "Sem conta você não instala nada.",
          passos: ["Abra o ChatGPT", "Abra o GitHub", "Abra o Supabase"],
          prova: "Você entra nas três contas.",
          comando: "Me ajude a criar as contas.\nUma de cada vez.",
        },
        { chave: "antiga", instrucao: "Atividade como era antes dos campos novos.", prova: "Está pronto." },
      ],
    },
    {
      trilha: "plano90",
      fase: "clareza",
      atividades: [{ chave: "painel", instrucao: "Rode o painel.", passos: [] }],
    },
  ],
};

test("limparTextos: só string não vazia entra, com espaço das pontas tirado", () => {
  assert.deepEqual(limparTextos({ instrucao: "  Faça isto.  ", por_que: "   ", prova: 5, comando: null }), { instrucao: "Faça isto." });
});

test("limparTextos: passos é lista de string não vazia; o resto cai fora", () => {
  assert.deepEqual(limparTextos({ passos: [" um ", "", 7, null, "dois"] }).passos, ["um", "dois"]);
  assert.equal(limparTextos({ passos: [] }).passos, undefined);
  assert.equal(limparTextos({ passos: "um passo só" }).passos, undefined);
  assert.equal(limparTextos({ passos: { 0: "x" } }).passos, undefined);
});

test("limparTextos: entrada que não é objeto vira vazio, nunca erro", () => {
  for (const sujo of [null, undefined, "texto", 42, [], true]) assert.deepEqual(limparTextos(sujo), {}, String(sujo));
});

test("limparTextos preserva as quebras de linha de dentro do comando (prompt de várias linhas)", () => {
  assert.equal(limparTextos({ comando: "\n  linha 1\n  linha 2\n" }).comando, "linha 1\n  linha 2");
});

test("a chave da tarefa é a mesma que o setup calcula (trilha.fase-minúscula.atividade)", () => {
  for (const etapa of PLANO.etapas) {
    for (const atividade of etapa.atividades) {
      assert.equal(chaveDaTarefa(etapa, atividade), chaveDoSetup(etapa, atividade));
    }
  }
  assert.equal(chaveDaTarefa({ trilha: "curso", fase: "D1" }, { chave: "contas" }), "curso.d1.contas");
});

test("textosDoPlano guarda os textos de cada atividade pela chave da tarefa", () => {
  const mapa = textosDoPlano(PLANO);
  assert.deepEqual([...mapa.keys()], ["curso.d1.contas", "curso.d1.antiga", "plano90.clareza.painel"]);
  assert.deepEqual(mapa.get("curso.d1.contas"), {
    instrucao: "Crie as contas.",
    por_que: "Sem conta você não instala nada.",
    passos: ["Abra o ChatGPT", "Abra o GitHub", "Abra o Supabase"],
    prova: "Você entra nas três contas.",
    comando: "Me ajude a criar as contas.\nUma de cada vez.",
  });
});

test("atividade sem os campos novos continua válida: simplesmente não os tem", () => {
  const antiga = textosDoPlano(PLANO).get("curso.d1.antiga");
  assert.deepEqual(antiga, { instrucao: "Atividade como era antes dos campos novos.", prova: "Está pronto." });
  assert.equal("por_que" in (antiga ?? {}), false);
  assert.equal("passos" in (antiga ?? {}), false);
  assert.equal("comando" in (antiga ?? {}), false);
});

test("plano sem etapas ou sem atividades não quebra", () => {
  assert.equal(textosDoPlano({ etapas: [] }).size, 0);
  assert.equal(textosDoPlano({ etapas: [{ trilha: "curso", fase: "D1", atividades: undefined as never }] }).size, 0);
  assert.equal(textosDoPlano({} as ModeloPlano).size, 0);
});

test("mesclarTextos: o banco ganha quando tem texto; o plano preenche o que faltar", () => {
  const doBanco = { instrucao: "Do banco.", prova: "Prova do banco." };
  const doPlano = { instrucao: "Do plano.", por_que: "Importa.", passos: ["a", "b"], prova: "Prova do plano.", comando: "cole isto" };
  assert.deepEqual(mesclarTextos(doBanco, doPlano), {
    instrucao: "Do banco.",
    por_que: "Importa.",
    passos: ["a", "b"],
    prova: "Prova do banco.",
    comando: "cole isto",
  });
});

test("mesclarTextos: texto vazio no banco não esconde o do plano", () => {
  assert.equal(mesclarTextos({ comando: "   ", instrucao: "" }, { comando: "do plano", instrucao: "do plano" }).comando, "do plano");
});

test("mesclarTextos: sem nenhum dos dois devolve vazio, e por_que e passos só vêm do plano", () => {
  assert.deepEqual(mesclarTextos(null, undefined), {});
  assert.deepEqual(mesclarTextos({ instrucao: "x" }, undefined), { instrucao: "x" });
  assert.deepEqual(mesclarTextos(undefined, { por_que: "y", passos: ["z"] }), { por_que: "y", passos: ["z"] });
});

test("anexarTextosDoPlano junta pela chave; item sem chave ou fora do plano fica só com o que o banco trouxe", () => {
  const plano = textosDoPlano(PLANO);
  const itens = [
    { tarefa_id: "1", chave: "curso.d1.contas", textos: { instrucao: "Do banco.", comando: "do banco" } },
    { tarefa_id: "2", chave: "curso.d1.nao-existe" },
    { tarefa_id: "3", chave: null, textos: { prova: "só banco" } },
    { tarefa_id: "4" },
  ];
  const r = anexarTextosDoPlano(itens, plano);
  assert.equal(r[0].textos.instrucao, "Do banco.");
  assert.equal(r[0].textos.comando, "do banco");
  assert.equal(r[0].textos.por_que, "Sem conta você não instala nada.");
  assert.deepEqual(r[0].textos.passos, ["Abra o ChatGPT", "Abra o GitHub", "Abra o Supabase"]);
  assert.deepEqual(r[1].textos, {});
  assert.deepEqual(r[2].textos, { prova: "só banco" });
  assert.deepEqual(r[3].textos, {});
  assert.deepEqual(r.map((i) => i.tarefa_id), ["1", "2", "3", "4"]);
});

// --- O que a tela desenha ---
test("blocos de uma atividade completa, na ordem: o que fazer, por que importa, passo a passo, texto pra colar, como saber que ficou pronto", () => {
  const blocos = blocosDaAtividade(textosDoPlano(PLANO).get("curso.d1.contas"));
  assert.deepEqual(blocos.map((b) => [b.tipo, b.titulo]), [
    ["instrucao", null],
    ["por_que", "Por que importa"],
    ["passos", "Passo a passo"],
    ["comando", "Cole isto na sua IA"],
    ["prova", "Como saber que ficou pronto"],
  ]);
});

test("o passo a passo vira lista com um item por passo, na ordem; o comando mantém as linhas", () => {
  const blocos = blocosDaAtividade(textosDoPlano(PLANO).get("curso.d1.contas"));
  const passos = blocos.find((b) => b.tipo === "passos");
  assert.deepEqual(passos && "itens" in passos ? passos.itens : null, ["Abra o ChatGPT", "Abra o GitHub", "Abra o Supabase"]);
  const comando = blocos.find((b) => b.tipo === "comando");
  assert.equal(comando && "texto" in comando ? comando.texto : null, "Me ajude a criar as contas.\nUma de cada vez.");
});

test("campo ausente não gera bloco: atividade antiga mostra só o que tem", () => {
  const blocos = blocosDaAtividade(textosDoPlano(PLANO).get("curso.d1.antiga"));
  assert.deepEqual(blocos.map((b) => b.tipo), ["instrucao", "prova"]);
});

test("passos vazio e atividade sem nada não geram bloco nenhum", () => {
  assert.deepEqual(blocosDaAtividade(textosDoPlano(PLANO).get("plano90.clareza.painel")).map((b) => b.tipo), ["instrucao"]);
  assert.deepEqual(blocosDaAtividade({}), []);
  assert.deepEqual(blocosDaAtividade(null), []);
  assert.deepEqual(blocosDaAtividade({ por_que: "  ", passos: [""], comando: "" }), []);
});

test("os títulos dos blocos são português simples, sem travessão nem jargão", () => {
  const todos = blocosDaAtividade({ instrucao: "i", por_que: "p", passos: ["a"], comando: "c", prova: "v" });
  for (const bloco of todos) {
    if (bloco.titulo) {
      assert.doesNotMatch(bloco.titulo, /—|prompt|slug|núcleo/i);
    }
  }
});

// --- O arquivo do plano de verdade (config/planos/mestre.json) ---
const PLANO_REAL = JSON.parse(readFileSync(new URL("../../config/planos/mestre.json", import.meta.url), "utf8")) as ModeloPlano;

test("contrato do arquivo do plano: por_que e comando são texto, passos é lista de texto (todos opcionais)", () => {
  for (const etapa of PLANO_REAL.etapas) {
    for (const atividade of etapa.atividades) {
      const onde = `${etapa.trilha}/${etapa.fase}/${atividade.chave}`;
      for (const campo of ["por_que", "comando"] as const) {
        const valor = atividade[campo];
        if (valor !== undefined) assert.ok(typeof valor === "string" && valor.trim() !== "", `${onde}: ${campo} deve ser texto não vazio`);
      }
      if (atividade.passos !== undefined) {
        assert.ok(Array.isArray(atividade.passos) && atividade.passos.length > 0, `${onde}: passos deve ser lista não vazia`);
        for (const passo of atividade.passos) assert.ok(typeof passo === "string" && passo.trim() !== "", `${onde}: passo deve ser texto não vazio`);
      }
    }
  }
});

test("toda atividade do plano real vira uma chave de tarefa única, e a tela acha o texto por ela", () => {
  const mapa = textosDoPlano(PLANO_REAL);
  const total = PLANO_REAL.etapas.reduce((s, e) => s + e.atividades.length, 0);
  assert.equal(mapa.size, total, "chave de tarefa repetida entre atividades");
  for (const chave of mapa.keys()) assert.match(chave, /^[a-z0-9]+(\.[a-z0-9-]+)+$/, chave);
  for (const etapa of PLANO_REAL.etapas) {
    for (const atividade of etapa.atividades) {
      assert.ok(mapa.get(chaveDaTarefa(etapa, atividade))?.instrucao, `${atividade.chave}: sem instrução`);
    }
  }
});
