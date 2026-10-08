import crypto from "node:crypto";
import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WebSocketServer } from "ws";

import { commandFromText } from "./incoming-event.mjs";
import {
  assertOutsideRepository,
  getAuthDirectory,
  getEngineConfigFile,
  getEngineLogFile,
  getEnginePidFile,
  getLocalPort,
  getMediaTempDirectory,
  getStateDirectory,
  isInsideDirectory,
} from "./local-paths.mjs";
import { describeMedia, LIMITE_BYTES, limiteLegivel, marcador, MAX_LEGENDA, sanitizeFileName } from "./midia.mjs";
import { createRegistro } from "./registro-supabase.mjs";
import { DESTINO_MESSAGE, isGroupId, isPhone, validateTextMessage } from "./validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Valores de DisconnectReason / proto.WebMessageInfo.Status do baileys 7.0.0-rc14
// (versao cravada; um teste confere que continuam iguais).
const LOGGED_OUT = 401;
const RESTART_REQUIRED = 515;
const STATUS_ENTREGUE = new Set([3, "DELIVERY_ACK"]);
const STATUS_LIDA = new Set([4, 5, "READ", "PLAYED"]);

const MAX_BODY_BYTES = 64 * 1024;
const SEND_TIMEOUT_MS = 30 * 1000;
const MEDIA_SEND_TIMEOUT_MS = 120 * 1000;
const GROUP_TIMEOUT_MS = 30 * 1000;
const MAX_REGISTRO_TEXT = 4096;
const MAX_PARTICIPANTS = 256;
const PARTICIPANT_BATCH = 50;
// Midia recebida (so do proprio chat, com @ia na legenda): limite e validade do temporario.
const MAX_INCOMING_BYTES = 20 * 1024 * 1024;
const INCOMING_DOWNLOAD_TIMEOUT_MS = 60 * 1000;
const INCOMING_TTL_MS = 60 * 60 * 1000;
const PARTICIPANT_ACTIONS = ["add", "remove", "promote", "demote"];
const LOGOUT_TIMEOUT_MS = 5 * 1000;
const REMEMBERED_IDS = 500;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function userOf(jid) {
  return String(jid || "").split("@")[0].split(":")[0];
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function remember(set, value) {
  set.add(value);
  if (set.size > REMEMBERED_IDS) set.delete(set.values().next().value);
}

// Telefone e LID do proprio numero a partir de sock.user (o id pode vir em formato PN ou LID).
export function ownIdentity(user) {
  const id = String(user?.id || "");
  const isLid = id.includes("@lid");
  const phone = userOf(isLid ? user?.phoneNumber : id).replace(/\D/g, "");
  const lid = userOf(user?.lid || (isLid ? id : ""));
  return { phone: /^\d{10,15}$/.test(phone) ? phone : "", lid };
}

// Mensagens podem vir embrulhadas (temporaria, visualizacao unica, documento com legenda).
function unwrapContent(content) {
  let current = content;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const inner = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.documentWithCaptionMessage?.message;
    if (!inner) break;
    current = inner;
  }
  return current;
}

function toJid(number) {
  return `${number}@s.whatsapp.net`;
}

// Destino de envio: numero 55... ou id de grupo ...@g.us. `id` e o que vai pro registro (sem @).
function parseDestino(value) {
  if (isPhone(value)) return { jid: toJid(value), id: value, grupo: false };
  if (isGroupId(value)) return { jid: value, id: userOf(value), grupo: true };
  throw httpError(400, DESTINO_MESSAGE);
}

// O id do grupo vai na URL (/groups/<id>): aceita com ou sem o sufixo @g.us.
function normalizeGroupId(raw) {
  let value = "";
  try {
    value = decodeURIComponent(String(raw || ""));
  } catch {}
  if (/^(\d{16,30}|\d{8,15}-\d{5,12})$/.test(value)) value += "@g.us";
  if (!isGroupId(value)) throw httpError(400, "Id de grupo invalido: use o id terminado em @g.us (veja a lista de grupos).");
  return value;
}

function phoneList(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw httpError(400, `Informe ao menos um numero em ${label}.`);
  if (value.length > MAX_PARTICIPANTS) throw httpError(400, `No maximo ${MAX_PARTICIPANTS} numeros por pedido em ${label}.`);
  const unique = [...new Set(value.map((item) => String(item)))];
  for (const phone of unique) {
    if (!isPhone(phone)) throw httpError(400, `Numero invalido em ${label}: ${phone}. Use DDI 55, DDD e numero, somente digitos.`);
  }
  return unique;
}

function requiredText(value, label, max) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, `Informe ${label}.`);
  if (value.trim().length > max) throw httpError(400, `${label} passa de ${max} caracteres.`);
  return value.trim();
}

function mapWhatsAppError(error) {
  if (error?.status) return error;
  const code = Number(error?.output?.statusCode);
  if (code === 401 || code === 403) return httpError(403, "O WhatsApp recusou: so administrador do grupo pode fazer isso (ou voce nao participa dele).");
  if (code === 404) return httpError(404, "Grupo nao encontrado, ou voce nao participa dele.");
  return httpError(502, error?.message || "O WhatsApp nao concluiu a operacao.");
}

function numberOfLong(value) {
  const number = Number(value?.toNumber?.() ?? value);
  return Number.isFinite(number) ? number : 0;
}

export async function sessionSaved(authDir) {
  try {
    const creds = JSON.parse(await readFile(path.join(authDir, "creds.json"), "utf8"));
    return Boolean(creds?.me);
  } catch {
    return false;
  }
}

export function createEngine({
  apiKey,
  authDir,
  openSocket,
  registro,
  log = () => {},
  hasSession = () => sessionSaved(authDir),
  clearAuth = async () => {
    await rm(authDir, { recursive: true, force: true });
    await mkdir(authDir, { recursive: true, mode: 0o700 });
  },
  onShutdown = () => {},
  reconnectDelayMs = (attempt) => Math.min(30000, 1000 * 2 ** attempt),
  statusRetryMs = 2000,
  // Pasta de estado (auth/ e motor.json moram nela: nunca saem como anexo) e pasta temporaria
  // da midia recebida. Sem mediaDir o motor nao baixa midia nenhuma.
  stateDir = null,
  mediaDir = null,
  downloadMedia = async () => { throw new Error("download de midia indisponivel"); },
}) {
  const expected = crypto.createHash("sha256").update(String(apiKey)).digest();
  const state = { connected: false, loggedIn: false, ownPhone: "", ownLid: "", qr: null };
  const sentIds = new Set();
  const seenStatus = new Set();
  const pending = new Set();
  const registering = new Map(); // wa_id -> registro em andamento (recibo espera o registro concluir)
  let sock = null;
  let generation = 0;
  let savePromise = Promise.resolve();
  let reconnectTimer = null;
  let attempt = 0;
  let stopping = false;
  let httpServer = null;

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (client) => client.on("error", () => {}));

  // Comparacao em tempo constante (hash de tamanho fixo + timingSafeEqual).
  function authorized(value) {
    const received = crypto.createHash("sha256").update(String(value ?? "")).digest();
    return crypto.timingSafeEqual(received, expected);
  }

  function track(promise) {
    const safe = Promise.resolve(promise).catch(() => {});
    pending.add(safe);
    safe.then(() => pending.delete(safe));
  }

  function broadcast(event) {
    if (wss.clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const client of wss.clients) if (client.readyState === 1) client.send(payload);
  }

  function isOwnChat(jid) {
    const user = userOf(jid);
    return Boolean(user) && (user === state.ownPhone || user === state.ownLid);
  }

  async function startSocket() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const myGeneration = ++generation;
    await savePromise;
    const { sock: next, saveCreds } = await openSocket(authDir);
    if (myGeneration !== generation) {
      await Promise.resolve(next.end(undefined)).catch(() => {});
      return;
    }
    sock = next;
    next.ev.on("creds.update", () => {
      savePromise = savePromise.then(() => saveCreds()).catch((error) => log(`CREDS_SAVE_ERRO=${error.message}`));
    });
    next.ev.on("connection.update", (update) => void onConnectionUpdate(myGeneration, update));
    next.ev.on("messages.upsert", (event) => onUpsert(myGeneration, event));
    next.ev.on("messages.update", (updates) => onStatusUpdates(myGeneration, updates));
  }

  async function dropSocket() {
    const old = sock;
    sock = null;
    generation++;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    state.connected = false;
    state.loggedIn = false;
    state.qr = null;
    if (old) await Promise.resolve(old.end(undefined)).catch(() => {});
  }

  async function resetSession(reason) {
    await dropSocket();
    state.ownPhone = "";
    state.ownLid = "";
    await clearAuth();
    log(`SESSAO_LIMPA=${reason}`);
  }

  function scheduleReconnect() {
    const delay = reconnectDelayMs(attempt++);
    log(`RECONEXAO_EM_MS=${delay}`);
    reconnectTimer = setTimeout(() => {
      startSocket().catch((error) => {
        log(`RECONEXAO_ERRO=${error.message}`);
        if (!stopping) scheduleReconnect();
      });
    }, delay);
    reconnectTimer.unref?.();
  }

  async function onConnectionUpdate(myGeneration, update) {
    if (myGeneration !== generation) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) state.qr = qr;

    if (connection === "open") {
      const identity = ownIdentity(sock?.user);
      state.connected = true;
      state.loggedIn = Boolean(sock?.user);
      state.ownPhone = identity.phone || state.ownPhone;
      state.ownLid = identity.lid || state.ownLid;
      state.qr = null;
      attempt = 0;
      log("CONEXAO=ABERTA");
      return;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      state.connected = false;
      state.loggedIn = false;
      state.qr = null;
      log(`CONEXAO=FECHADA codigo=${code ?? "desconhecido"}`);
      if (stopping) return;
      try {
        if (code === LOGGED_OUT) {
          await resetSession("encerrada pelo celular; aguardando novo pareamento");
        } else if (code === RESTART_REQUIRED) {
          // Normal logo apos parear: o WhatsApp pede para reabrir a conexao.
          await dropSocket();
          await startSocket();
        } else {
          await savePromise;
          if (await hasSession()) scheduleReconnect();
          else log("PAREAMENTO_NAO_CONCLUIDO=aguardando POST /pair");
        }
      } catch (error) {
        log(`CONEXAO_ERRO=${error.message}`);
        if (!stopping) scheduleReconnect();
      }
    }
  }

  function registerOwnCommand({ id, text, message }) {
    const seconds = Number(message.messageTimestamp?.toNumber?.() ?? message.messageTimestamp);
    track(registro.registrarMensagem({
      waId: id,
      direcao: "recebida",
      telefone: state.ownPhone,
      texto: text.slice(0, MAX_REGISTRO_TEXT),
      origem: "assistente",
      status: "recebida",
      ocorridaEm: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
    }));
  }

  // Apaga temporarios esquecidos (assistente fora do ar na hora da resposta).
  async function sweepMediaDir() {
    if (!mediaDir) return;
    for (const name of await readdir(mediaDir).catch(() => [])) {
      const file = path.join(mediaDir, name);
      const info = await stat(file).catch(() => null);
      if (info && Date.now() - info.mtimeMs > INCOMING_TTL_MS) await rm(file, { force: true }).catch(() => {});
    }
  }

  // Baixa o anexo do proprio chat para um arquivo temporario (0600) com limite de tamanho.
  async function downloadAttachment(message, media, tipo, extensao) {
    const declared = numberOfLong(media?.fileLength);
    if (declared > MAX_INCOMING_BYTES) throw new Error(`arquivo grande demais (limite ${MAX_INCOMING_BYTES / 1024 / 1024} MB)`);
    await mkdir(mediaDir, { recursive: true, mode: 0o700 });
    await sweepMediaDir();
    const file = path.join(mediaDir, `${crypto.randomUUID()}${extensao}`);
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        done(bytes > MAX_INCOMING_BYTES ? new Error(`arquivo grande demais (limite ${MAX_INCOMING_BYTES / 1024 / 1024} MB)`) : null, chunk);
      },
    });
    try {
      const stream = await withTimeout(Promise.resolve(downloadMedia(message, sock)), INCOMING_DOWNLOAD_TIMEOUT_MS, "o download do anexo demorou demais");
      await withTimeout(pipeline(stream, limiter, createWriteStream(file, { mode: 0o600 })), INCOMING_DOWNLOAD_TIMEOUT_MS, "o download do anexo demorou demais");
    } catch (error) {
      await rm(file, { force: true }).catch(() => {});
      throw error;
    }
    return { tipo, caminho: file, nome: sanitizeFileName(media?.fileName) || path.basename(file) };
  }

  // Anexo do PROPRIO chat. So PDF e imagem com @ia na legenda sao baixados. Audio nao tem
  // legenda e e anotacao de voz: ignorado em silencio (transcricao fora do plano por assinatura).
  // Sem cliente conectado (assistente parado) nada e baixado: ninguem para responder.
  async function receiveAttachment(myGeneration, message, content, id, remoteJid) {
    if (wss.clients.size === 0) return;
    const fromMe = message.key.fromMe === true;
    if (content?.audioMessage) return;
    const document = content?.documentMessage;
    const image = content?.imageMessage;
    const media = document || image || content?.videoMessage;
    const caption = String(media?.caption || "");
    // Anexo sem @ia e anotacao: nao baixa e nao responde.
    if (!media || !commandFromText(caption)) return;

    const isPdf = Boolean(document) && (document.mimetype === "application/pdf" || /\.pdf$/i.test(document.fileName || ""));
    const tipo = isPdf ? "pdf" : image ? "imagem" : "";
    let anexo;
    if (!tipo || !mediaDir) {
      anexo = { tipo: tipo || "outro", erro: tipo ? "este computador nao esta preparado para receber arquivos" : "so consigo ler PDF e imagem" };
    } else {
      try {
        const extensao = isPdf ? ".pdf" : image.mimetype === "image/png" ? ".png" : image.mimetype === "image/webp" ? ".webp" : ".jpg";
        anexo = await downloadAttachment(message, media, tipo, extensao);
      } catch (error) {
        log(`MIDIA_ERRO=${String(error.message).slice(0, 200)}`);
        anexo = { tipo, erro: String(error.message).slice(0, 200) };
      }
    }
    if (myGeneration !== generation) {
      if (anexo.caminho) await rm(anexo.caminho, { force: true }).catch(() => {});
      return;
    }
    broadcast({ event: "message", data: { id, remoteJid, fromMe, text: caption, anexo } });
    const marker = tipo === "pdf" ? marcador("document", sanitizeFileName(document.fileName) || "arquivo.pdf") : tipo === "imagem" ? marcador("image") : "";
    registerOwnCommand({ id, text: `${caption} ${marker}`.trim(), message });
  }

  function onUpsert(myGeneration, { messages, type }) {
    if (myGeneration !== generation || type !== "notify") return;
    for (const message of messages || []) {
      const remoteJid = message?.key?.remoteJid;
      // Mensagem de terceiro nunca sai daqui: nem WebSocket, nem registro, nem download de midia.
      if (!isOwnChat(remoteJid)) continue;
      const id = String(message.key.id || "");
      // Eco do que o proprio motor enviou nao volta pro WebSocket (o assistente nao responde a si mesmo).
      if (id && sentIds.has(id)) continue;
      const content = unwrapContent(message.message);
      const text = content?.conversation || content?.extendedTextMessage?.text || "";
      if (!text) {
        track(receiveAttachment(myGeneration, message, content, id, remoteJid).catch((error) => log(`MIDIA_ERRO=${String(error?.message).slice(0, 200)}`)));
        continue;
      }
      broadcast({ event: "message", data: { id, remoteJid, fromMe: message.key.fromMe === true, text } });
      if (id && commandFromText(text)) registerOwnCommand({ id, text, message });
    }
  }

  // O recibo so e aplicado depois que o registro da mensagem terminou; se o banco ainda
  // nao conhece o id (false), tenta mais uma vez. Tudo em memoria, nada em disco.
  async function applyStatus(id, status) {
    await registering.get(id);
    if (await registro.atualizarStatus(id, status) !== false) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, statusRetryMs));
    await registro.atualizarStatus(id, status);
  }

  function onStatusUpdates(myGeneration, updates) {
    if (myGeneration !== generation) return;
    for (const { key, update } of updates || []) {
      // So recibo de mensagem que o proprio motor enviou vai pro banco; o resto nem e consultado.
      if (key?.fromMe !== true || !key.id || !sentIds.has(key.id)) continue;
      const status = STATUS_LIDA.has(update?.status) ? "lida" : STATUS_ENTREGUE.has(update?.status) ? "entregue" : "";
      if (!status || seenStatus.has(`${key.id}:${status}`)) continue;
      remember(seenStatus, `${key.id}:${status}`);
      track(applyStatus(key.id, status));
    }
  }

  function requireConnected() {
    if (!sock || !state.connected || !state.loggedIn) throw httpError(409, "sessao nao conectada");
  }

  // Envio com registro: toda mensagem que sai (texto, midia, enquete; numero ou grupo) entra em
  // whatsapp_mensagem com o id do WhatsApp; falha entra como `falhou`. O registro nunca derruba o envio.
  async function deliver({ target, content, texto, origem, timeoutMs = SEND_TIMEOUT_MS }) {
    requireConnected();
    const registroTexto = texto.slice(0, MAX_REGISTRO_TEXT);
    try {
      const sent = await withTimeout(sock.sendMessage(target.jid, content), timeoutMs, "O WhatsApp nao confirmou o envio a tempo.");
      const id = sent?.key?.id;
      if (!id) throw new Error("O WhatsApp nao devolveu o id da mensagem.");
      remember(sentIds, id);
      const registration = Promise.resolve(registro.registrarMensagem({ waId: id, direcao: "enviada", telefone: target.id, texto: registroTexto, origem, status: "enviada" }))
        .catch(() => {})
        .finally(() => registering.delete(id));
      registering.set(id, registration);
      track(registration);
      return { id };
    } catch (error) {
      track(registro.registrarMensagem({
        waId: `falhou-${crypto.randomUUID()}`,
        direcao: "enviada",
        telefone: target.id,
        texto: registroTexto,
        origem,
        status: "falhou",
        erro: String(error.message).slice(0, 300),
      }));
      throw httpError(502, error.message);
    }
  }

  async function sendText({ destino, text, origem }) {
    try {
      validateTextMessage(destino, text);
    } catch (error) {
      throw httpError(400, error.message);
    }
    return deliver({ target: parseDestino(destino), content: { text }, texto: text, origem });
  }

  // O motor le o arquivo do disco e o manda: nunca o que guarda a sessao ou credenciais.
  async function assertFileAllowed(file) {
    const segments = file.split(/[\\/]/).map((segment) => segment.toLowerCase());
    if (segments.includes("credenciais") || path.basename(file).toLowerCase().startsWith(".env")) {
      throw httpError(400, "Esse arquivo e de credenciais e nao pode ser enviado pelo WhatsApp.");
    }
    if (stateDir && isInsideDirectory(await realpath(stateDir).catch(() => stateDir), file)) {
      throw httpError(400, "Esse arquivo guarda a sessao do WhatsApp deste computador e nao pode ser enviado.");
    }
  }

  async function sendMedia({ destino, caminho, tipo, legenda, nomeArquivo, origem }) {
    const target = parseDestino(destino);
    if (typeof caminho !== "string" || !caminho.trim()) throw httpError(400, "Informe o caminho do arquivo.");
    let spec;
    try {
      spec = describeMedia(tipo, caminho);
    } catch (error) {
      throw httpError(400, error.message);
    }
    let file;
    try {
      file = await realpath(path.resolve(caminho));
    } catch {
      throw httpError(400, `Arquivo nao encontrado: ${caminho}`);
    }
    await assertFileAllowed(file);
    const info = await stat(file);
    if (!info.isFile()) throw httpError(400, `O caminho nao e um arquivo: ${caminho}`);
    if (info.size === 0) throw httpError(400, "O arquivo esta vazio.");
    if (info.size > LIMITE_BYTES[tipo]) {
      throw httpError(400, `Arquivo grande demais (${(info.size / 1024 / 1024).toFixed(1)} MB). Limite para ${tipo}: ${limiteLegivel(tipo)}.`);
    }
    if (legenda !== undefined && legenda !== null) {
      if (typeof legenda !== "string") throw httpError(400, "A legenda precisa ser texto.");
      if (tipo === "audio" || tipo === "voice") throw httpError(400, "Audio e nota de voz nao tem legenda. Envie a legenda como uma mensagem de texto.");
      if (legenda.length > MAX_LEGENDA) throw httpError(400, `A legenda passa de ${MAX_LEGENDA} caracteres.`);
    }
    const caption = typeof legenda === "string" && legenda.trim() ? legenda.trim() : undefined;
    const fileName = sanitizeFileName(nomeArquivo) || sanitizeFileName(path.basename(file)) || "arquivo";

    let content;
    if (tipo === "image") content = { image: { url: file }, mimetype: spec.mimetype, ...(caption ? { caption } : {}) };
    else if (tipo === "video") content = { video: { url: file }, mimetype: spec.mimetype, ...(caption ? { caption } : {}) };
    else if (tipo === "audio") content = { audio: { url: file }, mimetype: spec.mimetype };
    else if (tipo === "voice") content = { audio: { url: file }, mimetype: spec.mimetype, ptt: true };
    else content = { document: { url: file }, mimetype: spec.mimetype, fileName, ...(caption ? { caption } : {}) };

    return deliver({ target, content, texto: caption || marcador(tipo, fileName), origem, timeoutMs: MEDIA_SEND_TIMEOUT_MS });
  }

  async function sendPoll({ destino, pergunta, opcoes, multipla, origem }) {
    const target = parseDestino(destino);
    const question = requiredText(pergunta, "a pergunta da enquete", 255);
    if (!Array.isArray(opcoes) || opcoes.length < 2 || opcoes.length > 12) throw httpError(400, "A enquete precisa de 2 a 12 opcoes.");
    const values = opcoes.map((option) => requiredText(option, "cada opcao da enquete", 100));
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) throw httpError(400, "As opcoes da enquete nao podem se repetir.");
    return deliver({
      target,
      content: { poll: { name: question, values, selectableCount: multipla === true ? 0 : 1 } },
      texto: `[enquete: ${question}]`,
      origem,
    });
  }

  async function sendReact({ destino, id, emoji, deMim, participante }) {
    const target = parseDestino(destino);
    if (typeof id !== "string" || !/^[A-Za-z0-9_.-]{4,128}$/.test(id)) throw httpError(400, "Informe o id da mensagem que recebe a reacao.");
    if (typeof emoji !== "string" || [...new Intl.Segmenter().segment(emoji)].length > 1) throw httpError(400, "Informe um unico emoji (texto vazio remove a reacao).");
    const fromMe = deMim === true || sentIds.has(id);
    const key = { remoteJid: target.jid, id, fromMe };
    if (!fromMe && target.grupo) {
      if (!isPhone(participante)) throw httpError(400, "Em grupo, informe o numero (55...) de quem enviou a mensagem em participante.");
      key.participant = toJid(participante);
    }
    requireConnected();
    try {
      const sent = await withTimeout(sock.sendMessage(target.jid, { react: { text: emoji, key } }), SEND_TIMEOUT_MS, "O WhatsApp nao confirmou a reacao a tempo.");
      return { id: sent?.key?.id || "" };
    } catch (error) {
      throw httpError(502, error.message);
    }
  }

  async function checkNumber(raw) {
    const numero = String(raw || "");
    if (!isPhone(numero)) throw httpError(400, "Use telefone brasileiro com DDI 55, DDD e numero, somente digitos.");
    requireConnected();
    try {
      const found = await withTimeout(Promise.resolve(sock.onWhatsApp(numero)), SEND_TIMEOUT_MS, "O WhatsApp nao respondeu a tempo.");
      const first = Array.isArray(found) ? found[0] : undefined;
      return { numero, existe: first?.exists === true, jid: first?.jid ? userOf(first.jid) : "" };
    } catch (error) {
      throw httpError(502, error.message);
    }
  }

  // ---- Grupos ----------------------------------------------------------------------------------

  async function groupCall(fn) {
    requireConnected();
    try {
      return await withTimeout(Promise.resolve(fn()), GROUP_TIMEOUT_MS, "O WhatsApp nao respondeu a tempo.");
    } catch (error) {
      throw mapWhatsAppError(error);
    }
  }

  function isMe(participant) {
    const users = [participant?.id, participant?.phoneNumber, participant?.lid].map(userOf).filter(Boolean);
    return users.some((user) => (state.ownPhone && user === state.ownPhone) || (state.ownLid && user === state.ownLid));
  }

  function iAmAdmin(meta) {
    return (meta?.participants || []).some((participant) => isMe(participant) && participant.admin);
  }

  const groupSummary = (meta) => ({
    id: meta.id,
    nome: meta.subject || "",
    participantes: meta.size ?? (meta.participants || []).length,
    souAdmin: iAmAdmin(meta),
  });

  function groupDetails(meta) {
    return {
      ...groupSummary(meta),
      descricao: meta.desc || "",
      criadoEm: meta.creation ? new Date(meta.creation * 1000).toISOString() : "",
      soAdminEnvia: meta.announce === true,
      soAdminEdita: meta.restrict === true,
      membros: (meta.participants || []).map((participant) => ({
        id: userOf(participant.id),
        numero: userOf(participant.phoneNumber || (String(participant.id).includes("@lid") ? "" : participant.id)),
        admin: participant.admin || null,
      })),
    };
  }

  async function listGroups() {
    const all = await groupCall(() => sock.groupFetchAllParticipating());
    const groups = Object.values(all || {}).map(groupSummary);
    groups.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { grupos: groups };
  }

  const groupInfo = async (id) => groupDetails(await groupCall(() => sock.groupMetadata(id)));

  async function createGroup({ nome, participantes }) {
    const subject = requiredText(nome, "o nome do grupo", 100);
    const numbers = phoneList(participantes, "participantes");
    const meta = await groupCall(() => sock.groupCreate(subject, numbers.map(toJid)));
    return { id: meta.id, nome: meta.subject || subject, participantes: (meta.participants || []).length };
  }

  async function updateSubject(id, { nome }) {
    const subject = requiredText(nome, "o novo nome do grupo", 100);
    await groupCall(() => sock.groupUpdateSubject(id, subject));
    return { ok: true };
  }

  async function updateDescription(id, { descricao }) {
    if (typeof descricao !== "string") throw httpError(400, "Informe a descricao (texto vazio apaga a descricao).");
    if (descricao.length > 2048) throw httpError(400, "A descricao passa de 2048 caracteres.");
    await groupCall(() => sock.groupUpdateDescription(id, descricao.trim() || undefined));
    return { ok: true };
  }

  async function updateSettings(id, { soAdminEnvia, soAdminEdita }) {
    const send = soAdminEnvia;
    const edit = soAdminEdita;
    if (send === undefined && edit === undefined) throw httpError(400, "Informe soAdminEnvia e/ou soAdminEdita (true ou false).");
    if ((send !== undefined && typeof send !== "boolean") || (edit !== undefined && typeof edit !== "boolean")) throw httpError(400, "soAdminEnvia e soAdminEdita precisam ser true ou false.");
    if (send !== undefined) await groupCall(() => sock.groupSettingUpdate(id, send ? "announcement" : "not_announcement"));
    if (edit !== undefined) await groupCall(() => sock.groupSettingUpdate(id, edit ? "locked" : "unlocked"));
    return { ok: true };
  }

  async function updateParticipants(id, { acao, participantes }) {
    if (!PARTICIPANT_ACTIONS.includes(acao)) throw httpError(400, `Acao invalida. Use: ${PARTICIPANT_ACTIONS.join(", ")}.`);
    const numbers = phoneList(participantes, "participantes");
    const results = await groupCall(() => sock.groupParticipantsUpdate(id, numbers.map(toJid), acao));
    const resultados = (results || []).map((item) => ({ participante: userOf(item.jid), status: String(item.status) }));
    return { acao, resultados, ok: resultados.filter((item) => item.status === "200").length, falhas: resultados.filter((item) => item.status !== "200").length };
  }

  const inviteLink = (code) => ({ codigo: code, link: `https://chat.whatsapp.com/${code}` });

  async function getInvite(id, { revoke }) {
    const code = await groupCall(() => (revoke ? sock.groupRevokeInvite(id) : sock.groupInviteCode(id)));
    if (!code) throw httpError(502, "O WhatsApp nao devolveu o link (so administrador consegue obter ou revogar).");
    return inviteLink(code);
  }

  async function leaveGroup(id) {
    await groupCall(() => sock.groupLeave(id));
    return { saiu: true };
  }

  // O WhatsApp nao tem "excluir grupo": exclui = remove todos os outros participantes e sai.
  // So quem e administrador consegue remover os outros; se sobrar alguem, o motor NAO sai.
  async function deleteGroup(id) {
    const meta = await groupCall(() => sock.groupMetadata(id));
    if (!iAmAdmin(meta)) throw httpError(403, "Voce nao e administrador deste grupo, entao nao da para exclui-lo. Se quiser, apenas saia do grupo.");
    const others = (meta.participants || []).filter((participant) => !isMe(participant));
    let removidos = 0;
    for (let start = 0; start < others.length; start += PARTICIPANT_BATCH) {
      const batch = others.slice(start, start + PARTICIPANT_BATCH).map((participant) => participant.id);
      const results = await groupCall(() => sock.groupParticipantsUpdate(id, batch, "remove"));
      removidos += (results || []).filter((item) => String(item.status) === "200").length;
    }
    const restantes = others.length - removidos;
    if (restantes > 0) {
      return { removidos, restantes, saiu: false, aviso: "Alguns participantes nao puderam ser removidos (por exemplo, o criador do grupo). Por isso voce nao saiu do grupo." };
    }
    await groupCall(() => sock.groupLeave(id));
    return { removidos, restantes: 0, saiu: true };
  }

  async function pair() {
    if (state.connected && state.loggedIn) return { already: true };
    await dropSocket();
    await startSocket();
    return { pairing: true };
  }

  async function logout() {
    const current = sock;
    if (current && state.loggedIn) {
      await withTimeout(Promise.resolve(current.logout()), LOGOUT_TIMEOUT_MS, "logout sem resposta").catch((error) => log(`LOGOUT_AVISO=${error.message}`));
    }
    await resetSession("logout pedido");
    return { ok: true };
  }

  async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw httpError(413, "corpo grande demais");
      chunks.push(chunk);
    }
    if (size === 0) return {};
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw httpError(400, "JSON invalido");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "O corpo precisa ser um objeto JSON");
    return body;
  }

  function reply(response, status, payload) {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(payload));
  }

  async function handle(request, response) {
    if (!authorized(request.headers.apikey)) return reply(response, 401, { error: "unauthorized" });
    const { pathname } = new URL(request.url, "http://127.0.0.1");
    const route = `${request.method} ${pathname}`;

    if (route === "GET /status") return reply(response, 200, { connected: state.connected, loggedIn: state.loggedIn, ownPhone: state.ownPhone, paired: await hasSession() });
    if (route === "GET /qr") {
      return state.qr ? reply(response, 200, { qr: state.qr }) : reply(response, 404, { error: "no QR code available" });
    }
    if (route === "POST /pair") return reply(response, 200, await pair());
    if (route === "POST /send/text") {
      const body = await readJsonBody(request);
      return reply(response, 200, await sendText({ destino: body.destino ?? body.number, text: body.text, origem: body.origem }));
    }
    if (route === "POST /send/media") return reply(response, 200, await sendMedia(await readJsonBody(request)));
    if (route === "POST /send/poll") return reply(response, 200, await sendPoll(await readJsonBody(request)));
    if (route === "POST /send/react") return reply(response, 200, await sendReact(await readJsonBody(request)));
    const check = pathname.match(/^\/check\/([^/]+)$/);
    if (request.method === "GET" && check) return reply(response, 200, await checkNumber(decodeURIComponent(check[1])));
    if (route === "GET /groups") return reply(response, 200, await listGroups());
    if (route === "POST /groups") return reply(response, 200, await createGroup(await readJsonBody(request)));
    const group = pathname.match(/^\/groups\/([^/]+)(?:\/(subject|description|settings|participants|invite|leave|delete))?$/);
    if (group) {
      const action = group[2] || "";
      const post = request.method === "POST";
      if (request.method === "GET" && !action) return reply(response, 200, await groupInfo(normalizeGroupId(group[1])));
      if (request.method === "GET" && action === "invite") return reply(response, 200, await getInvite(normalizeGroupId(group[1]), { revoke: false }));
      if (post && action === "invite") return reply(response, 200, await getInvite(normalizeGroupId(group[1]), { revoke: true }));
      if (post && action === "leave") return reply(response, 200, await leaveGroup(normalizeGroupId(group[1])));
      if (post && action === "delete") return reply(response, 200, await deleteGroup(normalizeGroupId(group[1])));
      if (post && action === "subject") return reply(response, 200, await updateSubject(normalizeGroupId(group[1]), await readJsonBody(request)));
      if (post && action === "description") return reply(response, 200, await updateDescription(normalizeGroupId(group[1]), await readJsonBody(request)));
      if (post && action === "settings") return reply(response, 200, await updateSettings(normalizeGroupId(group[1]), await readJsonBody(request)));
      if (post && action === "participants") return reply(response, 200, await updateParticipants(normalizeGroupId(group[1]), await readJsonBody(request)));
    }
    if (route === "POST /logout") return reply(response, 200, await logout());
    if (route === "POST /shutdown") {
      response.on("finish", () => setImmediate(() => void shutdown()));
      return reply(response, 200, { ok: true });
    }
    return reply(response, 404, { error: "not found" });
  }

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    await Promise.race([Promise.all(pending), new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))]);
    await dropSocket();
    for (const client of wss.clients) client.terminate();
    wss.close();
    httpServer?.closeAllConnections?.();
    await new Promise((resolvePromise) => (httpServer ? httpServer.close(resolvePromise) : resolvePromise()));
    await onShutdown();
  }

  return {
    address: () => httpServer?.address(),
    async listen(port, host = "127.0.0.1") {
      httpServer = createServer((request, response) => {
        handle(request, response).catch((error) => {
          if (response.headersSent) return response.end();
          reply(response, error.status || 500, { error: error.message || "erro interno" });
        });
      });
      httpServer.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url, "http://127.0.0.1");
        if (url.pathname !== "/ws" || !authorized(url.searchParams.get("token"))) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client, request));
      });
      await new Promise((resolvePromise, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          resolvePromise();
        });
      });
      return httpServer.address().port;
    },
    // Sobe o socket sozinho quando ja existe sessao salva; sem sessao, espera POST /pair.
    async start() {
      if (!(await hasSession())) return;
      await startSocket().catch((error) => {
        log(`INICIO_ERRO=${error.message}`);
        scheduleReconnect();
      });
    },
    shutdown,
    // Espera os registros no Supabase em andamento (usado por testes e no desligamento).
    async flush() {
      while (pending.size) await Promise.all(pending);
    },
    state,
  };
}

async function connectBaileys(authDir, logger) {
  // Import tardio: testes do motor usam socket falso e nao carregam o baileys.
  const { default: makeWASocket, useMultiFileAuthState } = await import("baileys");
  await mkdir(authDir, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  // Config padrao do baileys (sem browser/version: isso derrubou a conexao com 428 no spike).
  // markOnlineOnConnect=false evita silenciar as notificacoes do celular enquanto o motor roda.
  const sock = makeWASocket({ auth: state, logger, markOnlineOnConnect: false });
  return { sock, saveCreds };
}

async function main() {
  const stateDirectory = getStateDirectory();
  assertOutsideRepository(ROOT, stateDirectory);
  const log = (message) => console.error(`${new Date().toISOString()} ${message}`);

  let apiKey = "";
  try {
    apiKey = JSON.parse(await readFile(getEngineConfigFile(), "utf8")).apiKey;
  } catch {}
  if (!apiKey) {
    log("MOTOR_ERRO=motor.json ausente ou sem chave. Execute npm run setup.");
    process.exit(1);
  }

  const { default: pino } = await import("pino");
  // O Baileys loga jid/numero de terceiro em falha de decifracao: esses campos saem mascarados.
  const logger = pino({
    level: "warn",
    redact: { paths: ["key", "sender", "author", "jid", "node", "content", "participant", "remoteJid", "*.key", "*.jid", "*.remoteJid", "*.participant"], censor: "[oculto]" },
  }, pino.destination({ dest: getEngineLogFile(), sync: false, mkdir: true }));
  const engine = createEngine({
    apiKey,
    authDir: getAuthDirectory(),
    stateDir: stateDirectory,
    mediaDir: getMediaTempDirectory(),
    downloadMedia: async (message, socket) => {
      const { downloadMediaMessage } = await import("baileys");
      return downloadMediaMessage(message, "stream", {}, { logger, reuploadRequest: socket.updateMediaMessage });
    },
    openSocket: (authDir) => connectBaileys(authDir, logger),
    registro: createRegistro({ warn: (message) => log(`REGISTRO_AVISO=${message}`) }),
    log,
    onShutdown: async () => {
      await unlink(getEnginePidFile()).catch(() => {});
      process.exit(0);
    },
  });

  try {
    await engine.listen(getLocalPort());
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      log("MOTOR=ja em execucao ou porta ocupada; esta copia encerra.");
      process.exit(0);
    }
    throw error;
  }
  await writeFile(getEnginePidFile(), `${process.pid}\n`, { mode: 0o600 });
  log(`MOTOR=PRONTO pid=${process.pid}`);

  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void engine.shutdown());
  process.on("unhandledRejection", (error) => log(`REJEICAO_NAO_TRATADA=${error?.message || error}`));
  process.on("uncaughtException", (error) => {
    log(`ERRO_NAO_TRATADO=${error?.message || error}`);
    process.exit(1);
  });
  await engine.start();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`MOTOR_ERRO=${error.message}`);
    process.exit(1);
  });
}
