import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Render DE VERDADE do menu lateral dentro dos contextos de navegação do Next (caminho e query da URL):
 * quais itens aparecem para cada permissão, em que grupo, e qual acende em cada página. Os componentes
 * (.tsx) entram pelos ganchos de teste e saem como HTML.
 */
register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { Sidebar } = await import("./Sidebar.tsx");
const { PermissionsProvider } = await import("@/lib/auth/PermissionsProvider.tsx");
const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");

type SessaoDeTeste = { usuarioId: string; nome: string; email: string; eDono: boolean; senhaTrocadaEm: string | null; permissoes: string[] };
// O provedor pede `children` nas props; o createElement do teste passa como argumento (regra do lint).
const Provedor = PermissionsProvider as unknown as ComponentType<{ sessao: SessaoDeTeste; children?: ReactNode }>;
const DONO: SessaoDeTeste = { usuarioId: "u1", nome: "Joana", email: "joana@exemplo.com", eDono: true, senhaTrocadaEm: null, permissoes: [] };
const LEITOR: SessaoDeTeste = { ...DONO, eDono: false, permissoes: ["tarefas.read"] };

function menu(pathname: string, busca = "", sessao: SessaoDeTeste = DONO): string {
  return renderToStaticMarkup(
    createElement(
      PathnameContext.Provider,
      { value: pathname },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(busca) as never },
        createElement(Provedor, { sessao }, createElement(Sidebar)),
      ),
    ),
  );
}

/** Rótulos dos links do menu, na ordem em que aparecem (o aria-label de cada <a>). */
function itens(html: string): string[] {
  return (html.match(/<a [^>]*>/g) ?? []).map((a) => /aria-label="([^"]*)"/.exec(a)?.[1] ?? "").filter(Boolean);
}
/** Rótulo e endereço de cada link do menu (a ordem dos atributos no HTML não importa). */
function links(html: string): { rotulo: string; href: string }[] {
  return (html.match(/<a [^>]*>/g) ?? []).map((a) => ({
    rotulo: /aria-label="([^"]*)"/.exec(a)?.[1] ?? "",
    href: /href="([^"]*)"/.exec(a)?.[1] ?? "",
  }));
}
/** Rótulos dos links acesos (aria-current="page"). */
function acesos(html: string): string[] {
  return (html.match(/<a [^>]*>/g) ?? [])
    .filter((a) => /aria-current="page"/.test(a))
    .map((a) => /aria-label="([^"]*)"/.exec(a)?.[1] ?? "?");
}
/** Títulos dos grupos (os textos em caixa alta do menu). */
function grupos(html: string): string[] {
  return [...html.matchAll(/<p class="sidebar-group-title[^"]*">([^<]*)<\/p>/g)].map((m) => m[1]);
}

test("o dono vê os 10 itens, na ordem e nos grupos combinados", () => {
  const h = menu("/inicio");
  assert.deepEqual(itens(h), [
    "Início", "Cronograma", "Tarefas do curso", "Tarefas", "Organograma", "Marca",
    "Agentes e skills", "Atividade", "Usuários", "Configurações",
  ]);
  assert.deepEqual(grupos(h), ["Mestre das IAs", "Gestão", "Marketing", "Tecnologia"]);
});

test("os links levam aos endereços certos, e os dois de tarefas se distinguem pela query", () => {
  assert.deepEqual(links(menu("/inicio")), [
    { rotulo: "Início", href: "/inicio" },
    { rotulo: "Cronograma", href: "/cronograma" },
    { rotulo: "Tarefas do curso", href: "/tarefas?trilha=curso" },
    { rotulo: "Tarefas", href: "/tarefas" },
    { rotulo: "Organograma", href: "/organograma" },
    { rotulo: "Marca", href: "/marca" },
    { rotulo: "Agentes e skills", href: "/agentes" },
    { rotulo: "Atividade", href: "/atividade" },
    { rotulo: "Usuários", href: "/usuarios" },
    { rotulo: "Configurações", href: "/configuracoes" },
  ]);
});

test("o menu antigo (Empresa, Estrutura, Sistema) sumiu", () => {
  const titulos = grupos(menu("/inicio"));
  for (const antigo of ["Empresa", "Estrutura", "Sistema"]) assert.ok(!titulos.includes(antigo), antigo);
});

test("lista do dia a dia (/tarefas): acende só 'Tarefas'", () => {
  assert.deepEqual(acesos(menu("/tarefas")), ["Tarefas"]);
});

test("lista do curso (/tarefas?trilha=curso): acende só 'Tarefas do curso'", () => {
  assert.deepEqual(acesos(menu("/tarefas", "trilha=curso")), ["Tarefas do curso"]);
  assert.deepEqual(acesos(menu("/tarefas", "trilha=plano90")), ["Tarefas do curso"]);
});

test("detalhe de tarefa: o item do grupo da tarefa continua aceso (a query vem no link do detalhe)", () => {
  assert.deepEqual(acesos(menu("/tarefas/abc")), ["Tarefas"]);
  assert.deepEqual(acesos(menu("/tarefas/abc", "trilha=curso")), ["Tarefas do curso"]);
});

test("query estranha cai no dia a dia e nunca acende os dois", () => {
  assert.deepEqual(acesos(menu("/tarefas", "trilha=qualquer-coisa")), ["Tarefas"]);
  for (const busca of ["", "trilha=curso", "trilha=trabalho", "trilha=plano90", "trilha=x"]) {
    assert.ok(acesos(menu("/tarefas", busca)).length <= 1, busca);
  }
});

test("as outras páginas acendem o próprio item e nada mais", () => {
  assert.deepEqual(acesos(menu("/cronograma")), ["Cronograma"]);
  assert.deepEqual(acesos(menu("/inicio")), ["Início"]);
  assert.deepEqual(acesos(menu("/agentes/marketing-diretor")), ["Agentes e skills"]);
  assert.deepEqual(acesos(menu("/marca", "aba=dossie")), ["Marca"]);
  assert.deepEqual(acesos(menu("/configuracoes")), ["Configurações"]);
});

test("permissão decide quem aparece: só tarefas.read vê Cronograma, Tarefas do curso e Tarefas", () => {
  const h = menu("/inicio", "", LEITOR);
  assert.deepEqual(itens(h), ["Início", "Cronograma", "Tarefas do curso", "Tarefas"]);
  assert.deepEqual(grupos(h), ["Mestre das IAs", "Gestão"]);
});

test("sem nenhuma permissão sobra o Início e nenhum título de grupo", () => {
  const h = menu("/inicio", "", { ...DONO, eDono: false, permissoes: [] });
  assert.deepEqual(itens(h), ["Início"]);
  assert.deepEqual(grupos(h), []);
});

test("o grupo do Início não tem título (o primeiro item fica solto no topo)", () => {
  const h = menu("/inicio");
  assert.ok(h.indexOf('aria-label="Início"') < h.indexOf("Mestre das IAs"));
});
