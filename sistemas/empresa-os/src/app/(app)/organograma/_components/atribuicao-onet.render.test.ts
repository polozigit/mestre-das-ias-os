import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Render DE VERDADE do conteúdo do pacote: a atribuição O*NET (CC BY 4.0) tem que estar na
 * tela, fora de qualquer <details> recolhido, sempre que o dado tem conteúdo O*NET, e sumir
 * quando não tem. Se alguém tirar o <AtribuicaoOnet> do PacoteConteudo, este teste falha.
 */
register("../../../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { PacoteConteudo } = await import("./PacoteCargo.tsx");

const FRASE =
  "O*NET 31.0 Database, USDOL/ETA, CC BY 4.0 (onetcenter.org/license_db.html), modificado pela Polozi; o USDOL/ETA não endossa este uso.";

const pacote = (markdown: string) => ({
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
  secoes: [{ titulo: "1. Identidade", markdown }],
  playbooks: [],
});

const html = (p: ReturnType<typeof pacote>) =>
  renderToStaticMarkup(
    createElement(PacoteConteudo, { pacote: p, apqc: new Map(), abertos: new Set<string>(), onToggle: () => {} }),
  );

test("dado com O*NET: atribuição visível, com link da licença, fora do <details>", () => {
  const out = html(pacote(`- ocupação: HR Managers (11-3121.00) · crédito: ${FRASE}`));
  const i = out.indexOf("data-atribuicao-onet");
  assert.ok(i > 0, "atribuição ausente da tela");
  const depoisDosDetalhes = out.lastIndexOf("</details>");
  assert.ok(i > depoisDosDetalhes, "atribuição está dentro de uma parte recolhida");
  assert.match(out, /href="https:\/\/www\.onetcenter\.org\/license_db\.html"/);
  assert.match(out, /O\*NET 31\.0 Database/);
  assert.match(out, /USDOL\/ETA não endossa este uso/);
});

test("dado cita O*NET sem a frase: atribuição padrão aparece", () => {
  assert.match(html(pacote("ocupação O*NET 15-1243.00")), /data-atribuicao-onet/);
});

test("dado sem O*NET: nenhuma atribuição", () => {
  assert.doesNotMatch(html(pacote("Só SFIA e CBO.")), /data-atribuicao-onet/);
});
