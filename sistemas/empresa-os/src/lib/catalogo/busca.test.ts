import test from "node:test";
import assert from "node:assert/strict";
import {
  camposDoAgente,
  camposDoArtefato,
  casaComBusca,
  contarItens,
  filtrarGruposPorBusca,
  normalizarBusca,
  termosDaBusca,
} from "./busca.ts";

test("normalizar: minúscula, sem acento, sem espaço nas pontas", () => {
  assert.equal(normalizarBusca("  Segurança  "), "seguranca");
  assert.equal(normalizarBusca("DOSSIÊ"), "dossie");
});

test("termos: cada palavra digitada vira um termo; vazio não gera termo", () => {
  assert.deepEqual(termosDaBusca("  Revisor   Segurança "), ["revisor", "seguranca"]);
  assert.deepEqual(termosDaBusca(""), []);
  assert.deepEqual(termosDaBusca("   "), []);
});

test("casa ignorando maiúscula e acento, nos dois sentidos", () => {
  assert.equal(casaComBusca(["Revisor segurança"], "seguranca"), true);
  assert.equal(casaComBusca(["Revisor seguranca"], "SEGURANÇA"), true);
  assert.equal(casaComBusca(["Revisor segurança"], "campanha"), false);
});

test("as palavras valem em qualquer ordem e todas precisam aparecer (E lógico)", () => {
  assert.equal(casaComBusca(["Revisor segurança"], "seguranca revisor"), true);
  assert.equal(casaComBusca(["Revisor segurança"], "revisor campanha"), false);
});

test("a busca olha todos os campos juntos e ignora campo vazio", () => {
  assert.equal(casaComBusca(["Diretor", "marketing-diretor", null, "marketing"], "marketing"), true);
  assert.equal(casaComBusca(["Diretor", undefined, ""], "diretor"), true);
  assert.equal(casaComBusca([], "qualquer"), false);
});

test("busca vazia mostra tudo", () => {
  assert.equal(casaComBusca(["Diretor"], ""), true);
  assert.equal(casaComBusca([], "   "), true);
});

type Agente = { name: string; time: string; descricao_curta: string };
const AGENTES: Agente[] = [
  { name: "marketing-diretor", time: "marketing", descricao_curta: "Coordena campanhas e a voz da marca" },
  { name: "marketing-auditor", time: "marketing", descricao_curta: "Confere o texto antes de publicar" },
  { name: "tecnologia-revisor-seguranca", time: "tecnologia", descricao_curta: "Procura brechas antes do deploy" },
  { name: "pmo-conferente", time: "pmo", descricao_curta: "Confere prazos" },
];
const grupos = [
  { time: "marketing", itens: [AGENTES[0], AGENTES[1]] },
  { time: "pmo", itens: [AGENTES[3]] },
  { time: "tecnologia", itens: [AGENTES[2]] },
];

test("a busca de agentes acha pelo nome amigável, pelo técnico, pela descrição e pelo time", () => {
  const nomes = (busca: string) => filtrarGruposPorBusca(grupos, busca, camposDoAgente).flatMap((g) => g.itens.map((a) => a.name));
  assert.deepEqual(nomes("diretor"), ["marketing-diretor"]);
  assert.deepEqual(nomes("tecnologia-revisor"), ["tecnologia-revisor-seguranca"]);
  assert.deepEqual(nomes("brechas"), ["tecnologia-revisor-seguranca"]);
  assert.deepEqual(nomes("seguranca"), ["tecnologia-revisor-seguranca"]);
  assert.deepEqual(nomes("marketing"), ["marketing-diretor", "marketing-auditor"]);
  assert.deepEqual(nomes("confere"), ["marketing-auditor", "pmo-conferente"]);
});

test("grupo que ficou sem item some; busca sem resultado devolve lista vazia", () => {
  const r = filtrarGruposPorBusca(grupos, "prazos", camposDoAgente);
  assert.deepEqual(r.map((g) => g.time), ["pmo"]);
  assert.deepEqual(filtrarGruposPorBusca(grupos, "zzz", camposDoAgente), []);
  assert.equal(contarItens(filtrarGruposPorBusca(grupos, "zzz", camposDoAgente)), 0);
});

test("busca vazia devolve os mesmos grupos e itens, na mesma ordem", () => {
  const r = filtrarGruposPorBusca(grupos, "", camposDoAgente);
  assert.deepEqual(r.map((g) => [g.time, g.itens.map((a) => a.name)]), grupos.map((g) => [g.time, g.itens.map((a) => a.name)]));
  assert.equal(contarItens(r), 4);
});

test("a busca de skills e workflows usa nome amigável, técnico, resumo e time", () => {
  const skills = [
    { nome: "polozi-criar-ebook", time: "marketing", resumo: "Escreve um ebook completo" },
    { nome: "polozi-registrar-dossie", time: "sistema", resumo: "Guarda o dossiê da empresa" },
  ];
  const acha = (busca: string) => skills.filter((s) => casaComBusca(camposDoArtefato(s), busca)).map((s) => s.nome);
  assert.deepEqual(acha("ebook"), ["polozi-criar-ebook"]);
  assert.deepEqual(acha("dossie"), ["polozi-registrar-dossie"]);
  assert.deepEqual(acha("registrar dossiê"), ["polozi-registrar-dossie"]);
  assert.deepEqual(acha("sistema"), ["polozi-registrar-dossie"]);
  assert.deepEqual(acha("polozi-criar"), ["polozi-criar-ebook"]);
});
