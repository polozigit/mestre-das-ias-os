import assert from "node:assert/strict";
import { access, readdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { emitUpsert, GROUP_ID, makeTempDir, openClient, pause, startEngine, waitFor } from "./engine-harness.mjs";

const OWN = "5511900000001@s.whatsapp.net";
const THIRD = "5511988887777@s.whatsapp.net";
const exists = (file) => access(file).then(() => true, () => false);

const pdf = (caption = "@ia resume este contrato", extra = {}) => ({
  documentWithCaptionMessage: { message: { documentMessage: { mimetype: "application/pdf", fileName: "contrato.pdf", caption, fileLength: 1000, ...extra } } },
});
const image = (caption = "@ia o que e isso?", extra = {}) => ({ imageMessage: { mimetype: "image/png", caption, fileLength: 1000, ...extra } });

async function setup(t, { download = async () => Readable.from([Buffer.from("%PDF-1.4 conteudo")]), mediaDir } = {}) {
  const dir = mediaDir ?? path.join(await makeTempDir(t), "midia-temp");
  const harness = await startEngine({ mediaDir: dir, downloadMedia: (message) => download(message) });
  t.after(() => harness.engine.shutdown());
  const sock = await harness.connect();
  const ws = openClient(harness.port);
  t.after(() => ws.client.close());
  await ws.opened;
  return { ...harness, sock, dir, ws };
}

test("PDF com @ia no proprio chat: baixa para arquivo temporario e o evento leva o caminho", async (t) => {
  const { sock, dir, ws, downloads, registrations, engine } = await setup(t);
  emitUpsert(sock, { id: "P1", remoteJid: OWN, fromMe: true, message: pdf() });
  await waitFor(() => ws.messages.length === 1);
  await engine.flush();

  const { data } = ws.messages[0];
  assert.equal(downloads.length, 1);
  assert.equal(data.id, "P1");
  assert.equal(data.text, "@ia resume este contrato");
  assert.equal(data.anexo.tipo, "pdf");
  assert.equal(data.anexo.nome, "contrato.pdf");
  assert.equal(path.dirname(data.anexo.caminho), dir, "o temporario fica na pasta de midia do motor");
  assert.match(path.basename(data.anexo.caminho), /\.pdf$/);
  assert.equal(await readFile(data.anexo.caminho, "utf8"), "%PDF-1.4 conteudo");
  if (process.platform !== "win32") assert.equal((await stat(data.anexo.caminho)).mode & 0o777, 0o600);
  assert.deepEqual(registrations.map((r) => [r.waId, r.direcao, r.origem, r.texto]), [["P1", "recebida", "assistente", "@ia resume este contrato [documento: contrato.pdf]"]]);
});

test("imagem com @ia no proprio chat tambem e baixada", async (t) => {
  const { sock, ws } = await setup(t, { download: async () => Readable.from([Buffer.from("png")]) });
  emitUpsert(sock, { id: "I1", remoteJid: OWN, fromMe: true, message: image() });
  await waitFor(() => ws.messages.length === 1);
  const { anexo } = ws.messages[0].data;
  assert.equal(anexo.tipo, "imagem");
  assert.match(anexo.caminho, /\.png$/);
  assert.equal(await readFile(anexo.caminho, "utf8"), "png");
});

test("midia de terceiro, de grupo e do proprio chat sem @ia NUNCA e baixada", async (t) => {
  const { sock, ws, downloads, registrations, engine, dir } = await setup(t);
  emitUpsert(sock, { id: "T1", remoteJid: THIRD, message: pdf() });
  emitUpsert(sock, { id: "T2", remoteJid: THIRD, fromMe: true, message: image() });
  emitUpsert(sock, { id: "G1", remoteJid: GROUP_ID, message: pdf() });
  emitUpsert(sock, { id: "G2", remoteJid: GROUP_ID, fromMe: true, message: image() });
  emitUpsert(sock, { id: "N1", remoteJid: OWN, fromMe: true, message: pdf("anotacao sem comando") });
  emitUpsert(sock, { id: "N2", remoteJid: OWN, fromMe: true, message: image("") });
  emitUpsert(sock, { id: "H1", remoteJid: OWN, fromMe: true, message: pdf(), type: "append" });
  await pause(80);
  await engine.flush();
  assert.equal(downloads.length, 0);
  assert.equal(ws.messages.length, 0);
  assert.equal(registrations.length, 0);
  assert.equal(await exists(dir), false, "nem a pasta temporaria foi criada");
});

test("sem cliente conectado (assistente parado) nada e baixado", async (t) => {
  const dir = path.join(await makeTempDir(t), "midia-temp");
  const { engine, connect, downloads } = await startEngine({ mediaDir: dir, downloadMedia: async () => Readable.from([Buffer.from("x")]) });
  t.after(() => engine.shutdown());
  const sock = await connect();
  emitUpsert(sock, { id: "P1", remoteJid: OWN, fromMe: true, message: pdf() });
  await pause(60);
  assert.equal(downloads.length, 0);
});

test("o eco de um anexo que o proprio motor enviou nao e baixado", async (t) => {
  const { sock, call, ws, downloads } = await setup(t);
  const sent = await (await call("/send/poll", { method: "POST", body: { destino: OWN.split("@")[0], pergunta: "Oi?", opcoes: ["a", "b"] } })).json();
  emitUpsert(sock, { id: sent.id, remoteJid: OWN, fromMe: true, message: pdf() });
  await pause(60);
  assert.equal(downloads.length, 0);
  assert.equal(ws.messages.length, 0);
});

test("anexo grande demais (declarado ou no fluxo) vira erro e nao deixa arquivo", async (t) => {
  const huge = async function* () { for (let n = 0; n < 22; n += 1) yield Buffer.alloc(1024 * 1024, 1); };
  const { sock, ws, dir, downloads } = await setup(t, { download: async () => Readable.from(huge()) });
  emitUpsert(sock, { id: "D1", remoteJid: OWN, fromMe: true, message: pdf("@ia le", { fileLength: 21 * 1024 * 1024 }) });
  await waitFor(() => ws.messages.length === 1);
  assert.equal(downloads.length, 0, "tamanho declarado acima do limite nem comeca o download");
  assert.match(ws.messages[0].data.anexo.erro, /grande demais/);
  assert.equal(ws.messages[0].data.anexo.caminho, undefined);

  emitUpsert(sock, { id: "D2", remoteJid: OWN, fromMe: true, message: pdf("@ia le", { fileLength: 100 }) });
  await waitFor(() => ws.messages.length === 2);
  assert.equal(downloads.length, 1);
  assert.match(ws.messages[1].data.anexo.erro, /grande demais/);
  assert.deepEqual(await readdir(dir), [], "o arquivo parcial foi apagado");
});

test("falha no download vira erro no evento e o arquivo parcial some", async (t) => {
  const { sock, ws, dir, logs } = await setup(t, { download: async () => { throw new Error("midia expirou"); } });
  emitUpsert(sock, { id: "E1", remoteJid: OWN, fromMe: true, message: pdf() });
  await waitFor(() => ws.messages.length === 1);
  assert.deepEqual(ws.messages[0].data.anexo, { tipo: "pdf", erro: "midia expirou" });
  assert.deepEqual(await readdir(dir).catch(() => []), []);
  assert.ok(logs.some((line) => line.startsWith("MIDIA_ERRO=")));
});

test("video e documento que nao e PDF com @ia: avisa que so le PDF e imagem, sem baixar", async (t) => {
  const { sock, ws, downloads } = await setup(t);
  emitUpsert(sock, { id: "V1", remoteJid: OWN, fromMe: true, message: { videoMessage: { caption: "@ia veja", mimetype: "video/mp4" } } });
  emitUpsert(sock, { id: "V2", remoteJid: OWN, fromMe: true, message: { documentMessage: { caption: "@ia veja", mimetype: "application/zip", fileName: "a.zip" } } });
  await waitFor(() => ws.messages.length === 2);
  assert.equal(downloads.length, 0);
  for (const message of ws.messages) {
    assert.equal(message.data.anexo.tipo, "outro");
    assert.match(message.data.anexo.erro, /so consigo ler PDF e imagem/);
  }
});

test("audio (anotacao de voz) e ignorado em silencio, do proprio chat ou de terceiro", async (t) => {
  const { sock, ws, downloads } = await setup(t);
  emitUpsert(sock, { id: "A1", remoteJid: OWN, fromMe: true, message: { audioMessage: { ptt: true, seconds: 5 } } });
  emitUpsert(sock, { id: "A2", remoteJid: THIRD, message: { audioMessage: { ptt: true } } });
  emitUpsert(sock, { id: "A3", remoteJid: GROUP_ID, message: { audioMessage: { ptt: true } } });
  emitUpsert(sock, { id: "T1", remoteJid: OWN, fromMe: true, message: { conversation: "@ia depois do audio" } });
  await waitFor(() => ws.messages.length >= 1);
  await pause(40);
  assert.deepEqual(ws.messages.map((m) => m.data.id), ["T1"]);
  assert.equal(downloads.length, 0);
});

test("sem pasta de midia configurada o motor nao baixa nada e diz isso", async (t) => {
  const harness = await startEngine({ downloadMedia: async () => Readable.from([Buffer.from("x")]) });
  t.after(() => harness.engine.shutdown());
  const sock = await harness.connect();
  const ws = openClient(harness.port);
  t.after(() => ws.client.close());
  await ws.opened;
  emitUpsert(sock, { id: "P1", remoteJid: OWN, fromMe: true, message: pdf() });
  await waitFor(() => ws.messages.length === 1);
  assert.match(ws.messages[0].data.anexo.erro, /nao esta preparado/);
  assert.equal(harness.downloads.length, 0);
});

test("temporarios esquecidos ha mais de 1 hora sao varridos no proximo download", async (t) => {
  const { sock, ws, dir } = await setup(t);
  emitUpsert(sock, { id: "P1", remoteJid: OWN, fromMe: true, message: pdf() });
  await waitFor(() => ws.messages.length === 1);
  const stale = path.join(dir, "esquecido.pdf");
  const fresh = path.join(dir, "recente.pdf");
  await writeFile(stale, "x");
  await writeFile(fresh, "x");
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(stale, old, old);
  emitUpsert(sock, { id: "P2", remoteJid: OWN, fromMe: true, message: pdf() });
  await waitFor(() => ws.messages.length === 2);
  assert.equal(await exists(stale), false);
  assert.equal(await exists(fresh), true);
});
