import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agruparPorTipo,
  contarPorTipo,
  deveBuscarDocumentos,
  escaparTermoBusca,
  filtrarDocumentos,
  formatarTamanhoKB,
  montarFiltroBuscaDocumentos,
  TIPO_ORDEM,
  TIPO_ROTULO,
  rotuloEspecialista,
} from "./documentos.ts";
import type { OrgDocumentoResumo, OrgDocumentoTipo } from "./tipos.ts";

function doc(parcial: Partial<OrgDocumentoResumo> & { caminho: string }): OrgDocumentoResumo {
  return {
    tipo: "frente",
    titulo: parcial.caminho,
    resumo: null,
    tamanho: 0,
    ordem: 0,
    pacote_slug: null,
    cargo_slug: null,
    especialista: null,
    ...parcial,
  };
}

// --- escaparTermoBusca ---

test("escaparTermoBusca: texto simples passa direto", () => {
  assert.equal(escaparTermoBusca("cultura"), "cultura");
});

test("escaparTermoBusca: escapa % e _ (curinga do ILIKE) com barra invertida", () => {
  assert.equal(escaparTermoBusca("50%_ok"), "50\\%\\_ok");
});

test("escaparTermoBusca: escapa aspas dupla e barra invertida embutidas", () => {
  assert.equal(escaparTermoBusca('diz "oi" C:\\pasta'), 'diz \\"oi\\" C:\\\\pasta');
});

test("escaparTermoBusca: barra invertida escapada ANTES de % e _ (não escapa em dobro)", () => {
  assert.equal(escaparTermoBusca("a\\b"), "a\\\\b");
});

test("escaparTermoBusca: vírgula do usuário passa direto (fica protegida pelas aspas no filtro)", () => {
  assert.equal(escaparTermoBusca("dossiê, auditoria"), "dossiê, auditoria");
});

// --- montarFiltroBuscaDocumentos ---

test("montarFiltroBuscaDocumentos: termo simples vira ilike em titulo e markdown, entre aspas duplas", () => {
  assert.equal(
    montarFiltroBuscaDocumentos("cultura"),
    'titulo.ilike."%cultura%",markdown.ilike."%cultura%"',
  );
});

test("montarFiltroBuscaDocumentos: termo com vírgula não cria um 3º termo no .or() — fica dentro das aspas", () => {
  const filtro = montarFiltroBuscaDocumentos("dossiê, auditoria");
  assert.equal(
    filtro,
    'titulo.ilike."%dossiê, auditoria%",markdown.ilike."%dossiê, auditoria%"',
  );
  // só 1 vírgula FORA de aspas duplas: a que separa titulo.ilike de markdown.ilike
  const foraDeAspas = filtro.split('"').filter((_, i) => i % 2 === 0).join("");
  assert.equal(foraDeAspas.split(",").length, 2, "1 vírgula fora de aspas = 2 pedaços");
});

test("montarFiltroBuscaDocumentos: espaço nas pontas do termo não entra no padrão", () => {
  assert.equal(
    montarFiltroBuscaDocumentos("  cultura  "),
    'titulo.ilike."%cultura%",markdown.ilike."%cultura%"',
  );
});

// --- deveBuscarDocumentos ---

test("deveBuscarDocumentos: menos de 3 caracteres (após trim) não consulta", () => {
  assert.equal(deveBuscarDocumentos(""), false);
  assert.equal(deveBuscarDocumentos("ab"), false);
  assert.equal(deveBuscarDocumentos("  ab  "), false);
});

test("deveBuscarDocumentos: 3+ caracteres consulta", () => {
  assert.equal(deveBuscarDocumentos("abc"), true);
  assert.equal(deveBuscarDocumentos("  abc  "), true);
});

// --- contarPorTipo ---

test("contarPorTipo: conta por tipo, incluindo tipo sem documento (0)", () => {
  const docs = [doc({ caminho: "a", tipo: "frente" }), doc({ caminho: "b", tipo: "frente" }), doc({ caminho: "c", tipo: "pesquisa" })];
  const c = contarPorTipo(docs);
  assert.equal(c.frente, 2);
  assert.equal(c.pesquisa, 1);
  assert.equal(c.gestao, 0);
  assert.equal(Object.keys(c).length, TIPO_ORDEM.length);
});

// --- agruparPorTipo ---

test("agruparPorTipo: agrupa na ordem fixa de TIPO_ORDEM, tipo vazio fica de fora", () => {
  const docs = [
    doc({ caminho: "p1", tipo: "pesquisa", ordem: 2 }),
    doc({ caminho: "f1", tipo: "frente", ordem: 1 }),
    doc({ caminho: "p2", tipo: "pesquisa", ordem: 1 }),
  ];
  const grupos = agruparPorTipo(docs);
  assert.deepEqual(
    grupos.map((g) => g.tipo),
    ["frente", "pesquisa"], // ordem de TIPO_ORDEM, não a ordem de inserção no array
  );
  assert.equal(grupos.find((g) => g.tipo === "pesquisa")?.documentos.map((d) => d.caminho).join(","), "p2,p1");
});

test("agruparPorTipo: rótulo em português correto por tipo", () => {
  const docs = [doc({ caminho: "a", tipo: "area_maturidade" })];
  const grupos = agruparPorTipo(docs);
  assert.equal(grupos[0].rotulo, "Áreas (maturidade)");
});

test("agruparPorTipo: lista vazia devolve array vazio", () => {
  assert.deepEqual(agruparPorTipo([]), []);
});

// --- filtrarDocumentos ---

test("filtrarDocumentos: sem filtro devolve tudo", () => {
  const docs = [doc({ caminho: "a" }), doc({ caminho: "b" })];
  assert.equal(filtrarDocumentos(docs, {}).length, 2);
});

test("filtrarDocumentos: por tipo", () => {
  const docs = [doc({ caminho: "a", tipo: "frente" }), doc({ caminho: "b", tipo: "pesquisa" })];
  const out = filtrarDocumentos(docs, { tipo: "pesquisa" as OrgDocumentoTipo });
  assert.deepEqual(out.map((d) => d.caminho), ["b"]);
});

test("filtrarDocumentos: por caminhosBusca (resultado do banco)", () => {
  const docs = [doc({ caminho: "a" }), doc({ caminho: "b" }), doc({ caminho: "c" })];
  const out = filtrarDocumentos(docs, { caminhosBusca: ["b", "c"] });
  assert.deepEqual(out.map((d) => d.caminho).sort(), ["b", "c"]);
});

test("filtrarDocumentos: tipo E caminhosBusca combinados em AND", () => {
  const docs = [
    doc({ caminho: "a", tipo: "frente" }),
    doc({ caminho: "b", tipo: "pesquisa" }),
    doc({ caminho: "c", tipo: "pesquisa" }),
  ];
  const out = filtrarDocumentos(docs, { tipo: "pesquisa" as OrgDocumentoTipo, caminhosBusca: ["a", "b"] });
  assert.deepEqual(out.map((d) => d.caminho), ["b"]);
});

test("filtrarDocumentos: caminhosBusca vazio (0 resultado de busca) devolve lista vazia, não 'sem filtro'", () => {
  const docs = [doc({ caminho: "a" })];
  assert.deepEqual(filtrarDocumentos(docs, { caminhosBusca: [] }), []);
});

// --- formatarTamanhoKB ---

test("formatarTamanhoKB: formata em KB com vírgula decimal pt-BR", () => {
  assert.equal(formatarTamanhoKB(1024), "1 KB");
  assert.equal(formatarTamanhoKB(1536), "1,5 KB");
  assert.equal(formatarTamanhoKB(2048 * 10), "20 KB");
});

test("formatarTamanhoKB: menor que 1 KB arredonda com 1 casa", () => {
  assert.equal(formatarTamanhoKB(512), "0,5 KB");
});

test("rotuloEspecialista: nome conhecido e fallback legível", () => {
  assert.equal(rotuloEspecialista("chet-holmes"), "Chet Holmes");
  assert.equal(rotuloEspecialista("brunson"), "Russell Brunson");
  assert.equal(rotuloEspecialista("jim-collins"), "Jim Collins");
});

test("TIPO_ORDEM e TIPO_ROTULO cobrem os tipos de especialista", () => {
  for (const t of ["fonte_especialista", "especialista", "playbook_compartilhado"] as const) {
    assert.ok(TIPO_ORDEM.includes(t), t);
    assert.ok(TIPO_ROTULO[t], t);
  }
});
