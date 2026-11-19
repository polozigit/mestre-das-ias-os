import test from "node:test";
import assert from "node:assert/strict";
import { metadataComSenhaProvisoria, mensagemDeAcesso, podeRedefinirSenha } from "./senha-equipe.ts";
import { SENHA_PROVISORIA } from "./senha-provisoria.ts";

const DONO = { usuarioId: "dono", eDono: true };
const GERENTE = { usuarioId: "gerente", eDono: false };

const FUNCIONARIO = { id: "func", e_dono: false, ativo: true, auth_user_id: "auth-func" };
const ALVO_DONO = { id: "dono", e_dono: true, ativo: true, auth_user_id: "auth-dono" };

test("podeRedefinirSenha: dono e gerente redefinem funcionário ativo com login", () => {
  assert.deepEqual(podeRedefinirSenha(DONO, FUNCIONARIO), { pode: true });
  assert.deepEqual(podeRedefinirSenha(GERENTE, FUNCIONARIO), { pode: true });
});

test("podeRedefinirSenha: ninguém redefine a própria senha por aqui", () => {
  const gerenteComoAlvo = { ...FUNCIONARIO, id: "gerente" };
  const r = podeRedefinirSenha(GERENTE, gerenteComoAlvo);
  assert.equal(r.pode, false);
  assert.match(r.pode ? "" : r.motivo, /Trocar senha/);
  assert.equal(podeRedefinirSenha(DONO, ALVO_DONO).pode, false);
});

test("podeRedefinirSenha: quem não é dono não redefine a senha do dono", () => {
  const r = podeRedefinirSenha(GERENTE, ALVO_DONO);
  assert.equal(r.pode, false);
  assert.match(r.pode ? "" : r.motivo, /Só o dono/);
});

test("podeRedefinirSenha: usuário desativado não é redefinido", () => {
  const r = podeRedefinirSenha(DONO, { ...FUNCIONARIO, ativo: false });
  assert.equal(r.pode, false);
  assert.match(r.pode ? "" : r.motivo, /desativado/);
});

test("podeRedefinirSenha: alvo fora da empresa (não achado no banco) é negado", () => {
  const r = podeRedefinirSenha(DONO, null);
  assert.equal(r.pode, false);
  assert.match(r.pode ? "" : r.motivo, /não encontrada/);
});

test("podeRedefinirSenha: sem conta de login não tem o que redefinir", () => {
  const r = podeRedefinirSenha(DONO, { ...FUNCIONARIO, auth_user_id: null });
  assert.equal(r.pode, false);
  assert.match(r.pode ? "" : r.motivo, /login/);
});

test("metadataComSenhaProvisoria: mantém o que existe e liga a marca", () => {
  assert.deepEqual(metadataComSenhaProvisoria({ nome: "Ana", senha_provisoria: false }), {
    nome: "Ana",
    senha_provisoria: true,
  });
  assert.deepEqual(metadataComSenhaProvisoria(null), { senha_provisoria: true });
});

test("mensagemDeAcesso: endereço, e-mail, senha e o aviso de troca", () => {
  const texto = mensagemDeAcesso({
    nome: "Maria da Silva",
    endereco: "https://sistema.exemplo.com",
    email: "maria@exemplo.com",
    senha: SENHA_PROVISORIA,
  });
  assert.match(texto, /^Oi, Maria\./);
  assert.match(texto, /Endereço: https:\/\/sistema\.exemplo\.com/);
  assert.match(texto, /E-mail: maria@exemplo\.com/);
  assert.ok(texto.includes(`Senha provisória: ${SENHA_PROVISORIA}`));
  assert.match(texto, /trocar essa senha/);
  assert.doesNotMatch(texto, /[–—]/);
});
