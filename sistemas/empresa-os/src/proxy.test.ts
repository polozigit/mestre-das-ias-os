import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import testing from "next/experimental/testing/server.js";

// proxy.ts importa pelo alias `@/`, que o node:test não resolve: lê o matcher do próprio arquivo
// (o literal da string, igual ao que o Next analisa) em vez de importar o módulo.
const fonte = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
const literal = fonte.match(/matcher:\s*\[[^\]]*?(\"\/\(\(\?!.*\)\.\*\)\")/)?.[1];
assert.ok(literal, "não achei o matcher em src/proxy.ts");
// A doc do Next 16 cita unstable_doesProxyMatch, mas a 16.2.4 instalada ainda exporta o nome antigo.
const nomes = testing as unknown as Record<string, unknown>;
const doesMatch = (nomes.unstable_doesProxyMatch ?? nomes.unstable_doesMiddlewareMatch) as (a: {
  config: { matcher: string[] };
  url: string;
}) => boolean;
const config = { matcher: [JSON.parse(literal) as string] };

const passaPeloGate = (url: string) => doesMatch({ config, url });

test("a rota /marca (e subcaminhos) passa pelo gate de login", () => {
  assert.equal(passaPeloGate("/marca"), true);
  assert.equal(passaPeloGate("/marca?aba=persona"), true);
  assert.equal(passaPeloGate("/marca/"), true);
  assert.equal(passaPeloGate("/marca/qualquer"), true);
});

test("o logo de public/marca fica fora do gate (carregam no /login)", () => {
  assert.equal(passaPeloGate("/marca/logo.svg"), false);
  assert.equal(passaPeloGate("/marca/favicon.svg"), false);
  assert.equal(passaPeloGate("/marca/logo.png"), false);
  assert.equal(passaPeloGate("/marca/icone.ico"), false);
  assert.equal(passaPeloGate("/favicon.ico"), false);
});

test("o ícone da aba e o logo do fundo escuro também ficam fora do gate", () => {
  assert.equal(passaPeloGate("/icon.svg"), false);
  assert.equal(passaPeloGate("/icon.png"), false);
  assert.equal(passaPeloGate("/apple-icon.png"), false);
  assert.equal(passaPeloGate("/marca/logo-fundo-escuro.png"), false);
});

test("estáticos do Next ficam fora e as telas do app ficam dentro do gate", () => {
  assert.equal(passaPeloGate("/_next/static/chunks/app.js"), false);
  assert.equal(passaPeloGate("/_next/image?url=x"), false);
  for (const rota of ["/", "/inicio", "/login", "/organograma", "/usuarios", "/agentes"]) {
    assert.equal(passaPeloGate(rota), true, rota);
  }
});
