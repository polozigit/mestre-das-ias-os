// Motor de teste com socket Baileys falso (nao e um teste: o glob de `npm test` so pega *.test.mjs).
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { createEngine } from "../src/engine.mjs";

export const KEY = "chave-de-teste-do-motor";
export const OWN_USER = { id: "5511900000001:35@s.whatsapp.net", lid: "10000000000001:35@lid" };
export const GROUP_ID = "120363000000000000@g.us";
export const OTHER_GROUP_ID = "5511900000001-1600000000@g.us";

export const waitFor = async (condition, ms = 1000) => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("tempo esgotado esperando condicao");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
};
export const pause = (ms = 40) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

export function groupMetadata({ id = GROUP_ID, admin = true, extra = [] } = {}) {
  return {
    id,
    subject: "Equipe",
    desc: "Grupo da equipe",
    creation: 1790000000,
    size: 3 + extra.length,
    announce: false,
    restrict: true,
    participants: [
      { id: "5511900000001@s.whatsapp.net", admin: admin ? "admin" : null },
      { id: "5511911110001@s.whatsapp.net", admin: "superadmin" },
      { id: "10000000000077@lid", phoneNumber: "5511911110002@s.whatsapp.net", admin: null },
      ...extra,
    ],
  };
}

export function fakeSocket({ user = OWN_USER, overrides = {}, groups = {} } = {}) {
  const ev = new EventEmitter();
  const sock = {
    ev,
    user,
    ended: false,
    sent: [],
    calls: [],
    end() { sock.ended = true; },
    async logout() {},
    async sendMessage(jid, content) {
      sock.sent.push({ jid, content });
      return { key: { id: `WAID${sock.sent.length}`, remoteJid: jid, fromMe: true } };
    },
    async onWhatsApp(...numbers) {
      sock.calls.push(["onWhatsApp", ...numbers]);
      return [{ jid: `${numbers[0]}@s.whatsapp.net`, exists: true }];
    },
    async groupFetchAllParticipating() {
      sock.calls.push(["groupFetchAllParticipating"]);
      return groups.all || { [GROUP_ID]: groupMetadata(), [OTHER_GROUP_ID]: { ...groupMetadata({ id: OTHER_GROUP_ID, admin: false }), subject: "Antigo" } };
    },
    async groupMetadata(id) {
      sock.calls.push(["groupMetadata", id]);
      return groups.meta || groupMetadata({ id });
    },
    async groupCreate(subject, participants) {
      sock.calls.push(["groupCreate", subject, participants]);
      return { id: GROUP_ID, subject, participants: participants.map((id) => ({ id })) };
    },
    async groupUpdateSubject(id, subject) { sock.calls.push(["groupUpdateSubject", id, subject]); },
    async groupUpdateDescription(id, description) { sock.calls.push(["groupUpdateDescription", id, description]); },
    async groupSettingUpdate(id, setting) { sock.calls.push(["groupSettingUpdate", id, setting]); },
    async groupParticipantsUpdate(id, participants, action) {
      sock.calls.push(["groupParticipantsUpdate", id, participants, action]);
      return participants.map((jid) => ({ status: "200", jid }));
    },
    async groupInviteCode(id) { sock.calls.push(["groupInviteCode", id]); return "CODIGOATUAL"; },
    async groupRevokeInvite(id) { sock.calls.push(["groupRevokeInvite", id]); return "CODIGONOVO"; },
    async groupLeave(id) { sock.calls.push(["groupLeave", id]); },
    ...overrides,
  };
  return sock;
}

export async function startEngine({ hasSession = false, socketOptions, registro, mediaDir = null, stateDir = null, downloadMedia } = {}) {
  const sockets = [];
  const registrations = [];
  const statusUpdates = [];
  const logs = [];
  const downloads = [];
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
    mediaDir,
    stateDir,
    ...(downloadMedia ? { downloadMedia: (message, sock) => { downloads.push(message); return downloadMedia(message, sock); } } : {}),
  });
  const port = await engine.listen(0);
  const call = (route, { method = "GET", body, key = KEY } = {}) => fetch(`http://127.0.0.1:${port}${route}`, {
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
  return { engine, port, call, connect, sockets, registrations, statusUpdates, logs, control, downloads };
}

export function emitUpsert(sock, { id = "M1", remoteJid = "5511900000001@s.whatsapp.net", fromMe = false, message, type = "notify" } = {}) {
  sock.ev.emit("messages.upsert", { type, messages: [{ key: { id, remoteJid, fromMe }, message, messageTimestamp: 1790000000 }] });
}

export function openClient(port, token = KEY) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const messages = [];
  client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  return { client, messages, opened: new Promise((resolvePromise, reject) => { client.once("open", resolvePromise); client.once("error", reject); }) };
}

// Pasta temporaria real com arquivos de teste (apagada no fim do teste).
export async function makeTempDir(t, prefix = "polozi-wa-teste-") {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function makeFile(dir, name, content = "conteudo de teste") {
  const file = path.join(dir, name);
  await writeFile(file, content);
  return file;
}
