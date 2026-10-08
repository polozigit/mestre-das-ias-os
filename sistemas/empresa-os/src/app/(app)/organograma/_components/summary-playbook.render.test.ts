import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Regressão do estouro horizontal no celular (375px, 08/10/2026): o <summary> do playbook usava
 * colunas fixas [7.5rem_1fr_auto] e a meta (frequência · h/mês · APQC) nao quebrava, empurrando
 * a página pra 662px. No celular o summary tem que ter coluna 1fr SEM min-content (minmax(0,..)),
 * a meta tem que quebrar (break-words, sem truncate/max-w fora de md:) e as colunas fixas so
 * valem a partir de md:.
 */
register("../../../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { PacoteConteudo } = await import("./PacoteCargo.tsx");

const pacote = {
  cargo_slug: "chro",
  slug: "chro",
  versao: "1",
  data: null,
  validade: null,
  modelou: null,
  aprovou: null,
  pasta: null,
  auditoria: null,
  marcas: { VERIFIED: 0, SNIPPET: 0, premissa: 0, a_modelar: 0 },
  casos_md: null,
  secoes: [],
  playbooks: [
    {
      slug: "pb",
      processo: "Planejamento estratégico de pessoas",
      nivel_minimo: null,
      frequencia: "anual, com revisão trimestral",
      horas_texto: "8",
      apqc: "7.1.2.1",
      papeis: [],
    },
  ],
};

const out = renderToStaticMarkup(
  createElement(PacoteConteudo, { pacote: pacote as never, apqc: new Map(), abertos: new Set<string>(), onToggle: () => {} }),
);
const classes = (re: RegExp) => {
  const m = out.match(re);
  assert.ok(m, `elemento nao encontrado: ${re}`);
  return m![1].split(/\s+/);
};
const semPrefixo = (cs: string[]) => cs.filter((c) => !c.includes(":"));

test("summary do playbook: no celular so coluna flexivel com minmax(0,1fr); fixas so em md:", () => {
  const cs = classes(/<summary class="([^"]*)"/);
  assert.ok(cs.includes("grid-cols-[minmax(0,1fr)_auto]"), "coluna mobile sem minmax(0,1fr)");
  assert.ok(cs.includes("md:grid-cols-[7.5rem_1fr_auto]"), "layout desktop perdido");
  assert.ok(!semPrefixo(cs).some((c) => c.includes("7.5rem")), "coluna fixa 7.5rem vazou pro celular");
});

test("meta do playbook: quebra linha no celular; truncate e largura maxima so em md:", () => {
  const cs = classes(/<span class="([^"]*)" title="anual, com revisão trimestral · 8 h\/mês · APQC 7.1.2.1"/);
  assert.ok(cs.includes("break-words") && cs.includes("min-w-0"), "meta nao quebra no celular");
  const base = semPrefixo(cs);
  assert.ok(!base.includes("truncate"), "truncate no celular");
  assert.ok(!base.some((c) => c.startsWith("max-w-")), "max-w fixo no celular");
});
