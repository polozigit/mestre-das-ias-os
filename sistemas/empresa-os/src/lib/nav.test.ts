import test from "node:test";
import assert from "node:assert/strict";
import { NAV_GRUPOS, caminhoDoItem, filtrarNav, itemAtivo, type NavItem } from "./nav.ts";
import { MODULO_ROTA, pode } from "./auth/permissoes.ts";
import { lerFonte } from "./fonte-para-teste.ts";

const todosItens = NAV_GRUPOS.flatMap((g) => g.itens);
const rotulosVisiveis = (grupos: ReturnType<typeof filtrarNav>) => grupos.flatMap((g) => g.itens.map((i) => i.label));
const itemDe = (label: string): NavItem => {
  const item = todosItens.find((i) => i.label === label);
  assert.ok(item, `item "${label}" não existe no menu`);
  return item;
};

test("o menu é agrupado por diretoria, com os grupos, itens e textos combinados", () => {
  assert.deepEqual(
    NAV_GRUPOS.map((g) => [g.titulo, g.itens.map((i) => [i.label, i.href])]),
    [
      [null, [["Início", "/inicio"]]],
      ["Mestre das IAs", [["Cronograma", "/cronograma"], ["Tarefas do curso", "/tarefas?trilha=curso"]]],
      ["Gestão", [["Tarefas", "/tarefas"], ["Organograma", "/organograma"]]],
      ["Marketing", [["Marca", "/marca"]]],
      ["Tecnologia", [["Agentes e skills", "/agentes"], ["Atividade", "/atividade"], ["Usuários", "/usuarios"], ["Configurações", "/configuracoes"]]],
    ],
  );
});

test("o menu antigo (Empresa, Estrutura, Sistema) não existe mais", () => {
  const titulos = NAV_GRUPOS.map((g) => g.titulo);
  for (const antigo of ["Empresa", "Estrutura", "Sistema"]) assert.ok(!titulos.includes(antigo), antigo);
});

test("cada grupo tem id único e só o primeiro (o Início) fica sem título", () => {
  assert.equal(new Set(NAV_GRUPOS.map((g) => g.id)).size, NAV_GRUPOS.length);
  assert.deepEqual(NAV_GRUPOS.map((g) => g.titulo === null), [true, false, false, false, false]);
});

test("nenhum grupo vazio sobra depois do filtro", () => {
  const r = filtrarNav(NAV_GRUPOS, (m) => m === "inicio");
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].itens.map((i) => i.href), ["/inicio"]);
});

test("todo item aponta pra rota do próprio módulo (a query não conta)", () => {
  for (const i of todosItens) assert.equal(caminhoDoItem(i), MODULO_ROTA[i.modulo], i.label);
});

test("href de item é único (serve de chave no menu)", () => {
  assert.equal(new Set(todosItens.map((i) => i.href)).size, todosItens.length);
});

test("dono vê os 10 itens", () => {
  const r = filtrarNav(NAV_GRUPOS, () => true);
  assert.equal(r.flatMap((g) => g.itens).length, 10);
});

test("sem nenhuma permissão o menu fica vazio", () => {
  assert.deepEqual(filtrarNav(NAV_GRUPOS, () => false), []);
});

test("permissão filtra item a item: só tarefas.read mostra Cronograma, Tarefas do curso e Tarefas", () => {
  const leitor = { eDono: false, permissoes: ["tarefas.read"] };
  const r = filtrarNav(NAV_GRUPOS, (m) => pode(leitor, m));
  assert.deepEqual(rotulosVisiveis(r), ["Início", "Cronograma", "Tarefas do curso", "Tarefas"]);
  assert.deepEqual(r.map((g) => g.titulo), [null, "Mestre das IAs", "Gestão"]);
});

test("grupo some quando nenhum item dele passa na permissão (Marketing sem documentos.read)", () => {
  const semMarca = { eDono: false, permissoes: ["organograma.read", "agentes.read"] };
  const r = filtrarNav(NAV_GRUPOS, (m) => pode(semMarca, m));
  assert.deepEqual(r.map((g) => g.titulo), [null, "Gestão", "Tecnologia"]);
  assert.deepEqual(rotulosVisiveis(r), ["Início", "Organograma", "Agentes e skills"]);
});

// --- Item aceso: caminho E query `trilha` ---
test('lista do dia a dia (/tarefas): só "Tarefas" acende', () => {
  assert.equal(itemAtivo(itemDe("Tarefas"), "/tarefas", "trabalho"), true);
  assert.equal(itemAtivo(itemDe("Tarefas do curso"), "/tarefas", "trabalho"), false);
});

test('lista do curso (/tarefas?trilha=curso): só "Tarefas do curso" acende', () => {
  assert.equal(itemAtivo(itemDe("Tarefas do curso"), "/tarefas", "curso"), true);
  assert.equal(itemAtivo(itemDe("Tarefas"), "/tarefas", "curso"), false);
});

test("detalhe de tarefa (/tarefas/<id>) acende o item do grupo da tarefa", () => {
  assert.equal(itemAtivo(itemDe("Tarefas"), "/tarefas/abc", "trabalho"), true);
  assert.equal(itemAtivo(itemDe("Tarefas do curso"), "/tarefas/abc", "curso"), true);
  assert.equal(itemAtivo(itemDe("Tarefas"), "/tarefas/abc", "curso"), false);
});

test("os dois itens de tarefas nunca acendem juntos, em nenhum caminho nem grupo", () => {
  const doCurso = itemDe("Tarefas do curso");
  const doDiaADia = itemDe("Tarefas");
  for (const pathname of ["/tarefas", "/tarefas/abc", "/cronograma", "/inicio", "/tarefasx"]) {
    for (const grupo of ["trabalho", "curso"] as const) {
      const acesos = [itemAtivo(doCurso, pathname, grupo), itemAtivo(doDiaADia, pathname, grupo)].filter(Boolean);
      assert.ok(acesos.length <= 1, `${pathname} (${grupo}) acendeu os dois`);
    }
  }
});

test("os demais itens acendem só pelo caminho, seja qual for a trilha da URL", () => {
  for (const grupo of ["trabalho", "curso"] as const) {
    assert.equal(itemAtivo(itemDe("Cronograma"), "/cronograma", grupo), true);
    assert.equal(itemAtivo(itemDe("Agentes e skills"), "/agentes/polozi-qa", grupo), true);
    assert.equal(itemAtivo(itemDe("Organograma"), "/tarefas", grupo), false);
  }
});

test("prefixo parecido não acende (/tarefasx não é /tarefas)", () => {
  assert.equal(itemAtivo(itemDe("Tarefas"), "/tarefasx", "trabalho"), false);
  assert.equal(itemAtivo(itemDe("Início"), "/inicio-novo", "trabalho"), false);
});

// --- A Sidebar usa essas regras (sem renderizar: o node --test não lê JSX) ---
test("a Sidebar acende pelo itemAtivo com a trilha da URL e não desenha título quando o grupo não tem", () => {
  const fonte = lerFonte(new URL("../components/shell/Sidebar.tsx", import.meta.url));
  assert.match(fonte, /useSearchParams\(\)/);
  assert.match(fonte, /grupoDaBusca\(/);
  assert.match(fonte, /itemAtivo\(item, pathname, grupoAberto\)/);
  assert.match(fonte, /\{grupo\.titulo && \(/);
  assert.doesNotMatch(fonte, /pathname\.startsWith/);
});
