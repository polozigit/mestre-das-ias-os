import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync, renameSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getAuthDirectory,
  getBaseUrl,
  getEngineConfigFile,
  getEngineLogFile,
  getStateDirectory,
} from "./local-paths.mjs";
import { TIPOS } from "./midia.mjs";
import { isGroupId, isPhone, validateDestino, validateTextMessage } from "./validation.mjs";

export { validateTextMessage };

const ENGINE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "engine.mjs");
const MAX_LOG_BYTES = 2 * 1024 * 1024;

// Texto unico que o agente le e repete pro aluno quando o motor nao tem sessao conectada.
export const NOT_CONNECTED_MESSAGE = 'WhatsApp desconectado. Peca para a IA: "reconecta meu WhatsApp"';

export function isConnected(payload) {
  return payload?.connected === true && payload?.loggedIn === true;
}

export function ownPhone(payload) {
  const phone = String(payload?.ownPhone || "").replace(/\D/g, "");
  return /^\d{10,15}$/.test(phone) ? phone : "";
}

export async function readLocalConfig(environment = process.env) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(getEngineConfigFile(environment), "utf8"));
  } catch {
    throw new Error("Configuracao local ausente. Execute npm run setup.");
  }
  if (!parsed?.apiKey) throw new Error("Configuracao local incompleta: apiKey ausente. Execute npm run setup.");
  return { apiKey: parsed.apiKey, baseUrl: getBaseUrl(environment), stateDir: getStateDirectory(environment) };
}

// Cria motor.json (chave aleatoria 32 bytes hex, modo 0600) so se ainda nao existir.
export async function ensureEngineConfigFile(environment = process.env) {
  const stateDirectory = getStateDirectory(environment);
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(getAuthDirectory(environment), { recursive: true, mode: 0o700 });
  chmodSync(stateDirectory, 0o700);
  chmodSync(getAuthDirectory(environment), 0o700);
  const file = getEngineConfigFile(environment);
  try {
    if (JSON.parse(await readFile(file, "utf8"))?.apiKey) return { file, created: false };
  } catch {}
  await writeFile(file, `${JSON.stringify({ apiKey: crypto.randomBytes(32).toString("hex") }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return { file, created: true };
}

export function engineSocketUrl(config) {
  return `${config.baseUrl.replace("http", "ws")}/ws?token=${encodeURIComponent(config.apiKey)}`;
}

export async function requestEngine(config, pathname, {
  method = "GET",
  body,
  fetchImpl = fetch,
  timeoutMs = 10000,
} = {}) {
  const response = await fetchImpl(`${config.baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: config.apiKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(
      new Error(`Motor local respondeu ${response.status} em ${pathname}: ${payload.error || payload.message || "erro desconhecido"}`),
      { status: response.status },
    );
  }

  return payload;
}

export function getConnectionStatus(config, fetchImpl = fetch) {
  return requestEngine(config, "/status", { fetchImpl });
}

// Logo apos o motor subir (PC reiniciado) a sessao salva leva alguns segundos para
// reabrir. Com sessao pareada, espera conectar; sem sessao, devolve na hora.
export async function waitForConnection(config, { timeoutMs = 25000, intervalMs = 500, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  let status = await getConnectionStatus(config, fetchImpl);
  while (!isConnected(status) && status?.paired === true && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    status = await getConnectionStatus(config, fetchImpl);
  }
  return status;
}

export function startPairing(config, fetchImpl = fetch) {
  return requestEngine(config, "/pair", { method: "POST", body: {}, fetchImpl });
}

// QR cru (string) ou null quando o motor ainda nao gerou um.
export async function getLiveQr(config, fetchImpl = fetch) {
  try {
    return (await requestEngine(config, "/qr", { fetchImpl })).qr || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export function logout(config, fetchImpl = fetch) {
  return requestEngine(config, "/logout", { method: "POST", body: {}, fetchImpl, timeoutMs: 15000 });
}

// Toda chamada que mexe no WhatsApp espera a sessao reconectar e, sem sessao, devolve a instrucao de reconectar.
async function requestConnected(config, pathname, options = {}) {
  const { fetchImpl = fetch } = options;
  const status = await waitForConnection(config, { fetchImpl });
  if (!isConnected(status)) {
    throw new Error(NOT_CONNECTED_MESSAGE);
  }
  return requestEngine(config, pathname, { timeoutMs: 45000, ...options });
}

// `phone` aceita numero 55... ou id de grupo ...@g.us.
export async function sendText(config, phone, text, origem = "outro", fetchImpl = fetch) {
  validateTextMessage(phone, text);
  return requestConnected(config, "/send/text", {
    method: "POST",
    body: isGroupId(phone) ? { destino: phone, text, origem } : { number: phone, text, origem },
    fetchImpl,
  });
}

export async function sendMedia(config, { destino, caminho, tipo, legenda, nomeArquivo, origem = "outro" }, fetchImpl = fetch) {
  validateDestino(destino);
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo invalido. Use: ${TIPOS.join(", ")}.`);
  if (typeof caminho !== "string" || !caminho.trim()) throw new Error("Informe o caminho do arquivo.");
  return requestConnected(config, "/send/media", {
    method: "POST",
    // O motor roda no mesmo computador, mas em outra pasta: manda o caminho completo.
    body: { destino, caminho: path.resolve(caminho), tipo, ...(legenda ? { legenda } : {}), ...(nomeArquivo ? { nomeArquivo } : {}), origem },
    fetchImpl,
    timeoutMs: 150000,
  });
}

export function sendPoll(config, { destino, pergunta, opcoes, multipla = false, origem = "outro" }, fetchImpl = fetch) {
  validateDestino(destino);
  return requestConnected(config, "/send/poll", { method: "POST", body: { destino, pergunta, opcoes, multipla, origem }, fetchImpl });
}

export function sendReaction(config, { destino, id, emoji, deMim, participante }, fetchImpl = fetch) {
  validateDestino(destino);
  return requestConnected(config, "/send/react", {
    method: "POST",
    body: { destino, id, emoji, ...(deMim !== undefined ? { deMim } : {}), ...(participante ? { participante } : {}) },
    fetchImpl,
  });
}

export function checkNumber(config, numero, fetchImpl = fetch) {
  if (!isPhone(numero)) throw new Error("Use telefone brasileiro com DDI 55, DDD e numero, somente digitos.");
  return requestConnected(config, `/check/${numero}`, { fetchImpl });
}

function groupPath(grupo, suffix = "") {
  if (!isGroupId(grupo)) throw new Error("Id de grupo invalido: use o id terminado em @g.us (veja a lista de grupos).");
  return `/groups/${encodeURIComponent(grupo)}${suffix}`;
}

export const listGroups = (config, fetchImpl = fetch) => requestConnected(config, "/groups", { fetchImpl });
export const getGroup = (config, grupo, fetchImpl = fetch) => requestConnected(config, groupPath(grupo), { fetchImpl });
export const createGroup = (config, { nome, participantes }, fetchImpl = fetch) =>
  requestConnected(config, "/groups", { method: "POST", body: { nome, participantes }, fetchImpl });
export const updateGroupSubject = (config, grupo, nome, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/subject"), { method: "POST", body: { nome }, fetchImpl });
export const updateGroupDescription = (config, grupo, descricao, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/description"), { method: "POST", body: { descricao }, fetchImpl });
export const updateGroupSettings = (config, grupo, { soAdminEnvia, soAdminEdita }, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/settings"), {
    method: "POST",
    body: { ...(soAdminEnvia !== undefined ? { soAdminEnvia } : {}), ...(soAdminEdita !== undefined ? { soAdminEdita } : {}) },
    fetchImpl,
  });
export const updateGroupParticipants = (config, grupo, { acao, participantes }, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/participants"), { method: "POST", body: { acao, participantes }, fetchImpl, timeoutMs: 120000 });
export const getGroupInvite = (config, grupo, fetchImpl = fetch) => requestConnected(config, groupPath(grupo, "/invite"), { fetchImpl });
export const revokeGroupInvite = (config, grupo, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/invite"), { method: "POST", body: {}, fetchImpl });
export const leaveGroup = (config, grupo, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/leave"), { method: "POST", body: {}, fetchImpl });
// Excluir = remover todos os outros participantes e sair (pode demorar em grupo grande).
export const deleteGroup = (config, grupo, fetchImpl = fetch) =>
  requestConnected(config, groupPath(grupo, "/delete"), { method: "POST", body: {}, fetchImpl, timeoutMs: 300000 });

// "up": e o nosso motor; "down": nada escutando; "foreign": outro servico ou chave diferente.
export async function probeEngine(config, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${config.baseUrl}/status`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(1500),
    });
    const payload = await response.json().catch(() => null);
    return response.ok && typeof payload?.connected === "boolean" ? "up" : "foreign";
  } catch {
    return "down";
  }
}

// Abre o log em modo append (0600), girando para .1 quando passa de 2 MB.
export function openLogForAppend(logFile) {
  mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
  try {
    if (statSync(logFile).size > MAX_LOG_BYTES) renameSync(logFile, `${logFile}.1`);
  } catch {}
  return openSync(logFile, "a", 0o600);
}

function spawnEngine(environment, spawnImpl) {
  const logFd = openLogForAppend(getEngineLogFile(environment));
  try {
    // Sem shell: node direto, funciona igual em Windows e macOS. O motor escreve o proprio motor.pid.
    const child = spawnImpl(process.execPath, [ENGINE_PATH], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      env: environment,
    });
    child.on?.("error", () => {});
    child.unref();
  } finally {
    closeSync(logFd);
  }
}

// Garante que o motor esta no ar: se /status nao responde, sobe em background e espera ate ~15s.
export async function ensureEngine({
  environment = process.env,
  fetchImpl = fetch,
  spawnImpl = spawn,
  waitMs = 15000,
  pollMs = 250,
  sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
} = {}) {
  const config = await readLocalConfig(environment);
  const foreignMessage = `O que responde em ${config.baseUrl} nao e o motor local (porta ocupada ou chave diferente). Se for a pilha Docker antiga, execute npm run retire:evolution.`;

  let probe = await probeEngine(config, fetchImpl);
  if (probe === "up") return config;
  if (probe === "foreign") throw new Error(foreignMessage);

  spawnEngine(environment, spawnImpl);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    probe = await probeEngine(config, fetchImpl);
    if (probe === "up") return config;
    if (probe === "foreign") throw new Error(foreignMessage);
  }
  throw new Error(`O motor local nao respondeu em ${Math.round(waitMs / 1000)}s. Veja o log: ${getEngineLogFile(environment)}`);
}
