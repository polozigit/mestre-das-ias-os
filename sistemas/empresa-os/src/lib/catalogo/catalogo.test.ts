import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparArtefatos, hrefArtefato, linguagemShiki, nomeArtefatoValido, rotuloOrigem, semFrontmatter, textoDeclarado, tipoDaBusca, vizinhosVisiveis,
  type ArtefatoCard, type VizinhoArtefato,
} from "./catalogo.ts";

const a = (p: Partial<ArtefatoCard>): ArtefatoCard => ({
  id: p.nome ?? "x", tipo: "skill", nome: "x", time: "vendas", resumo: "r", estado: "instalado", ...p,
});

test("tipoDaBusca cai em agente pra valor ausente ou estranho", () => {
  assert.equal(tipoDaBusca(undefined), "agente");
  assert.equal(tipoDaBusca("skill"), "skill");
  assert.equal(tipoDaBusca(["workflow", "skill"]), "workflow");
  assert.equal(tipoDaBusca("DROP"), "agente");
});

test("nomeArtefatoValido barra caminho, maiuscula e vazio", () => {
  assert.equal(nomeArtefatoValido("polozi-analisar-vendas"), true);
  assert.equal(nomeArtefatoValido("empresa-os.ci"), true);
  for (const ruim of ["", "../x", "A", "a/b", "-x", "x".repeat(81), "a b", "a..b", "a.."]) {
    assert.equal(nomeArtefatoValido(ruim), false, ruim);
  }
});

test("agruparArtefatos esconde aposentado e poe sistema por ultimo", () => {
  const g = agruparArtefatos([
    a({ nome: "s1", time: "sistema" }), a({ nome: "v1", time: "vendas" }),
    a({ nome: "g1", time: "gestão" }), a({ nome: "v0", time: "vendas", estado: "aposentado" }),
  ], false);
  assert.deepEqual(g.map((x) => x.time), ["gestão", "vendas", "sistema"]);
  assert.deepEqual(g[1].itens.map((x) => x.nome), ["v1"]);
  assert.equal(agruparArtefatos([a({ estado: "aposentado" })], true)[0].itens.length, 1);
  assert.deepEqual(agruparArtefatos([], false), []);
});

test("hrefArtefato monta a rota de cada tipo com nome codificado", () => {
  assert.equal(hrefArtefato("agente", "polozi-guardiao"), "/agentes/polozi-guardiao");
  assert.equal(hrefArtefato("skill", "x"), "/agentes/skills/x");
  assert.equal(hrefArtefato("workflow", "empresa-os.ci"), "/agentes/workflows/empresa-os.ci");
});

test("linguagemShiki mapeia e cai em text", () => {
  assert.equal(linguagemShiki("python"), "python");
  assert.equal(linguagemShiki("texto"), "text");
  assert.equal(linguagemShiki("cobol"), "text");
  assert.equal(linguagemShiki("constructor"), "text");
});

test("textoDeclarado devolve null pra vazio (a tela esconde o campo, nunca escreve 'não declarado')", () => {
  assert.equal(textoDeclarado(null), null);
  assert.equal(textoDeclarado(undefined), null);
  assert.equal(textoDeclarado("  "), null);
  assert.equal(textoDeclarado("  contents: read \n"), "contents: read");
});

test("rotuloOrigem traduz as 5 origens da migration 0022 e não mostra 'núcleo' nem 'casa'", () => {
  assert.deepEqual(["nucleo", "time", "plugin", "sistema", "casa"].map(rotuloOrigem), [
    "kit base", "time do kit", "plugin", "sistema", "criado na sua empresa",
  ]);
  assert.equal(rotuloOrigem("outra"), "outra");
  assert.equal(rotuloOrigem("toString"), "toString");
});

test("semFrontmatter tira o bloco --- do inicio e preserva o resto", () => {
  assert.equal(semFrontmatter("---\nname: x\ndescription: y\n---\n\n# Titulo\ncorpo"), "# Titulo\ncorpo");
  assert.equal(semFrontmatter("---\r\nname: x\r\n---\r\n# T"), "# T");
  assert.equal(semFrontmatter("---\nname: x\n---"), "");
});

test("semFrontmatter nao mexe em texto sem frontmatter, com --- no meio ou sem fechamento", () => {
  const sem = "# Titulo\n\ntexto";
  assert.equal(semFrontmatter(sem), sem);
  const meio = "# Titulo\n---\nname: x\n---\nfim";
  assert.equal(semFrontmatter(meio), meio);
  const aberto = "---\nname: x\nsem fechar";
  assert.equal(semFrontmatter(aberto), aberto);
  const regua = "---\n\ntexto depois de regua horizontal";
  assert.equal(semFrontmatter(regua), regua);
});

const v = (p: Partial<VizinhoArtefato>): VizinhoArtefato => ({
  tipo: "skill", nome: "x", resumo: "r", estado: "instalado", ...p,
});

test("vizinhosVisiveis tira aposentado, nulo e repetido, e ordena por nome", () => {
  const r = vizinhosVisiveis([
    v({ nome: "zeta" }), null, v({ nome: "alfa" }), v({ nome: "velha", estado: "aposentado" }),
    v({ nome: "alfa", resumo: "repetida" }), v({ nome: "beta", estado: "disponivel" }),
  ]);
  assert.deepEqual(r.map((x) => x.nome), ["alfa", "beta", "zeta"]);
});

test("vizinhosVisiveis: mesmo nome em tipos diferentes sao dois vizinhos; lista vazia ou so nula vira vazia", () => {
  const r = vizinhosVisiveis([v({ tipo: "skill", nome: "igual" }), v({ tipo: "agente", nome: "igual" })]);
  assert.equal(r.length, 2);
  assert.deepEqual(vizinhosVisiveis([]), []);
  assert.deepEqual(vizinhosVisiveis([null, null]), []);
});
