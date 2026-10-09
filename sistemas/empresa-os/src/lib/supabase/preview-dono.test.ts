import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  adminDoPreview,
  entrarComoDonoNoPreview,
  type AdminPreview,
  type ClienteSessao,
} from "./preview-dono.ts";
import { semComentarios } from "../fonte-para-teste.ts";

const TOKEN = "token-de-teste-0001";
const DONO = "dono@empresa.com.br";
const ENV_PREVIEW = {
  VERCEL_ENV: "preview",
  PREVIEW_TEST_TOKEN: TOKEN,
  PREVIEW_OWNER_EMAIL: DONO,
};

/** Dublês que registram cada chamada: o teste prova o que NÃO foi chamado. */
function montar(opcoes: { logado?: boolean; donoExiste?: boolean; erroOtp?: boolean } = {}) {
  const chamadas: string[] = [];
  const sessao: ClienteSessao = {
    auth: {
      async getUser() {
        chamadas.push("getUser");
        return { data: { user: opcoes.logado ? { id: "u1" } : null } };
      },
      async verifyOtp(params) {
        chamadas.push(`verifyOtp:${params.token_hash}:${params.type}`);
        return { error: opcoes.erroOtp ? new Error("otp") : null };
      },
    },
  };
  const admin: AdminPreview = {
    async donoAtivoExiste(email) {
      chamadas.push(`donoAtivoExiste:${email}`);
      return opcoes.donoExiste !== false;
    },
    async hashDoLinkMagico(email) {
      chamadas.push(`generateLink:magiclink:${email}`);
      return "hash-1";
    },
  };
  const criarAdmin = () => {
    chamadas.push("criarAdmin");
    return admin;
  };
  return { chamadas, sessao, criarAdmin };
}

test("preview + token certo + sem sessão: gera link do dono e abre sessão real (sem e-mail)", async () => {
  const d = montar();
  const r = await entrarComoDonoNoPreview({ env: ENV_PREVIEW, tokenFornecido: TOKEN, ...d });
  assert.equal(r, "logou");
  assert.ok(d.chamadas.includes(`generateLink:magiclink:${DONO}`), d.chamadas.join(","));
  assert.ok(d.chamadas.includes("verifyOtp:hash-1:email"), d.chamadas.join(","));
  assert.ok(d.chamadas.includes(`donoAtivoExiste:${DONO}`), d.chamadas.join(","));
});

test("e-mail do env é normalizado (o banco guarda minúsculo e sem espaço)", async () => {
  const d = montar();
  const env = { ...ENV_PREVIEW, PREVIEW_OWNER_EMAIL: "  Dono@Empresa.com.BR " };
  assert.equal(await entrarComoDonoNoPreview({ env, tokenFornecido: TOKEN, ...d }), "logou");
  assert.ok(d.chamadas.includes(`generateLink:magiclink:${DONO}`));
});

test("PRODUÇÃO ignora o token: nem chave de admin, nem link, nem sessão", async () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    const d = montar();
    const env = { ...ENV_PREVIEW, VERCEL_ENV };
    const r = await entrarComoDonoNoPreview({ env, tokenFornecido: TOKEN, ...d });
    assert.equal(r, "fora", String(VERCEL_ENV));
    assert.deepEqual(d.chamadas, [], String(VERCEL_ENV));
  }
});

test("token errado ou ausente não loga", async () => {
  for (const fornecido of ["outro-token", "", null, undefined]) {
    const d = montar();
    const r = await entrarComoDonoNoPreview({ env: ENV_PREVIEW, tokenFornecido: fornecido, ...d });
    assert.equal(r, "fora", String(fornecido));
    assert.deepEqual(d.chamadas, [], String(fornecido));
  }
});

test("sem PREVIEW_TEST_TOKEN ou sem PREVIEW_OWNER_EMAIL no env, o bypass fica desligado", async () => {
  for (const faltando of ["PREVIEW_TEST_TOKEN", "PREVIEW_OWNER_EMAIL"] as const) {
    const d = montar();
    const env: Record<string, string | undefined> = { ...ENV_PREVIEW, [faltando]: undefined };
    // Token vazio no env NÃO pode casar com token vazio na URL.
    const fornecido = faltando === "PREVIEW_TEST_TOKEN" ? undefined : TOKEN;
    assert.equal(await entrarComoDonoNoPreview({ env, tokenFornecido: fornecido, ...d }), "fora");
    assert.deepEqual(d.chamadas, []);
  }
});

test("já logado: mantém a sessão e não gera link", async () => {
  const d = montar({ logado: true });
  const r = await entrarComoDonoNoPreview({ env: ENV_PREVIEW, tokenFornecido: TOKEN, ...d });
  assert.equal(r, "ja-logado");
  assert.deepEqual(d.chamadas, ["getUser"]);
});

test("e-mail que não é do dono ativo: falha visível e NÃO gera link (magiclink criaria a conta)", async () => {
  const d = montar({ donoExiste: false });
  const r = await entrarComoDonoNoPreview({ env: ENV_PREVIEW, tokenFornecido: TOKEN, ...d });
  assert.equal(r, "falhou");
  assert.ok(!d.chamadas.some((c) => c.startsWith("generateLink")), d.chamadas.join(","));
});

test("verifyOtp com erro vira falha (o proxy manda pra /login?erro=qa-preview)", async () => {
  const d = montar({ erroOtp: true });
  assert.equal(await entrarComoDonoNoPreview({ env: ENV_PREVIEW, tokenFornecido: TOKEN, ...d }), "falhou");
});

test("chave de admin ausente (criarAdmin lança) vira falha, não exceção", async () => {
  const d = montar();
  const criarAdmin = () => {
    throw new Error("sem SUPABASE_SERVICE_ROLE_KEY");
  };
  const r = await entrarComoDonoNoPreview({
    env: ENV_PREVIEW,
    tokenFornecido: TOKEN,
    sessao: d.sessao,
    criarAdmin,
  });
  assert.equal(r, "falhou");
});

/** Cliente de service role falso: registra filtros e o pedido de link. */
function clienteFalso(resposta: { dono: unknown; erroLink?: boolean }) {
  const filtros: Array<[string, unknown]> = [];
  const links: unknown[] = [];
  const consulta = {
    eq(coluna: string, valor: unknown) {
      filtros.push([coluna, valor]);
      return consulta;
    },
    async maybeSingle() {
      return { data: resposta.dono, error: null };
    },
  };
  const cliente = {
    from(tabela: string) {
      filtros.push(["tabela", tabela]);
      return { select: () => consulta };
    },
    auth: {
      admin: {
        async generateLink(params: unknown) {
          links.push(params);
          return resposta.erroLink
            ? { data: { properties: null, user: null }, error: new Error("x") }
            : { data: { properties: { hashed_token: "hash-9" } }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient<Database>;
  return { cliente, filtros, links };
}

test("adaptador: só dono ATIVO conta, e o link é magiclink do e-mail", async () => {
  const f = clienteFalso({ dono: { id: "d1" } });
  const admin = adminDoPreview(f.cliente);
  assert.equal(await admin.donoAtivoExiste(DONO), true);
  assert.deepEqual(f.filtros, [["tabela", "usuarios"], ["email", DONO], ["e_dono", true], ["ativo", true]]);
  assert.equal(await admin.hashDoLinkMagico(DONO), "hash-9");
  assert.deepEqual(f.links, [{ type: "magiclink", email: DONO }]);
});

test("adaptador: sem linha do dono = false; erro no link = null", async () => {
  const f = clienteFalso({ dono: null, erroLink: true });
  const admin = adminDoPreview(f.cliente);
  assert.equal(await admin.donoAtivoExiste(DONO), false);
  assert.equal(await admin.hashDoLinkMagico(DONO), null);
});

test("proxy.ts usa a entrada como dono e não guarda senha de QA", () => {
  const fonte = semComentarios(
    readFileSync(new URL("./proxy.ts", import.meta.url), "utf8"),
  );
  assert.match(fonte, /entrarComoDonoNoPreview\(/);
  assert.match(fonte, /adminDoPreview\(createServiceClient\(\)\)/);
  assert.match(fonte, /"\?erro=qa-preview"/);
  assert.doesNotMatch(fonte, /signInWithPassword|PREVIEW_QA_/);
});

test("AGENTS.md do sistema: tela vai ao ar com o aprovado do dono; conferência da IA opcional e só da tela alterada", () => {
  const regras = readFileSync(new URL("../../../AGENTS.md", import.meta.url), "utf8").replace(/\s+/g, " ");
  assert.match(regras, /o DONO abre o link, olha a tela que mudou e responde "aprovado" → produção/);
  assert.match(regras, /Não existe QA de tela obrigatório, usuário de teste, agente de QA no caminho nem ciclo extra/);
  assert.match(regras, /olha SÓ a tela que a mudança alterou, nunca todas as telas do sistema/);
  assert.match(regras, /Se não rodar, nada trava/);
  assert.match(regras, /Nunca peça para criar usuário/);
  assert.doesNotMatch(regras, /Nada mergeia sem QA|dispensa|todas as telas \+/);
});
