import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRegistro,
  getCasaEnvFile,
  loadSupabaseCredentials,
  parseDotEnv,
} from "../src/registro-supabase.mjs";

const KEY = "service-role-SEGREDO-123";
const credentials = { url: "https://aluno.supabase.co", key: KEY };
const mensagem = { waId: "ABC", direcao: "enviada", telefone: "5511900000001", texto: "oi", origem: "mcp", status: "enviada" };

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("sem credencial nao lanca, avisa uma unica vez e devolve null", async () => {
  const warnings = [];
  const registro = createRegistro({ loadCredentials: async () => null, warn: (m) => warnings.push(m) });
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(await registro.atualizarStatus("ABC", "lida"), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /sem credencial/);
});

test("RPC ausente (404 ou PGRST202) vira aviso unico apontando a migration", async () => {
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async () => jsonResponse({ code: "PGRST202", message: "Could not find the function" }, 404),
    warn: (m) => warnings.push(m),
  });
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /0018_whatsapp/);
});

test("chama a RPC do contrato com apikey e Bearer da service_role", async () => {
  const requests = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async (url, init) => { requests.push({ url, init }); return jsonResponse("uuid-1"); },
  });
  const when = new Date("2026-10-06T12:00:00Z");
  assert.equal(await registro.registrarMensagem({ ...mensagem, origem: "desconhecida", ocorridaEm: when }), "uuid-1");
  await registro.atualizarStatus("ABC", "entregue");

  assert.equal(requests[0].url, "https://aluno.supabase.co/rest/v1/rpc/registrar_mensagem_whatsapp");
  assert.equal(requests[0].init.headers.apikey, KEY);
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    p_wa_id: "ABC",
    p_direcao: "enviada",
    p_telefone: "5511900000001",
    p_texto: "oi",
    p_origem: "outro",
    p_status: "enviada",
    p_erro: null,
    p_ocorrida_em: "2026-10-06T12:00:00.000Z",
  });
  assert.equal(requests[1].url, "https://aluno.supabase.co/rest/v1/rpc/atualizar_status_whatsapp");
  assert.deepEqual(JSON.parse(requests[1].init.body), { p_wa_id: "ABC", p_status: "entregue" });
});

test("erro de rede nao lanca e a chave nunca aparece no aviso", async () => {
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async () => { throw new Error(`falha em Bearer ${KEY}`); },
    warn: (m) => warnings.push(m),
  });
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes(KEY), warnings[0]);
});

test("erro HTTP que ecoa a chave no corpo tambem nao vaza", async () => {
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async () => jsonResponse({ message: `JWT invalido: ${KEY}` }, 401),
    warn: (m) => warnings.push(m),
  });
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes(KEY), warnings[0]);
});

test("le URL e service_role de <Casa>/credenciais/.env e aceita override", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "polozi-casa-"));
  try {
    const file = path.join(directory, "env-teste");
    await writeFile(file, `# comentario\nNEXT_PUBLIC_SUPABASE_URL="https://aluno.supabase.co/"\nexport SUPABASE_SERVICE_ROLE_KEY='${KEY}'\nOUTRA=1\n`);
    assert.deepEqual(await loadSupabaseCredentials({ POLOZI_CASA_ENV: file }), credentials);

    await writeFile(file, "NEXT_PUBLIC_SUPABASE_URL=https://aluno.supabase.co\n");
    assert.equal(await loadSupabaseCredentials({ POLOZI_CASA_ENV: file }), null);
    assert.equal(await loadSupabaseCredentials({ POLOZI_CASA_ENV: path.join(directory, "nao-existe") }), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a Casa fica dois niveis acima da raiz do pacote", () => {
  assert.equal(getCasaEnvFile({}, "/Casa/sistemas/whatsapp"), path.join("/Casa", "credenciais", ".env"));
  assert.equal(getCasaEnvFile({ POLOZI_CASA_ENV: "/x/.env" }, "/Casa/sistemas/whatsapp"), "/x/.env");
  assert.deepEqual(parseDotEnv("A=1\r\nB = dois \n"), { A: "1", B: "dois" });
});

test("texto vazio nao vai para a RPC e erro de validacao 22023 vira aviso unico", async () => {
  const requests = [];
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async (url, init) => { requests.push(url); return jsonResponse({ code: "22023", message: "texto invalido" }, 400); },
    warn: (m) => warnings.push(m),
  });
  assert.equal(await registro.registrarMensagem({ ...mensagem, texto: "   " }), null);
  assert.equal(requests.length, 0);
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(await registro.registrarMensagem(mensagem), null);
  assert.equal(requests.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /22023/);
  assert.ok(!warnings[0].includes(mensagem.texto + mensagem.telefone));
});

test("mensagem de grupo vai para a RPC com o id do grupo e o aviso de 22023 aponta a 0021", async () => {
  const bodies = [];
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => credentials,
    fetchImpl: async (url, init) => { bodies.push(JSON.parse(init.body)); return jsonResponse({ code: "22023", message: "p_telefone invalido" }, 400); },
    warn: (m) => warnings.push(m),
  });
  await registro.registrarMensagem({ ...mensagem, telefone: "120363000000000000", texto: "[documento: vendas.pdf]" });
  assert.equal(bodies[0].p_telefone, "120363000000000000");
  assert.equal(bodies[0].p_texto, "[documento: vendas.pdf]");
  assert.match(warnings[0], /0021_whatsapp_grupo/);
});
