import test from "node:test";
import assert from "node:assert/strict";
import {
  SENHA_PROVISORIA,
  deveAvisarSenhaProvisoria,
  precisaTrocarSenha,
  validarNovaSenha,
} from "./senha-provisoria.ts";

test("a senha provisória é a combinada", () => {
  assert.equal(SENHA_PROVISORIA, "mudar@123");
});

test("precisaTrocarSenha: só com senha_provisoria === true", () => {
  assert.equal(precisaTrocarSenha({ user_metadata: { senha_provisoria: true } }), true);
  assert.equal(precisaTrocarSenha({ user_metadata: { senha_provisoria: false } }), false);
  assert.equal(precisaTrocarSenha({ user_metadata: { senha_provisoria: "true" } }), false);
  assert.equal(precisaTrocarSenha({ user_metadata: {} }), false);
  assert.equal(precisaTrocarSenha({}), false);
  assert.equal(precisaTrocarSenha(null), false);
  assert.equal(precisaTrocarSenha(undefined), false);
});

test("validarNovaSenha: senha boa e igual passa", () => {
  assert.equal(validarNovaSenha("minhasenha1", "minhasenha1"), null);
});

test("validarNovaSenha: curta demais", () => {
  assert.match(validarNovaSenha("abc1234", "abc1234") ?? "", /pelo menos 8/);
  assert.equal(validarNovaSenha("abc12345", "abc12345"), null);
});

test("validarNovaSenha: senhas diferentes", () => {
  assert.match(validarNovaSenha("minhasenha1", "minhasenha2") ?? "", /não são iguais/);
});

test("validarNovaSenha: recusa a própria senha provisória", () => {
  assert.match(validarNovaSenha("mudar@123", "mudar@123") ?? "", /provisória/);
});

test("aviso: aparece em produção e local, some no preview da Vercel", () => {
  const user = { user_metadata: { senha_provisoria: true } };
  assert.equal(deveAvisarSenhaProvisoria(user, { VERCEL_ENV: "production" }), true);
  assert.equal(deveAvisarSenhaProvisoria(user, {}), true);
  assert.equal(deveAvisarSenhaProvisoria(user, { VERCEL_ENV: "preview" }), false);
});

test("aviso: não aparece depois de trocar a senha", () => {
  assert.equal(
    deveAvisarSenhaProvisoria({ user_metadata: { senha_provisoria: false } }, {}),
    false,
  );
});
