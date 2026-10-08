import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparPermissoes,
  diffPermissoes,
  emailValido,
  podeEditarUsuario,
  podeMexerNoSlug,
  statusDoMembro,
  validarAlternarAtivo,
  validarConvite,
} from "./regras.ts";

const MODULOS = [
  { slug: "tarefas", nome: "Tarefas", ligado: true },
  { slug: "agentes", nome: "Agentes", ligado: true },
  { slug: "eventos", nome: "Eventos", ligado: false },
];
const p = (slug: string) => {
  const [modulo, acao] = slug.split(".");
  return { slug, modulo, acao, descricao: null };
};

test("agruparPermissoes: módulo desligado some, mesmo com permissão no catálogo", () => {
  const g = agruparPermissoes([p("tarefas.read"), p("eventos.read")], MODULOS);
  assert.deepEqual(g.map((x) => x.modulo.slug), ["tarefas"]);
});

test("agruparPermissoes: módulo ligado sem permissão não vira grupo vazio", () => {
  const g = agruparPermissoes([p("tarefas.read")], MODULOS);
  assert.deepEqual(g.map((x) => x.modulo.slug), ["tarefas"]);
});

test("agruparPermissoes: módulos por nome, ações em read, write, manage, demais", () => {
  const g = agruparPermissoes(
    [p("tarefas.pessoal"), p("tarefas.manage"), p("tarefas.write"), p("tarefas.read"), p("agentes.read")],
    MODULOS,
  );
  assert.deepEqual(g.map((x) => x.modulo.slug), ["agentes", "tarefas"]);
  assert.deepEqual(
    g[1].permissoes.map((x) => x.slug),
    ["tarefas.read", "tarefas.write", "tarefas.manage", "tarefas.pessoal"],
  );
});

test("agruparPermissoes: catálogo vazio devolve lista vazia", () => {
  assert.deepEqual(agruparPermissoes([], MODULOS), []);
  assert.deepEqual(agruparPermissoes([p("tarefas.read")], []), []);
});

test("diffPermissoes: concede o que falta, revoga o que sobra, ignora o igual", () => {
  assert.deepEqual(diffPermissoes(["a.read"], ["a.read", "b.read"]), { conceder: ["b.read"], revogar: [] });
  assert.deepEqual(diffPermissoes(["a.read", "b.read"], ["b.read"]), { conceder: [], revogar: ["a.read"] });
  assert.deepEqual(diffPermissoes([], []), { conceder: [], revogar: [] });
  assert.deepEqual(diffPermissoes(["a.read"], ["a.read", "a.read"]), { conceder: [], revogar: [] });
});

test("podeEditarUsuario: dono nunca é editado por outro", () => {
  assert.equal(podeEditarUsuario({ e_dono: true }, { eDono: false }), false);
  assert.equal(podeEditarUsuario({ e_dono: false }, { eDono: false }), true);
  assert.equal(podeEditarUsuario({ e_dono: false }, { eDono: true }), true);
});

test("podeMexerNoSlug: usuarios.manage só o dono concede ou tira", () => {
  assert.equal(podeMexerNoSlug("usuarios.manage", { eDono: false }), false);
  assert.equal(podeMexerNoSlug("usuarios.manage", { eDono: true }), true);
  assert.equal(podeMexerNoSlug("tarefas.read", { eDono: false }), true);
});

test("emailValido aceita e-mail comum e rejeita lixo", () => {
  assert.equal(emailValido("ana@empresa.com.br"), true);
  assert.equal(emailValido("sem-arroba.com"), false);
  assert.equal(emailValido("a@b"), false);
  assert.equal(emailValido("com espaco@x.com"), false);
  assert.equal(emailValido(""), false);
});

test("validarConvite: nome e e-mail, na ordem", () => {
  assert.equal(validarConvite({ nome: "Ana", email: "ana@x.com" }), null);
  assert.match(validarConvite({ nome: "  ", email: "ana@x.com" }) ?? "", /nome/i);
  assert.match(validarConvite({ nome: "Ana", email: "invalido" }) ?? "", /e-mail/i);
});

test("validarAlternarAtivo: auto-desativação e dono são bloqueados; reativar sempre pode", () => {
  const eu = "id-da-sessao";
  assert.match(
    validarAlternarAtivo({ alvoId: eu, alvoEDono: false, ativoNovo: false, sessaoUsuarioId: eu }) ?? "",
    /próprio acesso/i,
  );
  assert.match(
    validarAlternarAtivo({ alvoId: "outro", alvoEDono: true, ativoNovo: false, sessaoUsuarioId: eu }) ?? "",
    /dono/i,
  );
  assert.equal(validarAlternarAtivo({ alvoId: "outro", alvoEDono: false, ativoNovo: false, sessaoUsuarioId: eu }), null);
  assert.equal(validarAlternarAtivo({ alvoId: "outro", alvoEDono: true, ativoNovo: true, sessaoUsuarioId: eu }), null);
});

test("statusDoMembro: Inativo ganha de pendente; só logou = Ativo", () => {
  assert.deepEqual(statusDoMembro({ ativo: false, auth_user_id: null, aceitou_convite: false }), { label: "Inativo", tone: "neutral" });
  assert.deepEqual(statusDoMembro({ ativo: false, auth_user_id: "abc", aceitou_convite: true }), { label: "Inativo", tone: "neutral" });
  assert.deepEqual(statusDoMembro({ ativo: true, auth_user_id: "abc", aceitou_convite: false }), { label: "Aguardando convite", tone: "warning" });
  assert.deepEqual(statusDoMembro({ ativo: true, auth_user_id: null, aceitou_convite: false }), { label: "Aguardando convite", tone: "warning" });
  assert.deepEqual(statusDoMembro({ ativo: true, auth_user_id: "abc", aceitou_convite: true }), { label: "Ativo", tone: "success" });
});

test("atividade de usuarios grava modulo_origem NULL (nao existe usuarios.read; a policy negaria)", () => {
  const src = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(src, /modulo_origem: null,/);
  assert.doesNotMatch(src, /modulo_origem: "/);
});
