import assert from "node:assert/strict";
import { mkdir, realpath, symlink, truncate } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { GROUP_ID, makeFile, makeTempDir, startEngine } from "./engine-harness.mjs";

const PHONE = "5511988887777";
const post = (call, route, body, options = {}) => call(route, { method: "POST", body, ...options });

async function connected(t, options) {
  const harness = await startEngine(options);
  t.after(() => harness.engine.shutdown());
  harness.sock = await harness.connect();
  return harness;
}

test("rotas novas exigem a apikey (401 sem chave e com chave errada)", async (t) => {
  const { engine, call } = await startEngine();
  t.after(() => engine.shutdown());
  const routes = [
    ["POST", "/send/media"], ["POST", "/send/poll"], ["POST", "/send/react"], ["GET", "/check/5511988887777"],
    ["GET", "/groups"], ["POST", "/groups"], ["GET", `/groups/${GROUP_ID}`], ["POST", `/groups/${GROUP_ID}/subject`],
    ["POST", `/groups/${GROUP_ID}/description`], ["POST", `/groups/${GROUP_ID}/settings`], ["POST", `/groups/${GROUP_ID}/participants`],
    ["GET", `/groups/${GROUP_ID}/invite`], ["POST", `/groups/${GROUP_ID}/invite`], ["POST", `/groups/${GROUP_ID}/leave`], ["POST", `/groups/${GROUP_ID}/delete`],
  ];
  for (const [method, route] of routes) {
    assert.equal((await call(route, { method, key: null })).status, 401, `${method} ${route} sem chave`);
    assert.equal((await call(route, { method, key: "errada" })).status, 401, `${method} ${route} chave errada`);
  }
});

test("texto aceita grupo: manda para o id do grupo e registra o id sem @g.us", async (t) => {
  const { call, sock, registrations, engine } = await connected(t);
  const response = await post(call, "/send/text", { destino: GROUP_ID, text: "Bom dia, equipe", origem: "mcp" });
  assert.equal(response.status, 200);
  assert.deepEqual(sock.sent, [{ jid: GROUP_ID, content: { text: "Bom dia, equipe" } }]);
  await engine.flush();
  assert.equal(registrations[0].telefone, "120363000000000000");
  assert.equal(registrations[0].texto, "Bom dia, equipe");
  assert.equal((await post(call, "/send/text", { destino: "120363000000000000@s.whatsapp.net", text: "x" })).status, 400, "so @g.us vale como grupo");
  assert.equal((await post(call, "/send/text", { destino: "123@g.us", text: "x" })).status, 400, "id curto nao e grupo");
});

test("midia: cada tipo chega ao WhatsApp com os argumentos certos e entra no registro", async (t) => {
  const dir = await makeTempDir(t);
  const { call, sock, registrations, engine } = await connected(t);
  const files = {
    image: await makeFile(dir, "foto.png"),
    video: await makeFile(dir, "video.mp4"),
    audio: await makeFile(dir, "musica.mp3"),
    voice: await makeFile(dir, "nota.ogg"),
    document: await makeFile(dir, "relatorio.pdf"),
  };
  const real = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([tipo, file]) => [tipo, await realpath(file)])));
  const send = (body) => post(call, "/send/media", { destino: PHONE, origem: "relatorio", ...body });

  assert.equal((await send({ tipo: "image", caminho: files.image, legenda: "Olha isso" })).status, 200);
  assert.equal((await send({ tipo: "video", caminho: files.video })).status, 200);
  assert.equal((await send({ tipo: "audio", caminho: files.audio })).status, 200);
  assert.equal((await send({ tipo: "voice", caminho: files.voice })).status, 200);
  assert.equal((await send({ tipo: "document", caminho: files.document, legenda: "Vendas de hoje", nomeArquivo: "vendas.pdf" })).status, 200);
  assert.equal((await send({ tipo: "document", caminho: files.document, destino: GROUP_ID })).status, 200);

  const jid = `${PHONE}@s.whatsapp.net`;
  assert.deepEqual(sock.sent, [
    { jid, content: { image: { url: real.image }, mimetype: "image/png", caption: "Olha isso" } },
    { jid, content: { video: { url: real.video }, mimetype: "video/mp4" } },
    { jid, content: { audio: { url: real.audio }, mimetype: "audio/mpeg" } },
    { jid, content: { audio: { url: real.voice }, mimetype: "audio/ogg; codecs=opus", ptt: true } },
    { jid, content: { document: { url: real.document }, mimetype: "application/pdf", fileName: "vendas.pdf", caption: "Vendas de hoje" } },
    { jid: GROUP_ID, content: { document: { url: real.document }, mimetype: "application/pdf", fileName: "relatorio.pdf" } },
  ]);
  await engine.flush();
  assert.deepEqual(registrations.map((r) => [r.telefone, r.texto, r.origem]), [
    [PHONE, "Olha isso", "relatorio"],
    [PHONE, "[video]", "relatorio"],
    [PHONE, "[audio]", "relatorio"],
    [PHONE, "[nota de voz]", "relatorio"],
    [PHONE, "Vendas de hoje", "relatorio"],
    ["120363000000000000", "[documento: relatorio.pdf]", "relatorio"],
  ]);
});

test("midia: entradas invalidas viram 400 claro e nada e enviado", async (t) => {
  const dir = await makeTempDir(t);
  const { call, sock, registrations, engine } = await connected(t);
  const png = await makeFile(dir, "foto.png");
  const mp3 = await makeFile(dir, "musica.mp3");
  const pdf = await makeFile(dir, "doc.pdf");
  const vazio = await makeFile(dir, "vazio.pdf", "");
  const gif = await makeFile(dir, "mexe.gif");
  const grande = await makeFile(dir, "grande.png");
  await truncate(grande, 17 * 1024 * 1024);
  const pasta = path.join(dir, "pasta.pdf");
  await mkdir(pasta);

  const attempt = async (body, pattern, label) => {
    const response = await post(call, "/send/media", { destino: PHONE, tipo: "image", caminho: png, ...body });
    assert.equal(response.status, 400, label);
    assert.match((await response.json()).error, pattern, label);
  };
  await attempt({ caminho: path.join(dir, "nao-existe.png") }, /nao encontrado/, "arquivo inexistente");
  await attempt({ tipo: "gif" }, /Tipo invalido/, "tipo errado");
  await attempt({ tipo: undefined }, /Tipo invalido/, "sem tipo");
  await attempt({ tipo: "voice", caminho: mp3 }, /OGG com Opus.*nao converte/, "nota de voz que nao e ogg");
  await attempt({ tipo: "image", caminho: gif }, /Formato \.gif nao aceito/, "formato fora da lista");
  await attempt({ tipo: "image", caminho: grande }, /grande demais.*16 MB/, "acima do limite");
  await attempt({ tipo: "document", caminho: vazio }, /vazio/, "arquivo vazio");
  await attempt({ tipo: "document", caminho: pasta }, /nao e um arquivo/, "pasta");
  await attempt({ tipo: "audio", caminho: mp3, legenda: "oi" }, /nao tem legenda/, "legenda em audio");
  await attempt({ tipo: "document", caminho: pdf, legenda: "x".repeat(1025) }, /legenda passa de 1024/, "legenda longa");
  await attempt({ caminho: "" }, /caminho do arquivo/, "caminho vazio");
  await attempt({ destino: "123" }, /telefone brasileiro/, "destino invalido");
  await attempt({ destino: "120363000000000000@s.whatsapp.net" }, /telefone brasileiro/, "grupo sem @g.us");
  assert.equal((await post(call, "/send/media", "nao-e-objeto")).status, 400);
  assert.equal((await call("/send/media", { method: "POST", body: [1] })).status, 400, "corpo que nao e objeto");
  assert.equal(sock.sent.length, 0);
  await engine.flush();
  assert.equal(registrations.length, 0);
});

test("midia: sem sessao conectada responde 409", async (t) => {
  const dir = await makeTempDir(t);
  const { call, engine } = await startEngine();
  t.after(() => engine.shutdown());
  const png = await makeFile(dir, "foto.png");
  assert.equal((await post(call, "/send/media", { destino: PHONE, tipo: "image", caminho: png })).status, 409);
});

test("midia: nunca envia o que guarda a sessao nem credenciais", async (t) => {
  const dir = await makeTempDir(t);
  const stateDir = path.join(dir, "estado");
  await mkdir(path.join(stateDir, "auth"), { recursive: true });
  const creds = await makeFile(path.join(stateDir, "auth"), "creds.json");
  const motor = await makeFile(stateDir, "motor.json");
  await mkdir(path.join(dir, "credenciais"));
  const env = await makeFile(path.join(dir, "credenciais"), "chaves.txt");
  const dotenv = await makeFile(dir, ".env.local");
  const { call, sock } = await connected(t, { stateDir });
  for (const file of [creds, motor, env, dotenv]) {
    const response = await post(call, "/send/media", { destino: PHONE, tipo: "document", caminho: file });
    assert.equal(response.status, 400, file);
    assert.match((await response.json()).error, /nao pode ser enviado/);
  }
  assert.equal(sock.sent.length, 0);
});

test("midia: atalho (symlink) e '../' para credenciais, .env ou estado tambem sao barrados; arquivo comum passa", async (t) => {
  const dir = await makeTempDir(t);
  const stateDir = path.join(dir, "estado");
  await mkdir(path.join(stateDir, "auth"), { recursive: true });
  const motor = await makeFile(stateDir, "motor.json");
  await mkdir(path.join(dir, "credenciais"));
  const segredo = await makeFile(path.join(dir, "credenciais"), "arquivo");
  const dotenv = await makeFile(dir, ".env");
  const comum = await makeFile(dir, "relatorio.pdf");
  await mkdir(path.join(dir, "publico"));
  const atalhos = {
    paraCredenciais: path.join(dir, "publico", "inocente.pdf"),
    paraDotenv: path.join(dir, "publico", "config.pdf"),
    paraEstado: path.join(dir, "publico", "estado.pdf"),
    paraPastaEstado: path.join(dir, "publico", "pasta-estado"),
    paraComum: path.join(dir, "publico", "atalho-ok.pdf"),
  };
  await symlink(segredo, atalhos.paraCredenciais);
  await symlink(dotenv, atalhos.paraDotenv);
  await symlink(motor, atalhos.paraEstado);
  await symlink(stateDir, atalhos.paraPastaEstado);
  await symlink(comum, atalhos.paraComum);
  const { call, sock } = await connected(t, { stateDir });
  const send = (caminho) => post(call, "/send/media", { destino: PHONE, tipo: "document", caminho });

  for (const [rotulo, caminho] of [
    ["symlink para credenciais/arquivo", atalhos.paraCredenciais],
    ["symlink para .env", atalhos.paraDotenv],
    ["symlink para motor.json do estado", atalhos.paraEstado],
    ["symlink para dentro da pasta de estado", path.join(atalhos.paraPastaEstado, "motor.json")],
    ["../ que resolve para credenciais/", `${dir}/publico/../credenciais/arquivo`],
  ]) {
    const response = await send(caminho);
    assert.equal(response.status, 400, rotulo);
    assert.match((await response.json()).error, /nao pode ser enviado/, rotulo);
  }
  assert.equal(sock.sent.length, 0, "nada saiu");

  assert.equal((await send(comum)).status, 200, "arquivo comum");
  assert.equal((await send(atalhos.paraComum)).status, 200, "atalho para arquivo comum");
  assert.equal(sock.sent.length, 2);
});

test("falha do WhatsApp no envio de midia e registrada como falhou", async (t) => {
  const dir = await makeTempDir(t);
  const { call, engine, registrations } = await connected(t, { socketOptions: { overrides: { sendMessage: async () => { throw new Error("rede caiu"); } } } });
  const response = await post(call, "/send/media", { destino: PHONE, tipo: "document", caminho: await makeFile(dir, "a.pdf"), origem: "teste" });
  assert.equal(response.status, 502);
  await engine.flush();
  assert.deepEqual(registrations.map((r) => [r.status, r.texto, r.erro]), [["falhou", "[documento: a.pdf]", "rede caiu"]]);
});

test("enquete: valida 2 a 12 opcoes, mapeia multipla e registra", async (t) => {
  const { call, sock, engine, registrations } = await connected(t);
  const poll = (body) => post(call, "/send/poll", { destino: GROUP_ID, pergunta: "Almoco?", opcoes: ["Sim", "Nao"], origem: "mcp", ...body });
  assert.equal((await poll({})).status, 200);
  assert.equal((await poll({ multipla: true, destino: PHONE })).status, 200);
  assert.deepEqual(sock.sent.map((item) => [item.jid, item.content]), [
    [GROUP_ID, { poll: { name: "Almoco?", values: ["Sim", "Nao"], selectableCount: 1 } }],
    [`${PHONE}@s.whatsapp.net`, { poll: { name: "Almoco?", values: ["Sim", "Nao"], selectableCount: 0 } }],
  ]);
  await engine.flush();
  assert.deepEqual(registrations.map((r) => r.texto), ["[enquete: Almoco?]", "[enquete: Almoco?]"]);

  for (const [body, pattern] of [
    [{ opcoes: ["So uma"] }, /2 a 12 opcoes/],
    [{ opcoes: Array.from({ length: 13 }, (_, n) => `op${n}`) }, /2 a 12 opcoes/],
    [{ opcoes: ["Sim", "sim"] }, /nao podem se repetir/],
    [{ opcoes: ["Sim", " "] }, /cada opcao/],
    [{ pergunta: " " }, /pergunta/],
    [{ pergunta: "x".repeat(256) }, /pergunta/],
    [{ opcoes: "Sim,Nao" }, /2 a 12 opcoes/],
    [{ destino: "abc" }, /telefone brasileiro/],
  ]) {
    const response = await poll(body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
    assert.match((await response.json()).error, pattern);
  }
  assert.equal(sock.sent.length, 2);
});

test("reacao: monta a chave, exige participante em grupo e valida o emoji", async (t) => {
  const { call, sock } = await connected(t);
  const react = (body) => post(call, "/send/react", { destino: PHONE, id: "ABCD1234", emoji: "👍", ...body });
  assert.equal((await react({})).status, 200);
  assert.equal((await react({ destino: GROUP_ID, participante: "5511911110001" })).status, 200);
  assert.equal((await react({ destino: GROUP_ID, deMim: true })).status, 200);
  assert.equal((await react({ emoji: "" })).status, 200, "texto vazio remove a reacao");
  assert.deepEqual(sock.sent.map((item) => item.content.react.key), [
    { remoteJid: `${PHONE}@s.whatsapp.net`, id: "ABCD1234", fromMe: false },
    { remoteJid: GROUP_ID, id: "ABCD1234", fromMe: false, participant: "5511911110001@s.whatsapp.net" },
    { remoteJid: GROUP_ID, id: "ABCD1234", fromMe: true },
    { remoteJid: `${PHONE}@s.whatsapp.net`, id: "ABCD1234", fromMe: false },
  ]);
  assert.equal(sock.sent[0].content.react.text, "👍");

  const bad = async (body, pattern) => {
    const response = await react(body);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, pattern);
  };
  await bad({ destino: GROUP_ID }, /informe o numero/);
  await bad({ emoji: "oi" }, /unico emoji/);
  await bad({ emoji: "👍👍" }, /unico emoji/);
  await bad({ id: "x" }, /id da mensagem/);
  assert.equal(sock.sent.length, 4);
});

test("reacao a mensagem enviada pelo motor sabe que e propria", async (t) => {
  const { call, sock } = await connected(t);
  await post(call, "/send/text", { number: PHONE, text: "oi", origem: "mcp" });
  await post(call, "/send/react", { destino: GROUP_ID, id: "WAID1", emoji: "❤️" });
  assert.equal(sock.sent[1].content.react.key.fromMe, true);
});

test("conferir numero: devolve se existe e recusa formato errado", async (t) => {
  const { call, sock } = await connected(t);
  assert.deepEqual(await (await call(`/check/${PHONE}`)).json(), { numero: PHONE, existe: true, jid: PHONE });
  assert.deepEqual(sock.calls.at(-1), ["onWhatsApp", PHONE]);
  assert.equal((await call("/check/123")).status, 400);
  assert.equal((await call(`/check/${GROUP_ID}`)).status, 400);
});

test("conferir numero sem sessao responde 409", async (t) => {
  const { engine, call } = await startEngine();
  t.after(() => engine.shutdown());
  assert.equal((await call(`/check/${PHONE}`)).status, 409);
});
