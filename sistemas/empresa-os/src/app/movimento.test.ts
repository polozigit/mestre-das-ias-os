import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lerFonte } from "../lib/fonte-para-teste.ts";

/*
 * Movimento e luz (globals.css, seção "Movimento e luz"). O que estes testes seguram são as
 * armadilhas que não aparecem olhando a tela parada:
 *  - animação que fica aplicada (`forwards`/`both`) tira do lugar os painéis `position: fixed`;
 *  - classe animada sem saída para "movimento reduzido";
 *  - o fio de progresso ouvindo o clique depois do <Link> do Next (nunca ligaria);
 *  - a peça existir no CSS mas ninguém ligar na tela.
 */
const ler = (rel: string) => lerFonte(new URL(rel, import.meta.url));
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Bloco `@media (prefers-reduced-motion: reduce) { ... }` inteiro. */
function blocoMovimentoReduzido(): string {
  const inicio = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(inicio, -1, "globals.css sem o bloco de movimento reduzido");
  return css.slice(inicio);
}

test("nenhuma animação fica aplicada depois de terminar (forwards/both desloca painel fixo)", () => {
  const declaracoes = css.match(/animation(?:-fill-mode)?\s*:[^;]+;/g) ?? [];
  assert.ok(declaracoes.length > 5, "esperava as animações da seção de movimento");
  for (const d of declaracoes) assert.doesNotMatch(d, /\b(forwards|both)\b/, d);
});

test("toda classe que se move tem saída no movimento reduzido", () => {
  const reduzido = blocoMovimentoReduzido();
  for (const classe of [
    ".entrada-pagina",
    ".entrada > *",
    ".surgir",
    ".icone-troca",
    ".barra-enche",
    ".traco-acende",
    ".conta-num",
    ".ponto-vivo::after",
    ".palco-luz::before",
    ".brilho",
    ".luz:hover",
    ".sidebar-marca",
    ".aba-marca",
    ".fio-nav",
  ]) {
    assert.ok(reduzido.includes(classe), `movimento reduzido não cobre ${classe}`);
  }
});

test("a luz usa a cor da marca (token), nunca cor fixa", () => {
  assert.match(css, /--luz-forte:\s*color-mix\(in srgb, var\(--acento\)/);
  assert.match(css, /--luz-fraca:\s*color-mix\(in srgb, var\(--acento\)/);
  const secao = css.slice(css.indexOf("--dur-rapida"));
  // `#000` só vale como máscara (transparência), não como cor pintada.
  assert.deepEqual((secao.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((c) => c !== "#000"), []);
});

test("fio de progresso: ouve o clique na captura e chega quando o endereço muda", () => {
  const fio = ler("../components/shell/NavegacaoProgresso.tsx");
  assert.match(fio, /addEventListener\("click", aoClicar, true\)/);
  assert.match(fio, /removeEventListener\("click", aoClicar, true\)/);
  assert.match(fio, /iniciaNavegacaoInterna\(/);
  assert.match(fio, /\}, \[pathname, busca\]\);/);
});

test("as peças estão ligadas nas telas", () => {
  assert.match(ler("./layout.tsx"), /<LuzDoCursor \/>/);
  assert.match(ler("./(app)/layout.tsx"), /<NavegacaoProgresso \/>/);
  assert.match(ler("./(app)/template.tsx"), /className="entrada-pagina"/);
  assert.match(ler("./(public)/login/page.tsx"), /className="palco-luz /);
  assert.match(ler("../components/shell/Sidebar.tsx"), /className="sidebar-marca"/);
  assert.match(ler("../components/ui/SegmentedControl.tsx"), /className="aba-marca"/);
  assert.match(ler("../components/ui/KpiCard.tsx"), /numeroContado\(value\)/);
  assert.match(ler("../components/ui/KpiCard.tsx"), /"barra-enche /);
  assert.match(ler("../components/cronograma/PassoAPasso.tsx"), /className="traco-acende"/);
  assert.match(ler("../components/cronograma/PassoAPasso.tsx"), /"ponto-vivo bg-acento/);
});

test("KpiCard: o valor de verdade continua no texto quando o número conta", () => {
  const kpi = ler("../components/ui/KpiCard.tsx");
  assert.match(kpi, /<span className="sr-only">\{value\}<\/span>/);
  assert.match(kpi, /aria-hidden="true"\s+className="conta-num"/);
});

test("troca de tema: sem o recurso ou com movimento reduzido, troca seca; rejeição do ready tratada", () => {
  const tema = ler("../components/shell/ThemeToggle.tsx");
  assert.match(tema, /semMovimento \|\| typeof document\.startViewTransition !== "function"/);
  assert.match(tema, /transicao\.ready\.catch\(/);
});
