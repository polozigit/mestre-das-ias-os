import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SENHA_PROVISORIA, decidirSenhaDono } from "./senha-dono.mjs";

const setup = readFileSync(new URL("../scripts/setup-inicial.mjs", import.meta.url), "utf8");

// O setup roda no topo do módulo (sem função exportada): a guarda é estática.
test("setup-inicial: dono nasce com a senha provisória e o e-mail confirmado, sem convite por e-mail", () => {
  assert.equal(setup.match(/inviteUserByEmail/g), null, "o convite por e-mail saiu: o Supabase só entrega a membro da organização");
  assert.match(
    setup,
    /createUser\(\{\s*email: emailMaster,\s*password: SENHA_PROVISORIA,\s*email_confirm: true,\s*user_metadata: \{ senha_provisoria: true \},?\s*\}\)/,
  );
  assert.match(setup, /decidirSenhaDono\(usuarioAuth, \{ zerar: zerarSenha \}\)/);
  assert.match(setup, /process\.env\.ZERAR_SENHA === "1"/);
  assert.match(setup, /listUsers/, "e-mail que já tem login precisa achar o auth_user_id pra vincular");
});

test("senha-dono: a provisória é mudar@123 e rodar de novo não troca a senha de quem já trocou ou já entrou", () => {
  assert.equal(SENHA_PROVISORIA, "mudar@123");
  assert.equal(decidirSenhaDono(null), "criar");
  assert.equal(decidirSenhaDono({ user_metadata: { senha_provisoria: false }, last_sign_in_at: null }), "manter");
  assert.equal(decidirSenhaDono({ user_metadata: { senha_provisoria: true } }), "manter");
  assert.equal(decidirSenhaDono({ user_metadata: {}, last_sign_in_at: "2026-11-17T10:00:00Z" }), "manter");
  assert.equal(decidirSenhaDono({ user_metadata: {}, last_sign_in_at: null }), "provisoria", "convite antigo nunca usado");
  assert.equal(decidirSenhaDono({ user_metadata: { senha_provisoria: false } }, { zerar: true }), "provisoria");
});
