import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import WebSocket from "ws";

import { createEngine, ownIdentity } from "../src/engine.mjs";
import { createRegistro } from "../src/registro-supabase.mjs";

const KEY = "chave-de-teste-do-motor";
const OWN_USER = { id: "5511900000001:35@s.whatsapp.net", lid: "10000000000001:35@lid" };

function fakeSocket({ user = OWN_USER, sendMessage } = {}) {
  const ev = new EventEmitter();
  const sock = {
    ev,
    user,
    ended: false,
    loggedOut: false,
    sent: [],
    end() { sock.ended = true; },
    async logout() { sock.loggedOut = true; },
    async sendMessage(jid, content) {
      if (sendMessage) return sendMessage(jid, content);
      sock.sent.push({ jid, content });
      return { key: { id: `WAID${sock.sent.length}`, remoteJid: jid, fromMe: true } };
    },
  };
  return sock;
}

const closed = (statusCode) => ({ connection: "close", lastDisconnect: { error: { output: { statusCode } } } });
const waitFor = async (condition, ms = 1000) => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("tempo esgotado esperando condicao");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
};
const pause = (ms = 40) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function startEngine({ hasSession = false, socketOptions, registro } = {}) {
  const sockets = [];
  const registrations = [];
  const statusUpdates = [];
  const logs = [];
  const control = { hasSession, cleared: 0, shutdowns: 0 };
  const fakeRegistro = registro || {
    registrarMensagem: async (message) => { registrations.push(message); },
    atualizarStatus: async (id, status) => { statusUpdates.push([id, status]); },
  };
  const engine = createEngine({
    apiKey: KEY,
    authDir: "/nao/usado",
    registro: fakeRegistro,
    log: (message) => logs.push(message),
    hasSession: async () => control.hasSession,
    clearAuth: async () => { control.cleared += 1; control.hasSession = false; },
    openSocket: async () => {
      const sock = fakeSocket(socketOptions);
      sockets.push(sock);
      return { sock, saveCreds: async () => {} };
    },
    onShutdown: () => { control.shutdowns += 1; },
    reconnectDelayMs: () => 5,
    statusRetryMs: 10,
  });
  const port = await engine.listen(0);
  const call = (path, { method = "GET", body, key = KEY } = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { ...(key === null ? {} : { apikey: key }), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const connect = async () => {
    await call("/pair", { method: "POST" });
    const sock = sockets.at(-1);
    sock.ev.emit("connection.update", { connection: "open" });
    return sock;
  };
  return { engine, port, call, connect, sockets, registrations, statusUpdates, logs, control };
}

function upsert(sock, { id = "M1", remoteJid = "5511900000001@s.whatsapp.net", fromMe = false, text = "oi", type = "notify" } = {}) {
  sock.ev.emit("messages.upsert", { type, messages: [{ key: { id, remoteJid, fromMe }, message: { conversation: text }, messageTimestamp: 1790000000 }] });
}

function openClient(port, token = KEY) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const messages = [];
  client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  return { client, messages, opened: new Promise((resolvePromise, reject) => { client.once("open", resolvePromise); client.once("error", reject); }) };
}

test("toda requisicao sem apikey correta recebe 401", async (t) => {
  const { engine, call } = await startEngine();
  t.after(() => engine.shutdown());
  for (const [path, method] of [["/status", "GET"], ["/qr", "GET"], ["/pair", "POST"], ["/send/text", "POST"], ["/logout", "POST"], ["/shutdown", "POST"], ["/qualquer", "GET"]]) {
    assert.equal((await call(path, { method, key: null })).status, 401, `${method} ${path} sem chave`);
    assert.equal((await call(path, { method, key: "errada" })).status, 401, `${method} ${path} chave errada`);
  }
  assert.equal((await call("/status")).status, 200);
});

test("status, QR e pareamento seguem o ciclo da conexao", async (t) => {
  const { engine, call, sockets } = await startEngine();
  t.after(() => engine.shutdown());

  assert.deepEqual(await (await call("/status")).json(), { connected: false, loggedIn: false, ownPhone: "", paired: false });
  const noQr = await call("/qr");
  assert.equal(noQr.status, 404);
  assert.deepEqual(await noQr.json(), { error: "no QR code available" });
  assert.equal(sockets.length, 0, "sem sessao salva o motor espera o POST /pair");

  assert.deepEqual(await (await call("/pair", { method: "POST" })).json(), { pairing: true });
  assert.equal(sockets.length, 1);
  sockets[0].ev.emit("connection.update", { qr: "2@qr-cru" });
  assert.deepEqual(await (await call("/qr")).json(), { qr: "2@qr-cru" });

  sockets[0].ev.emit("connection.update", { connection: "open" });
  assert.deepEqual(await (await call("/status")).json(), { connected: true, loggedIn: true, ownPhone: "5511900000001", paired: false });
  assert.equal((await call("/qr")).status, 404, "QR some depois de conectar");
  assert.deepEqual(await (await call("/pair", { method: "POST" })).json(), { already: true });
  assert.equal(sockets.length, 1);
});

test("sobe sozinho quando ja existe sessao salva", async (t) => {
  const { engine, sockets } = await startEngine({ hasSession: true });
  t.after(() => engine.shutdown());
  await engine.start();
  assert.equal(sockets.length, 1);
});

test("envio valida entrada, exige sessao conectada e devolve o id", async (t) => {
  const { engine, call, connect, sockets, registrations } = await startEngine();
  t.after(() => engine.shutdown());
  const body = { number: "5511900000001", text: "Teste", origem: "mcp" };

  assert.equal((await call("/send/text", { method: "POST", body })).status, 409, "sem sessao");
  const sock = await connect();
  assert.equal((await call("/send/text", { method: "POST", body: { ...body, number: "123" } })).status, 400);
  assert.equal((await call("/send/text", { method: "POST", body: { ...body, text: "" } })).status, 400);
  assert.equal((await call("/send/text", { method: "POST", body: { ...body, text: "x".repeat(2001) } })).status, 400);
  assert.equal(sock.sent.length, 0);

  const response = await call("/send/text", { method: "POST", body });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: "WAID1" });
  assert.deepEqual(sock.sent, [{ jid: "5511900000001@s.whatsapp.net", content: { text: "Teste" } }]);
  await engine.flush();
  assert.equal(registrations.length, 1);
  assert.deepEqual({ ...registrations[0] }, {
    waId: "WAID1", direcao: "enviada", telefone: "5511900000001", texto: "Teste", origem: "mcp", status: "enviada",
  });
  assert.equal(sockets.length, 1);
});

test("falha do WhatsApp no envio e registrada como falhou e devolve erro", async (t) => {
  const { engine, call, connect, registrations } = await startEngine({
    socketOptions: { sendMessage: async () => { throw new Error("rede caiu"); } },
  });
  t.after(() => engine.shutdown());
  await connect();
  const response = await call("/send/text", { method: "POST", body: { number: "5511900000001", text: "Teste", origem: "teste" } });
  assert.equal(response.status, 502);
  await engine.flush();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].status, "falhou");
  assert.equal(registrations[0].erro, "rede caiu");
  assert.equal(registrations[0].origem, "teste");
});

test("registro Supabase sem credencial nao lanca e o envio segue", async (t) => {
  const warnings = [];
  const registro = createRegistro({ loadCredentials: async () => null, warn: (m) => warnings.push(m) });
  const { engine, call, connect } = await startEngine({ registro });
  t.after(() => engine.shutdown());
  await connect();
  for (let i = 0; i < 2; i += 1) {
    const response = await call("/send/text", { method: "POST", body: { number: "5511900000001", text: `Teste ${i}`, origem: "mcp" } });
    assert.equal(response.status, 200);
  }
  await engine.flush();
  assert.equal(warnings.length, 1);
});

test("registro com rede quebrada nao derruba o envio nem vaza a chave", async (t) => {
  const secret = "service-role-SEGREDO";
  const warnings = [];
  const registro = createRegistro({
    loadCredentials: async () => ({ url: "https://aluno.supabase.co", key: secret }),
    fetchImpl: async () => { throw new Error(`timeout ${secret}`); },
    warn: (m) => warnings.push(m),
  });
  const { engine, call, connect, logs } = await startEngine({ registro });
  t.after(() => engine.shutdown());
  await connect();
  const response = await call("/send/text", { method: "POST", body: { number: "5511900000001", text: "Teste", origem: "mcp" } });
  assert.equal(response.status, 200);
  await engine.flush();
  assert.equal(warnings.length, 1);
  assert.ok(![...warnings, ...logs].some((line) => line.includes(secret)));
});

test("logout do celular limpa a sessao e fica aguardando novo pareamento", async (t) => {
  const { engine, call, connect, sockets, control } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  control.hasSession = true;
  sock.ev.emit("connection.update", closed(401));
  await waitFor(() => control.cleared === 1);
  await pause();
  assert.equal(sockets.length, 1, "nao reconecta depois de loggedOut");
  assert.deepEqual(await (await call("/status")).json(), { connected: false, loggedIn: false, ownPhone: "", paired: false });
  await call("/pair", { method: "POST" });
  assert.equal(sockets.length, 2, "novo pareamento abre socket novo");
});

test("restartRequired (515) logo apos parear reconecta sozinho", async (t) => {
  const { engine, call, sockets } = await startEngine();
  t.after(() => engine.shutdown());
  await call("/pair", { method: "POST" });
  sockets[0].ev.emit("connection.update", closed(515));
  await waitFor(() => sockets.length === 2);
  assert.equal(sockets[0].ended, true);
});

test("queda comum reconecta so quando ha sessao salva", async (t) => {
  const withSession = await startEngine({ hasSession: true });
  t.after(() => withSession.engine.shutdown());
  await withSession.engine.start();
  withSession.sockets[0].ev.emit("connection.update", closed(408));
  await waitFor(() => withSession.sockets.length === 2);

  const withoutSession = await startEngine({ hasSession: false });
  t.after(() => withoutSession.engine.shutdown());
  await withoutSession.call("/pair", { method: "POST" });
  withoutSession.sockets[0].ev.emit("connection.update", closed(408));
  await pause();
  assert.equal(withoutSession.sockets.length, 1);
});

test("POST /logout encerra no WhatsApp e apaga a sessao local", async (t) => {
  const { engine, call, connect, control } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  const response = await call("/logout", { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(sock.loggedOut, true);
  assert.ok(control.cleared >= 1);
  assert.deepEqual(await (await call("/status")).json(), { connected: false, loggedIn: false, ownPhone: "", paired: false });
});

test("assistente: so @ia do proprio chat e registrado; terceiro e ignorado", async (t) => {
  const { engine, port, connect, registrations } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  const { client, messages, opened } = openClient(port);
  await opened;

  upsert(sock, { id: "T1", remoteJid: "5511988887777@s.whatsapp.net", text: "@ia manda o relatorio" });
  upsert(sock, { id: "T2", remoteJid: "5511988887777@s.whatsapp.net", fromMe: true, text: "@ia oi" });
  upsert(sock, { id: "G1", remoteJid: "120363000000000000@g.us", text: "@ia grupo" });
  upsert(sock, { id: "H1", text: "@ia historico", type: "append" });
  upsert(sock, { id: "O1", remoteJid: "10000000000001@lid", fromMe: true, text: "@ia ativar" });
  upsert(sock, { id: "O2", text: "mensagem comum sem comando" });
  upsert(sock, { id: "O3", text: "@ia" });
  await waitFor(() => messages.length >= 3);
  await engine.flush();
  client.close();

  assert.deepEqual(messages.map((m) => m.data.id), ["O1", "O2", "O3"], "terceiro, grupo e historico nao passam pelo WebSocket");
  assert.deepEqual(messages[0], { event: "message", data: { id: "O1", remoteJid: "10000000000001@lid", fromMe: true, text: "@ia ativar" } });
  assert.equal(registrations.length, 1, "so o comando @ia do proprio chat entra no registro");
  assert.equal(registrations[0].waId, "O1");
  assert.equal(registrations[0].direcao, "recebida");
  assert.equal(registrations[0].origem, "assistente");
  assert.equal(registrations[0].status, "recebida");
  assert.equal(registrations[0].telefone, "5511900000001");
  assert.equal(registrations[0].texto, "@ia ativar");
});

test("mensagem enviada pelo motor com @ia nao e registrada de novo como recebida", async (t) => {
  const { engine, call, connect, registrations } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  await call("/send/text", { method: "POST", body: { number: "5511900000001", text: "@ia lembrete", origem: "mcp" } });
  upsert(sock, { id: "WAID1", fromMe: true, text: "@ia lembrete" });
  await engine.flush();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].direcao, "enviada");
});

test("WebSocket recusa token errado e so emite para quem esta conectado", async (t) => {
  const { engine, port, connect, registrations } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();

  const rejected = new WebSocket(`ws://127.0.0.1:${port}/ws?token=errado`);
  const status = await new Promise((resolvePromise) => {
    rejected.on("unexpected-response", (_request, response) => resolvePromise(response.statusCode));
    rejected.on("error", () => {});
  });
  assert.equal(status, 401);

  upsert(sock, { id: "SEM-CLIENTE", text: "ninguem ouvindo" });
  const { client, messages, opened } = openClient(port);
  await opened;
  upsert(sock, { id: "COM-CLIENTE", text: "agora sim" });
  await waitFor(() => messages.length === 1);
  client.close();
  assert.equal(messages[0].data.id, "COM-CLIENTE");
  assert.equal(registrations.length, 0);
});

test("recibos de entrega e leitura das mensagens enviadas atualizam o status uma vez", async (t) => {
  const { engine, call, connect, statusUpdates } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  const send = (text) => call("/send/text", { method: "POST", body: { number: "5511900000002", text, origem: "mcp" } });
  for (const text of ["um", "dois", "tres"]) await send(text);
  await engine.flush();
  sock.ev.emit("messages.update", [
    { key: { id: "WAID1", fromMe: true }, update: { status: 3 } },
    { key: { id: "WAID1", fromMe: true }, update: { status: 3 } },
    { key: { id: "WAID1", fromMe: true }, update: { status: 4 } },
    { key: { id: "WAID2", fromMe: true }, update: { status: 2 } },
    { key: { id: "WAID1", fromMe: false }, update: { status: 4 } },
    { key: { id: "WAID3", fromMe: true }, update: { status: 5 } },
  ]);
  await engine.flush();
  assert.deepEqual(statusUpdates, [["WAID1", "entregue"], ["WAID1", "lida"], ["WAID3", "lida"]]);
});

test("POST /shutdown responde e encerra o motor", async (t) => {
  const { engine, call, control } = await startEngine();
  t.after(() => engine.shutdown());
  const response = await call("/shutdown", { method: "POST" });
  assert.deepEqual(await response.json(), { ok: true });
  await waitFor(() => control.shutdowns === 1);
});

test("identifica o proprio numero quando o baileys entrega o id em formato LID", () => {
  assert.deepEqual(ownIdentity({ id: "5511900000001:35@s.whatsapp.net", lid: "10000000000001:35@lid" }), { phone: "5511900000001", lid: "10000000000001" });
  assert.deepEqual(ownIdentity({ id: "10000000000001@lid", phoneNumber: "5511900000001@s.whatsapp.net" }), { phone: "5511900000001", lid: "10000000000001" });
  assert.deepEqual(ownIdentity(undefined), { phone: "", lid: "" });
});

test("constantes do baileys cravado continuam as que o motor assume", async () => {
  const { DisconnectReason, proto } = await import("baileys");
  assert.equal(DisconnectReason.loggedOut, 401);
  assert.equal(DisconnectReason.restartRequired, 515);
  assert.equal(proto.WebMessageInfo.Status.DELIVERY_ACK, 3);
  assert.equal(proto.WebMessageInfo.Status.READ, 4);
  assert.equal(proto.WebMessageInfo.Status.PLAYED, 5);
});

test("recibo espera o registro da mensagem terminar", async (t) => {
  const order = [];
  let releaseRegistration;
  const registro = {
    registrarMensagem: () => new Promise((resolvePromise) => { releaseRegistration = () => { order.push("registro"); resolvePromise("uuid"); }; }),
    atualizarStatus: async (id, status) => { order.push(`status:${id}:${status}`); return true; },
  };
  const { engine, call, connect } = await startEngine({ registro });
  t.after(() => engine.shutdown());
  const sock = await connect();
  await call("/send/text", { method: "POST", body: { number: "5511900000001", text: "Teste", origem: "mcp" } });
  sock.ev.emit("messages.update", [{ key: { id: "WAID1", fromMe: true }, update: { status: 3 } }]);
  await pause();
  assert.deepEqual(order, [], "recibo nao passa na frente do registro");
  releaseRegistration();
  await engine.flush();
  assert.deepEqual(order, ["registro", "status:WAID1:entregue"]);
});

test("recibo que chega antes do banco conhecer a mensagem e reaplicado uma vez", async (t) => {
  const calls = [];
  const registro = {
    registrarMensagem: async () => {},
    atualizarStatus: async (id, status) => { calls.push([id, status]); return calls.length > 1; },
  };
  const { engine, call, connect } = await startEngine({ registro });
  t.after(() => engine.shutdown());
  const sock = await connect();
  await call("/send/text", { method: "POST", body: { number: "5511900000002", text: "oi", origem: "mcp" } });
  await engine.flush();
  sock.ev.emit("messages.update", [{ key: { id: "WAID1", fromMe: true }, update: { status: 4 } }]);
  await engine.flush();
  assert.deepEqual(calls, [["WAID1", "lida"], ["WAID1", "lida"]]);

  calls.length = 0;
  sock.ev.emit("messages.update", [{ key: { id: "Y", fromMe: true }, update: { status: 4 } }]);
  const noRetry = createRegistro({ loadCredentials: async () => null, warn: () => {} });
  assert.equal(await noRetry.atualizarStatus("Y", "lida"), null, "sem credencial (null) nao dispara nova tentativa");
});

test("motor escuta somente em 127.0.0.1 quando o host nao e informado", async (t) => {
  const { engine } = await startEngine();
  t.after(() => engine.shutdown());
  assert.equal(engine.address().address, "127.0.0.1");
});

test("recibo de mensagem que o motor nao enviou nem chega ao banco", async (t) => {
  const { engine, connect, statusUpdates } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  sock.ev.emit("messages.update", [{ key: { id: "DIGITADA-NO-CELULAR", fromMe: true }, update: { status: 3 } }]);
  await pause(60);
  assert.deepEqual(statusUpdates, []);
});

test("eco da mensagem enviada pelo motor nao volta pelo WebSocket", async (t) => {
  const { engine, port, call, connect } = await startEngine();
  t.after(() => engine.shutdown());
  const sock = await connect();
  const { client, messages, opened } = openClient(port);
  t.after(() => client.close());
  await opened;
  const sent = await (await call("/send/text", { method: "POST", body: { number: "5511900000001", text: "@ia resposta", origem: "assistente" } })).json();
  upsert(sock, { id: sent.id, remoteJid: "5511900000001@s.whatsapp.net", fromMe: true, text: "@ia resposta" });
  upsert(sock, { id: "PROPRIA2", remoteJid: "5511900000001@s.whatsapp.net", fromMe: true, text: "@ia pergunta nova" });
  await waitFor(() => messages.length >= 1);
  await pause(40);
  assert.deepEqual(messages.map((m) => m.data.id), ["PROPRIA2"]);
});
