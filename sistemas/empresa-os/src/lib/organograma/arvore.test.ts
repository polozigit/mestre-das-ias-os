import assert from "node:assert/strict";
import { test } from "node:test";

import {
  montarArvore,
  caminho,
  resumo,
  rotuloApqc,
  rotuloCurto,
} from "./arvore.ts";
import type { OrgNo } from "./tipos.ts";

function no(parcial: Partial<OrgNo> & { no_id: string; tipo: OrgNo["tipo"] }): OrgNo {
  return {
    pai_no_id: null,
    ordem: 0,
    slug: parcial.no_id.split(":")[1] ?? parcial.no_id,
    titulo: parcial.no_id,
    sigla: null,
    cargo_real: null,
    sub_area: null,
    vagas: null,
    aparece_a_partir_de: null,
    time_total: null,
    missao: null,
    especialidade: null,
    antes: null,
    reporta_a_texto: null,
    reporta_a_slug: null,
    area_slug: null,
    salario_nota: null,
    salario_proxy: null,
    salarios: [],
    referencias: [],
    processos: [],
    interfaces: [],
    pacote: null,
    ...parcial,
  };
}

// --- montarArvore: 5 nós, área com cargo aninhado ---

test("montarArvore: raiz > diretoria > área > cargo, filhos ordenados por ordem", () => {
  const nos: OrgNo[] = [
    no({ no_id: "c:ceo", tipo: "root", pai_no_id: null, ordem: 0 }),
    no({ no_id: "c:cpeo", tipo: "cabeca", pai_no_id: "c:ceo", ordem: 0 }),
    no({ no_id: "a:pessoas", tipo: "area", pai_no_id: "c:cpeo", ordem: 0 }),
    // filhos fora de ordem no array — devem sair ordenados por `ordem`
    no({ no_id: "c:chro", tipo: "cargo", pai_no_id: "a:pessoas", ordem: 1 }),
    no({ no_id: "c:rh", tipo: "cargo", pai_no_id: "a:pessoas", ordem: 0 }),
  ];

  const idx = montarArvore(nos);

  assert.equal(idx.raiz?.no_id, "c:ceo");
  assert.equal(idx.porId.size, 5);
  assert.deepEqual(
    idx.filhos.get("c:ceo")?.map((n) => n.no_id),
    ["c:cpeo"],
  );
  assert.deepEqual(
    idx.filhos.get("a:pessoas")?.map((n) => n.no_id),
    ["c:rh", "c:chro"], // ordem 0 antes de ordem 1
  );
});

test("montarArvore: nó órfão (pai inexistente) não quebra e fica fora da árvore", () => {
  const nos: OrgNo[] = [
    no({ no_id: "c:ceo", tipo: "root", pai_no_id: null, ordem: 0 }),
    no({ no_id: "c:cpeo", tipo: "cabeca", pai_no_id: "c:ceo", ordem: 0 }),
    // pai "c:fantasma" não existe em `nos`
    no({ no_id: "c:orfao", tipo: "cargo", pai_no_id: "c:fantasma", ordem: 0 }),
  ];

  const idx = montarArvore(nos);

  assert.equal(idx.raiz?.no_id, "c:ceo");
  assert.equal(idx.porId.size, 3, "órfão continua indexável por id");
  assert.deepEqual(idx.filhos.get("c:ceo")?.map((n) => n.no_id), ["c:cpeo"]);
  assert.equal(idx.filhos.get("c:fantasma"), undefined);
  // órfão não aparece pendurado em ninguém — nenhuma lista de filhos o contém
  const todosFilhos = Array.from(idx.filhos.values()).flat().map((n) => n.no_id);
  assert.ok(!todosFilhos.includes("c:orfao"));
});

// --- caminho ---

test("caminho: da raiz até uma folha", () => {
  const nos: OrgNo[] = [
    no({ no_id: "c:ceo", tipo: "root", pai_no_id: null, ordem: 0 }),
    no({ no_id: "c:cpeo", tipo: "cabeca", pai_no_id: "c:ceo", ordem: 0 }),
    no({ no_id: "a:pessoas", tipo: "area", pai_no_id: "c:cpeo", ordem: 0 }),
    no({ no_id: "c:chro", tipo: "cargo", pai_no_id: "a:pessoas", ordem: 0 }),
  ];
  const idx = montarArvore(nos);

  assert.deepEqual(
    caminho(idx, "c:chro").map((n) => n.no_id),
    ["c:ceo", "c:cpeo", "a:pessoas", "c:chro"],
  );
});

test("caminho: id desconhecido devolve lista vazia", () => {
  const nos: OrgNo[] = [no({ no_id: "c:ceo", tipo: "root", pai_no_id: null, ordem: 0 })];
  const idx = montarArvore(nos);
  assert.deepEqual(caminho(idx, "c:nada"), []);
});

// --- resumo ---

test("resumo: cargo sem salário e processo sem horas_mes não quebram a soma", () => {
  const nos: OrgNo[] = [
    no({ no_id: "c:ceo", tipo: "root", pai_no_id: null, ordem: 0, vagas: 1, salarios: [] }),
    no({
      no_id: "c:chro",
      tipo: "cargo",
      pai_no_id: "c:ceo",
      ordem: 0,
      vagas: 1,
      salarios: [], // sem pesquisa de salário
      processos: [
        { titulo: "Planejar workforce", horas_mes: 40, notas: null, apqc: [] },
        { titulo: "Processo sem estimativa", horas_mes: null, notas: null, apqc: [] },
      ],
    }),
    no({
      no_id: "a:pessoas",
      tipo: "area",
      pai_no_id: "c:ceo",
      ordem: 1,
      vagas: null, // área não conta gente
    }),
  ];

  const r = resumo(nos);

  assert.equal(r.cargos, 2); // root + cargo, área não conta
  assert.equal(r.pessoas, 2); // 1 (ceo) + 1 (chro); área não soma vaga
  assert.equal(r.processos, 2);
  assert.equal(r.horasMes, 40); // null vira 0, não quebra a soma
  assert.equal(r.comSalario, 0); // nenhum cargo com salarios.length > 0
});

test("resumo: conta comSalario quando presente", () => {
  const nos: OrgNo[] = [
    no({
      no_id: "c:ceo",
      tipo: "root",
      pai_no_id: null,
      ordem: 0,
      vagas: 1,
      salarios: [
        {
          cargo_pesquisado: "CEO",
          nivel: "senior",
          moeda: "BRL",
          minimo: 30000,
          mediana: 40000,
          maximo: 50000,
          fonte: "Robert Half",
          url: "https://exemplo.com",
          auditoria: "ok",
        },
      ],
    }),
  ];

  const r = resumo(nos);
  assert.equal(r.comSalario, 1);
});

// --- rotuloApqc ---

const apqcMap = new Map<string, string>([
  ["7.1.2.9", "Gerenciar informações e dados de trabalhadores"],
  ["7.1.1.9", "Gerenciar registros de trabalhadores"],
]);

test("rotuloApqc: código existente vira 'nome (APQC codigo)'", () => {
  const out = rotuloApqc("Ver APQC 7.1.2.9 pra detalhe", apqcMap);
  assert.equal(
    out,
    "Ver Gerenciar informações e dados de trabalhadores (APQC 7.1.2.9) pra detalhe",
  );
});

test("rotuloApqc: código inexistente vira 'APQC X (código não achado no PCF v7.4)'", () => {
  const out = rotuloApqc("Ver APQC 9.9.9.9 pra detalhe", apqcMap);
  assert.equal(out, "Ver APQC 9.9.9.9 (código não achado no PCF v7.4) pra detalhe");
});

test("rotuloApqc: lista 'APQC 7.1.2.9, 7.1.1.9 e grupo 7.2' resolve os 2 códigos ligados por vírgula/' e '", () => {
  const out = rotuloApqc("APQC 7.1.2.9, 7.1.1.9 e grupo 7.2", apqcMap);
  assert.equal(
    out,
    "Gerenciar informações e dados de trabalhadores (APQC 7.1.2.9) · Gerenciar registros de trabalhadores (APQC 7.1.1.9) e grupo 7.2",
  );
});

test("rotuloApqc: texto sem menção a APQC passa direto", () => {
  assert.equal(rotuloApqc("nada de código aqui", apqcMap), "nada de código aqui");
});

// --- rotuloCurto ---

test("rotuloCurto: corta no primeiro parêntese e tira espaço", () => {
  assert.equal(rotuloCurto("CHRO (Chief HR Officer)"), "CHRO");
  assert.equal(rotuloCurto("Sem parênteses"), "Sem parênteses");
});
