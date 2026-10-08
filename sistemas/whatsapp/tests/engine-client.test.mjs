import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureEngine,
  ensureEngineConfigFile,
  getLiveQr,
  isConnected,
  NOT_CONNECTED_MESSAGE,
  ownPhone,
  readLocalConfig,
  sendText,
  validateTextMessage,
} from "../src/engine-client.mjs";
import * as client from "../src/engine-client.mjs";

const config = { apiKey: "chave-local", baseUrl: "http://127.0.0.1:8082" };

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function withStateDirectory(callback) {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "polozi-whatsapp-state-"));
  const environment = { ...process.env, WHATSAPP_LOCAL_STATE_DIR: stateDirectory, WHATSAPP_LOCAL_PORT: "18082" };
  try {
    await callback(environment, stateDirectory);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

test("valida telefone e texto antes de qualquer envio", () => {
  assert.doesNotThrow(() => validateTextMessage("5511900000001", "oi"));
  assert.doesNotThrow(() => validateTextMessage("554733334444", "oi"));
  assert.throws(() => validateTextMessage("5547", "Teste"), /telefone brasileiro/);
  assert.throws(() => validateTextMessage("+5511900000001", "Teste"));
  assert.throws(() => validateTextMessage("4799191180", "Teste"));
  assert.throws(() => validateTextMessage("5511900000001", ""), /vazia/);
  assert.throws(() => validateTextMessage("5511900000001", "   "), /vazia/);
  assert.throws(() => validateTextMessage("5511900000001", "x".repeat(2001)), /2000/);
  assert.doesNotThrow(() => validateTextMessage("5511900000001", "x".repeat(2000)));
});

test("normaliza o status do motor", () => {
  assert.equal(isConnected({ connected: true, loggedIn: true }), true);
  assert.equal(isConnected({ connected: true, loggedIn: false }), false);
  assert.equal(isConnected({}), false);
  assert.equal(ownPhone({ ownPhone: "5511900000001" }), "5511900000001");
  assert.equal(ownPhone({ ownPhone: "" }), "");
  assert.equal(ownPhone(undefined), "");
});

test("recusa envio quando a sessao nao esta conectada e manda pedir a reconexao a IA", async () => {
  const fetchImpl = async () => jsonResponse({ connected: true, loggedIn: false, ownPhone: "" });
  await assert.rejects(
    () => sendText(config, "5511900000001", "Teste", "mcp", fetchImpl),
    (error) => error.message === NOT_CONNECTED_MESSAGE && /WhatsApp desconectado\. Peca para a IA: "reconecta meu WhatsApp"/.test(error.message),
  );
});

test("envia somente depois de status conectado e repassa a origem", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/status")) return jsonResponse({ connected: true, loggedIn: true, ownPhone: "5511900000001" });
    return jsonResponse({ id: "ABC123" });
  };

  const result = await sendText(config, "5511900000001", "Teste local", "mcp", fetchImpl);
  assert.equal(result.id, "ABC123");
  assert.equal(requests[1].url, "http://127.0.0.1:8082/send/text");
  assert.equal(requests[1].init.method, "POST");
  assert.equal(requests[1].init.headers.apikey, "chave-local");
  assert.deepEqual(JSON.parse(requests[1].init.body), { number: "5511900000001", text: "Teste local", origem: "mcp" });
});

test("nao chama o motor quando o telefone e invalido", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return jsonResponse({}); };
  await assert.rejects(() => sendText(config, "123", "Teste", "mcp", fetchImpl), /telefone brasileiro/);
  assert.equal(called, false);
});

test("QR cru vem do motor e 404 vira null", async () => {
  assert.equal(await getLiveQr(config, async () => jsonResponse({ qr: "2@abc,def" })), "2@abc,def");
  assert.equal(await getLiveQr(config, async () => jsonResponse({ error: "no QR code available" }, 404)), null);
  await assert.rejects(() => getLiveQr(config, async () => jsonResponse({ error: "boom" }, 500)), /500/);
});

test("ensureEngine nao sobe um segundo motor quando o primeiro responde", async () => {
  await withStateDirectory(async (environment) => {
    await ensureEngineConfigFile(environment);
    let spawned = 0;
    const result = await ensureEngine({
      environment,
      fetchImpl: async () => jsonResponse({ connected: false, loggedIn: false, ownPhone: "" }),
      spawnImpl: () => { spawned += 1; return { unref() {}, on() {} }; },
    });
    assert.equal(spawned, 0);
    assert.equal(result.baseUrl, "http://127.0.0.1:18082");
  });
});

test("ensureEngine sobe o motor em background quando nao responde e espera ele ficar no ar", async () => {
  await withStateDirectory(async (environment, stateDirectory) => {
    await ensureEngineConfigFile(environment);
    let up = false;
    const spawns = [];
    await ensureEngine({
      environment,
      fetchImpl: async () => {
        if (!up) throw new Error("ECONNREFUSED");
        return jsonResponse({ connected: false, loggedIn: false, ownPhone: "" });
      },
      spawnImpl: (command, args, options) => {
        spawns.push({ command, args, options });
        up = true;
        return { unref() { this.unrefd = true; }, on() {} };
      },
      sleep: async () => {},
    });
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0].command, process.execPath);
    assert.match(spawns[0].args[0], /engine\.mjs$/);
    assert.equal(spawns[0].options.detached, true);
    assert.equal(spawns[0].options.windowsHide, true);
    assert.equal((await stat(path.join(stateDirectory, "motor.log"))).isFile(), true);
  });
});

test("ensureEngine avisa quando outro servico ocupa a porta", async () => {
  await withStateDirectory(async (environment) => {
    await ensureEngineConfigFile(environment);
    let spawned = 0;
    await assert.rejects(() => ensureEngine({
      environment,
      fetchImpl: async () => jsonResponse({ error: "unauthorized" }, 401),
      spawnImpl: () => { spawned += 1; return { unref() {}, on() {} }; },
    }), /retire:evolution/);
    assert.equal(spawned, 0);
  });
});

test("ensureEngine desiste com mensagem clara se o motor nunca sobe", async () => {
  await withStateDirectory(async (environment) => {
    await ensureEngineConfigFile(environment);
    await assert.rejects(() => ensureEngine({
      environment,
      fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
      spawnImpl: () => ({ unref() {}, on() {} }),
      waitMs: 30,
      pollMs: 5,
      sleep: (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
    }), /nao respondeu/);
  });
});

test("motor.json recebe chave aleatoria de 32 bytes e nao e regravado", async () => {
  await withStateDirectory(async (environment, stateDirectory) => {
    const first = await ensureEngineConfigFile(environment);
    assert.equal(first.created, true);
    const { apiKey } = JSON.parse(await readFile(first.file, "utf8"));
    assert.match(apiKey, /^[0-9a-f]{64}$/);
    if (process.platform !== "win32") {
      assert.equal((await stat(first.file)).mode & 0o777, 0o600);
      assert.equal((await stat(stateDirectory)).mode & 0o777, 0o700);
      assert.equal((await stat(path.join(stateDirectory, "auth"))).mode & 0o777, 0o700);
    }
    const second = await ensureEngineConfigFile(environment);
    assert.equal(second.created, false);
    assert.equal((await readLocalConfig(environment)).apiKey, apiKey);
  });
});

test("readLocalConfig manda executar o setup quando falta configuracao", async () => {
  await withStateDirectory(async (environment, stateDirectory) => {
    await assert.rejects(() => readLocalConfig(environment), /npm run setup/);
    await writeFile(path.join(stateDirectory, "motor.json"), "{}");
    await assert.rejects(() => readLocalConfig(environment), /npm run setup/);
  });
});

test("espera a sessao salva reconectar e nao espera quando nao ha sessao", async () => {
  const { waitForConnection } = await import("../src/engine-client.mjs");
  const config = { apiKey: "k", baseUrl: "http://127.0.0.1:1" };
  const sequence = [
    { connected: false, loggedIn: false, paired: true },
    { connected: false, loggedIn: false, paired: true },
    { connected: true, loggedIn: true, paired: true },
  ];
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => sequence[Math.min(calls++, 2)] });
  const status = await waitForConnection(config, { intervalMs: 1, fetchImpl });
  assert.equal(status.connected, true);
  assert.equal(calls, 3);

  calls = 0;
  const notPaired = async () => { calls++; return { ok: true, status: 200, json: async () => ({ connected: false, loggedIn: false, paired: false }) }; };
  const started = Date.now();
  await waitForConnection(config, { intervalMs: 1, fetchImpl: notPaired });
  assert.equal(calls, 1);
  assert.ok(Date.now() - started < 200);
});

const GROUP = "120363000000000000@g.us";

// fetch falso: /status conectado e as demais chamadas registradas.
function recordingFetch(reply = { ok: true }, { connected = true } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    if (url.endsWith("/status")) return jsonResponse({ connected, loggedIn: connected, paired: false, ownPhone: "5511900000001" });
    requests.push({ url: url.replace(config.baseUrl, ""), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    return jsonResponse(reply);
  };
  return { requests, fetchImpl };
}

test("texto para grupo manda destino (e para numero continua number)", async () => {
  const { requests, fetchImpl } = recordingFetch({ id: "A1" });
  await sendText(config, GROUP, "oi", "mcp", fetchImpl);
  await sendText(config, "5511900000001", "oi", "mcp", fetchImpl);
  assert.deepEqual(requests.map((r) => r.body), [{ destino: GROUP, text: "oi", origem: "mcp" }, { number: "5511900000001", text: "oi", origem: "mcp" }]);
  assert.doesNotThrow(() => validateTextMessage(GROUP, "oi"));
  assert.throws(() => validateTextMessage("120363000000000000@s.whatsapp.net", "oi"), /telefone brasileiro/);
});

test("midia: manda o caminho completo, so os campos informados, e valida antes", async () => {
  const { requests, fetchImpl } = recordingFetch({ id: "M1" });
  await client.sendMedia(config, { destino: GROUP, caminho: "relatorio.pdf", tipo: "document", legenda: "Vendas", origem: "relatorio" }, fetchImpl);
  assert.equal(requests[0].url, "/send/media");
  assert.deepEqual(requests[0].body, { destino: GROUP, caminho: path.resolve("relatorio.pdf"), tipo: "document", legenda: "Vendas", origem: "relatorio" });
  const before = requests.length;
  await assert.rejects(() => client.sendMedia(config, { destino: "123", caminho: "a.pdf", tipo: "document" }, fetchImpl), /telefone brasileiro/);
  await assert.rejects(() => client.sendMedia(config, { destino: GROUP, caminho: "a.pdf", tipo: "gif" }, fetchImpl), /Tipo invalido/);
  await assert.rejects(() => client.sendMedia(config, { destino: GROUP, caminho: " ", tipo: "image" }, fetchImpl), /caminho/);
  assert.equal(requests.length, before);
});

test("enquete, reacao e conferir numero chamam as rotas certas", async () => {
  const { requests, fetchImpl } = recordingFetch({ ok: true });
  await client.sendPoll(config, { destino: GROUP, pergunta: "Almoco?", opcoes: ["a", "b"] }, fetchImpl);
  await client.sendReaction(config, { destino: GROUP, id: "ABCD1234", emoji: "👍", participante: "5511911110001" }, fetchImpl);
  await client.checkNumber(config, "5511900000001", fetchImpl);
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [["POST", "/send/poll"], ["POST", "/send/react"], ["GET", "/check/5511900000001"]]);
  assert.deepEqual(requests[0].body, { destino: GROUP, pergunta: "Almoco?", opcoes: ["a", "b"], multipla: false, origem: "outro" });
  assert.throws(() => client.checkNumber(config, "123", fetchImpl), /telefone brasileiro/);
});

test("grupos: rota, metodo e corpo de cada operacao", async () => {
  const { requests, fetchImpl } = recordingFetch({ ok: true });
  const id = encodeURIComponent(GROUP);
  await client.listGroups(config, fetchImpl);
  await client.getGroup(config, GROUP, fetchImpl);
  await client.createGroup(config, { nome: "Equipe", participantes: ["5511900000002"] }, fetchImpl);
  await client.updateGroupSubject(config, GROUP, "Novo", fetchImpl);
  await client.updateGroupDescription(config, GROUP, "Regras", fetchImpl);
  await client.updateGroupSettings(config, GROUP, { soAdminEnvia: true }, fetchImpl);
  await client.updateGroupParticipants(config, GROUP, { acao: "add", participantes: ["5511900000002"] }, fetchImpl);
  await client.getGroupInvite(config, GROUP, fetchImpl);
  await client.revokeGroupInvite(config, GROUP, fetchImpl);
  await client.leaveGroup(config, GROUP, fetchImpl);
  await client.deleteGroup(config, GROUP, fetchImpl);
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [
    ["GET", "/groups"], ["GET", `/groups/${id}`], ["POST", "/groups"], ["POST", `/groups/${id}/subject`],
    ["POST", `/groups/${id}/description`], ["POST", `/groups/${id}/settings`], ["POST", `/groups/${id}/participants`],
    ["GET", `/groups/${id}/invite`], ["POST", `/groups/${id}/invite`], ["POST", `/groups/${id}/leave`], ["POST", `/groups/${id}/delete`],
  ]);
  assert.deepEqual(requests[5].body, { soAdminEnvia: true });
  assert.deepEqual(requests[6].body, { acao: "add", participantes: ["5511900000002"] });
  assert.throws(() => client.getGroup(config, "abc", fetchImpl), /Id de grupo invalido/);
});

test("toda operacao nova sem sessao conectada devolve a instrucao de reconectar", async () => {
  const { requests, fetchImpl } = recordingFetch({}, { connected: false });
  const calls = [
    () => client.sendMedia(config, { destino: GROUP, caminho: "a.pdf", tipo: "document" }, fetchImpl),
    () => client.sendPoll(config, { destino: GROUP, pergunta: "x", opcoes: ["a", "b"] }, fetchImpl),
    () => client.sendReaction(config, { destino: GROUP, id: "ABCD1234", emoji: "👍" }, fetchImpl),
    () => client.checkNumber(config, "5511900000001", fetchImpl),
    () => client.listGroups(config, fetchImpl),
    () => client.getGroup(config, GROUP, fetchImpl),
    () => client.createGroup(config, { nome: "x", participantes: ["5511900000002"] }, fetchImpl),
    () => client.deleteGroup(config, GROUP, fetchImpl),
  ];
  for (const run of calls) await assert.rejects(run, (error) => error.message === NOT_CONNECTED_MESSAGE);
  assert.equal(requests.length, 0);
});
