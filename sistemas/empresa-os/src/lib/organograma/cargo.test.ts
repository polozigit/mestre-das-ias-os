import assert from "node:assert/strict";
import { test } from "node:test";

import { apqcSemNotas, fatosCargo, itensIndiceCargo } from "./cargo.ts";
import type { OrgNo, OrgPacoteResumo, OrgProcesso } from "./tipos.ts";

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

// --- fatosCargo ---

test("fatosCargo: sem nenhum campo preenchido devolve lista vazia", () => {
  const n = no({ no_id: "c:x", tipo: "cargo" });
  assert.deepEqual(fatosCargo(n), []);
});

test("fatosCargo: mostra sigla, aparece_a_partir_de e vagas quando presentes", () => {
  const n = no({
    no_id: "c:chro",
    tipo: "cargo",
    titulo: "CHRO",
    sigla: "CHRO",
    cargo_real: "Diretor de Pessoas (CHRO)",
    aparece_a_partir_de: 150,
    vagas: 1,
  });
  assert.deepEqual(fatosCargo(n), [
    { rotulo: "Sigla", valor: "CHRO" },
    { rotulo: "Cargo real", valor: "Diretor de Pessoas (CHRO)" },
    { rotulo: "Aparece a partir de", valor: "150 pessoas" },
    { rotulo: "Vagas de referência", valor: "1" },
  ]);
});

test("fatosCargo: omite 'Cargo real' quando é igual ao título (não repete a mesma coisa 2x)", () => {
  const n = no({ no_id: "c:x", tipo: "cargo", titulo: "CHRO", sigla: "CHRO", cargo_real: "CHRO" });
  assert.deepEqual(fatosCargo(n), [{ rotulo: "Sigla", valor: "CHRO" }]);
});

test("fatosCargo: vagas 0 ainda entra (0 é dado, não ausência — só null é omitido)", () => {
  const n = no({ no_id: "c:x", tipo: "cargo", vagas: 0 });
  assert.deepEqual(fatosCargo(n), [{ rotulo: "Vagas de referência", valor: "0" }]);
});

// --- apqcSemNotas ---

function processo(parcial: Partial<OrgProcesso>): OrgProcesso {
  return { titulo: "x", horas_mes: null, notas: null, apqc: [], ...parcial };
}

test("apqcSemNotas: mantém código que não aparece na nota", () => {
  const p = processo({ notas: null, apqc: ["7.1.2"] });
  assert.deepEqual(apqcSemNotas(p), ["7.1.2"]);
});

test("apqcSemNotas: remove código já citado na nota (não repete a mesma linha 2x)", () => {
  const p = processo({
    notas: "Planejar a força de trabalho (APQC 7.1.2.1)",
    apqc: ["7.1.2.1"],
  });
  assert.deepEqual(apqcSemNotas(p), []);
});

test("apqcSemNotas: notas null não quebra e mantém todos os códigos", () => {
  const p = processo({ notas: null, apqc: ["7.1.2.1", "7.2.1"] });
  assert.deepEqual(apqcSemNotas(p), ["7.1.2.1", "7.2.1"]);
});

test("apqcSemNotas: mistura — filtra só o que está citado na nota, mantém o resto", () => {
  const p = processo({ notas: "algo (APQC 7.1.2.1)", apqc: ["7.1.2.1", "7.2.1"] });
  assert.deepEqual(apqcSemNotas(p), ["7.2.1"]);
});

// --- itensIndiceCargo ---

function pacoteResumo(parcial: Partial<OrgPacoteResumo> & { n_playbooks: number }): OrgPacoteResumo {
  return { slug: "x", versao: "1", data: "2026-01-01", aprovou: null, ...parcial };
}

test("itensIndiceCargo: cargo mínimo (sem processo, referência ou pacote) só tem Resumo e Salário", () => {
  const n = no({ no_id: "c:x", tipo: "cargo" });
  assert.deepEqual(
    itensIndiceCargo(n).map((i) => i.href),
    ["#cargo-resumo", "#cargo-salario"],
  );
});

test("itensIndiceCargo: área não ganha link de Salário", () => {
  const n = no({ no_id: "a:x", tipo: "area" });
  assert.deepEqual(
    itensIndiceCargo(n).map((i) => i.href),
    ["#cargo-resumo"],
  );
});

test("itensIndiceCargo: cargo completo traz todos os blocos, na ordem de exibição na tela", () => {
  const n = no({
    no_id: "c:chro",
    tipo: "cargo",
    processos: [processo({ titulo: "p1" })],
    referencias: ["ref1"],
    pacote: pacoteResumo({ n_playbooks: 19 }),
  });
  assert.deepEqual(
    itensIndiceCargo(n).map((i) => i.href),
    ["#cargo-resumo", "#cargo-processos", "#cargo-salario", "#cargo-referencias", "#pacote-playbooks", "#pacote-partes"],
  );
});

test("itensIndiceCargo: rótulo de Playbooks usa a contagem do pacote", () => {
  const n = no({ no_id: "c:chro", tipo: "cargo", pacote: pacoteResumo({ n_playbooks: 19 }) });
  const item = itensIndiceCargo(n).find((i) => i.href === "#pacote-playbooks");
  assert.equal(item?.rotulo, "Playbooks · 19");
});
