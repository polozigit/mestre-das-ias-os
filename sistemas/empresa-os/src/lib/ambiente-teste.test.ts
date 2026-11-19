import test from "node:test";
import assert from "node:assert/strict";
import { faixaDeTeste } from "./ambiente-teste.ts";

test("preview mostra a faixa", () => {
  assert.equal(faixaDeTeste({ VERCEL_ENV: "preview" }).mostrar, true);
});

test("production não mostra, nem com endereço de produção preenchido", () => {
  const r = faixaDeTeste({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "meu-sistema.com.br" });
  assert.deepEqual(r, { mostrar: false, enderecoProducao: null });
});

test("development não mostra", () => {
  assert.equal(faixaDeTeste({ VERCEL_ENV: "development" }).mostrar, false);
});

test("env vazio (rodando local) não mostra", () => {
  assert.deepEqual(faixaDeTeste({}), { mostrar: false, enderecoProducao: null });
});

test("endereço de produção vem com https:// montado a partir do domínio sem protocolo", () => {
  const r = faixaDeTeste({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "meu-sistema.com.br" });
  assert.equal(r.enderecoProducao, "https://meu-sistema.com.br");
});

test("endereço já com protocolo ou barra final não duplica", () => {
  const r = faixaDeTeste({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "https://meu-sistema.com.br/" });
  assert.equal(r.enderecoProducao, "https://meu-sistema.com.br");
});

test("endereço ausente ou em branco: faixa sem link", () => {
  assert.deepEqual(faixaDeTeste({ VERCEL_ENV: "preview" }), { mostrar: true, enderecoProducao: null });
  assert.deepEqual(faixaDeTeste({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "  " }), {
    mostrar: true,
    enderecoProducao: null,
  });
});
